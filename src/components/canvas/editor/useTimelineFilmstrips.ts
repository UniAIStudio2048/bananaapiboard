
import { useEffect, useRef, useState } from 'react'
import type { VideoClip, VideoLayer } from './api'

export type Filmstrip = { image:string; count:number; interval:number; width:number; height:number; aspect:number; duration:number }
type Cached = { url:string; strip:Filmstrip }

function waitForVideo(video:HTMLVideoElement, event:'loadeddata'|'seeked', signal:AbortSignal, timeout:number, action:()=>void):Promise<void> {
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>finish(false),timeout)
  const finish=(ok:boolean)=>{clearTimeout(timer);video.removeEventListener(event,success);video.removeEventListener('error',failure);signal.removeEventListener('abort',failure);if(ok)resolve();else reject(new Error('filmstrip unavailable'))}
  const success=()=>finish(true),failure=()=>finish(false)
  if(signal.aborted){finish(false);return}
  video.addEventListener(event,success,{once:true});video.addEventListener('error',failure,{once:true});signal.addEventListener('abort',failure,{once:true});try{action()}catch{finish(false)}
 })
}

async function makeFilmstrip(url:string,signal:AbortSignal):Promise<Filmstrip> {
 const video=document.createElement('video');video.crossOrigin='anonymous';video.preload='auto';video.muted=true;video.playsInline=true
 try {
  await waitForVideo(video,'loadeddata',signal,15000,()=>{video.src=url;video.load()})
  if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth||!video.videoHeight)throw new Error('filmstrip metadata unavailable')
  const duration=video.duration,interval=Math.max(.2,duration/80),count=Math.min(80,Math.max(1,Math.floor(duration/interval))),height=96,width=Math.max(16,Math.min(256,Math.round(height*video.videoWidth/video.videoHeight)))
  const canvas=document.createElement('canvas');canvas.width=width*count;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('filmstrip unavailable')
  for(let index=0;index<count;index++) {
   if(signal.aborted)throw new Error('filmstrip cancelled')
   const time=Math.min(index*interval,Math.max(0,duration-.05))
   if(Math.abs(video.currentTime-time)>.01||video.readyState<2){await waitForVideo(video,'seeked',signal,5000,()=>{video.currentTime=time})}
   context.drawImage(video,index*width,0,width,height)
  }
  return {image:canvas.toDataURL('image/jpeg',.8),count,interval,width,height,aspect:video.videoWidth/video.videoHeight,duration}
 } finally {video.pause();video.removeAttribute('src');video.load()}
}

/** Decode once per authorized video within this editor; abort on close or source change. */
export function useTimelineFilmstrips(clips:VideoClip[], videos:VideoLayer[], urls:Record<string,string>) {
 const cache=useRef<Record<string,Cached>>({}),[strips,setStrips]=useState<Record<string,Filmstrip>>({})
 const ids=[...new Set([...clips.filter(clip=>clip.media_type!=='image').map(clip=>clip.resource_uuid),...videos.map(layer=>layer.resource_uuid)])].sort()
 const signature=JSON.stringify(ids.flatMap(id=>urls[id]?[[id,urls[id]]]:[]))
 useEffect(()=>{
  const sources=JSON.parse(signature) as [string,string][], controller=new AbortController(),next:Record<string,Filmstrip>={},pending:[string,string][]=[]
  const keep=new Set(sources.map(([id])=>id));for(const id of Object.keys(cache.current))if(!keep.has(id))delete cache.current[id]
  for(const [id,url] of sources){const existing=cache.current[id];if(existing?.url===url)next[id]=existing.strip;else pending.push([id,url])}
  queueMicrotask(()=>{if(!controller.signal.aborted)setStrips(next)});let cursor=0
  async function work(){while(cursor<pending.length&&!controller.signal.aborted){const [id,url]=pending[cursor++];try{const strip=await makeFilmstrip(url,controller.signal);if(controller.signal.aborted)return;cache.current[id]={url,strip};setStrips(previous=>({...previous,[id]:strip}))}catch{/* A missing or non-CORS source leaves the ordinary clip placeholder. */}}}
  void Promise.all([work(),work()]);return()=>controller.abort()
 },[signature])
 return strips
}
