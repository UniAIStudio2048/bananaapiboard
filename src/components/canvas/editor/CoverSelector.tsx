import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'
/* eslint-disable @next/next/no-img-element -- Signed asset URLs and temporary local previews must not go through the image optimizer. */
import { useEffect, useRef, useState } from 'react'
import { MediaButton, MediaModal } from './ui'
import { validateMediaUploadFile } from './media-upload'
import type { MediaProjectLibraryController } from '../media-project-library'
import type { EffectLayer, ImageLayer, TextLayer, VideoLayer, VideoCover, VisualEffect } from './api'
import { EffectComposition } from './EffectComposition'
import { useStillImage } from './useStillImage'
import type { BlendMode } from './blend-mode'

export type CoverTransform = { x:number; y:number; scale:number; rotation:number; opacity:number }
export function CoverFrameView({currentUrl,mediaType,sourceTime,transform,aspect,background,tail,videos,images,text,effects,baseEffects,baseBlend,urls,time}:{baseBlend?:BlendMode;currentUrl?:string;mediaType?:'video'|'image';sourceTime:number;transform:CoverTransform;aspect:number;background?:string;tail:boolean;videos:VideoLayer[];images:ImageLayer[];text:TextLayer[];effects?:EffectLayer[];baseEffects?:VisualEffect[];urls:Record<string,string>;time:number}) {
 const ref=useRef<HTMLVideoElement>(null),stillCurrentUrl=useStillImage(mediaType==='image'?currentUrl:undefined)
 useEffect(()=>{const v=ref.current;if(v&&v.readyState>=1&&Number.isFinite(sourceTime)) {try{v.currentTime=sourceTime}catch{/* Wait for metadata. */}}},[sourceTime,currentUrl])
 return <div className="relative h-full max-w-full overflow-hidden bg-black" style={{aspectRatio:aspect,backgroundColor:`#${background ?? '000000'}`}}>
  <EffectComposition background={background} baseBlend={baseBlend} baseEffects={baseEffects} baseTime={sourceTime} baseScale={transform.scale} videos={videos} images={images} text={text} effects={effects??[]} urls={urls} time={time} base={<>
   {!tail && mediaType==='image' && <img aria-label={translateUi('uiMessages.m863c4e0781df')} alt={translateUi('uiMessages.m863c4e0781df')} src={stillCurrentUrl} className="absolute inset-0 h-full w-full object-contain [image-orientation:none]" style={{transform:`translate(${transform.x*100}%, ${transform.y*100}%) rotate(${transform.rotation}deg) scale(${transform.scale})`,opacity:transform.opacity}} />}
   {!tail && mediaType!=='image' && <video ref={ref} aria-label={translateUi('uiMessages.m863c4e0781df')} src={currentUrl} preload="metadata" className="absolute inset-0 h-full w-full object-contain" style={{transform:`translate(${transform.x*100}%, ${transform.y*100}%) rotate(${transform.rotation}deg) scale(${transform.scale})`,opacity:transform.opacity}} onLoadedMetadata={e=>{try{e.currentTarget.currentTime=sourceTime}catch{/* Ignore an unavailable seek. */}}} />}
  </>} />
 </div>
}
export function CoverSelector({ cover, playhead, duration, fps, currentUrl, mediaType, sourceTime, transform, aspect, background, tail, videos, images, text, effects, baseEffects, baseBlend, urls, library, source, project, onSeek, onConfirm, onCancel, onError }: {
 baseBlend?:BlendMode; cover?: VideoCover; playhead:number; duration:number; fps:number; currentUrl?:string; mediaType?:'video'|'image'; sourceTime:number; transform:CoverTransform; aspect:number; background?:string; tail:boolean; videos:VideoLayer[]; images:ImageLayer[]; text:TextLayer[]; effects?:EffectLayer[]; baseEffects?:VisualEffect[]; urls:Record<string,string>; library?:MediaProjectLibraryController; source(project:string,id:string):Promise<string>; project:string; onSeek(time:number):void; onConfirm(cover:VideoCover):void; onCancel():void; onError(message:string):void
}) {
 const [tab,setTab]=useState<'frame'|'local'>(cover?.resource_uuid?'local':'frame')
 const [frameTime,setFrameTime]=useState(cover?.frame_time ?? Math.min(playhead,Math.max(0,duration-1/fps)))
 const [resource,setResource]=useState(cover?.resource_uuid)
 const [preview,setPreview]=useState('')
 const stillPreview=useStillImage(preview||undefined)
 const [uploading,setUploading]=useState(false)
 const [localError,setLocalError]=useState('')
 useEffect(()=>{let live=true;setPreview('');if(resource)void source(project,resource).then(url=>{if(live)setPreview(url)}).catch(()=>{if(live){setLocalError(translateUi('uiMessages.m7aed1561634b'));onError(translateUi('uiMessages.m7aed1561634b'))}});return()=>{live=false}},[resource,source,project,onError])
 async function upload(file?:File) {
  if(!file || !library)return
  setLocalError('')
  try { const item=validateMediaUploadFile(file);if(item.modality!=='image'||!/\.(png|jpe?g|webp|gif)$/i.test(item.file_name))throw new Error() } catch {setLocalError(translateUi('uiMessages.m93146eb36f44'));return}
  setUploading(true)
  try {const ok=await library.uploadAsset(file),id=library.getSnapshot().upload.resource_uuid;if(!ok||!id)throw new Error();setResource(id)} catch {setLocalError(translateUi('uiMessages.m2f5bd77bfb60'))} finally {setUploading(false)}
 }
 return <MediaModal open title={translateUi('uiMessages.mff63d7486226')} width={560} zIndex={10300} footer={null} mask={{closable:false}} onCancel={()=>{if(!uploading)onCancel()}}>
  <div className="grid gap-4 text-sm text-zinc-100">
   {localError && <p role="alert" className="text-red-300">{localError}</p>}
   <div role="tablist" aria-label={translateUi('uiMessages.m08be3c5a07c2')} className="flex gap-2"><button role="tab" aria-selected={tab==='frame'} type="button" className={`rounded px-3 py-2 ${tab==='frame'?'bg-[var(--mf-brand)]/20 text-[var(--mf-brand)]':'bg-white/5'}`} onClick={()=>setTab('frame')}>{translateUi('uiMessages.m2318bdeb3a9a')}</button><button role="tab" aria-selected={tab==='local'} type="button" className={`rounded px-3 py-2 ${tab==='local'?'bg-[var(--mf-brand)]/20 text-[var(--mf-brand)]':'bg-white/5'}`} onClick={()=>setTab('local')}>{translateUi('uiMessages.mbf4ad761840f')}</button></div>
   {tab==='frame' ? <><div className="flex h-56 items-center justify-center rounded-lg bg-black p-2"><CoverFrameView baseBlend={baseBlend} currentUrl={currentUrl} background={background} mediaType={mediaType} sourceTime={sourceTime} transform={transform} aspect={aspect} tail={tail} videos={videos} images={images} text={text} effects={effects} baseEffects={baseEffects} urls={urls} time={frameTime} /></div><label className="grid gap-2 text-xs text-zinc-400">{translateUi('uiMessages.m80fee1f4ed93', { value1: (frameTime.toFixed(2)) })}<input aria-label={translateUi('uiMessages.m8cfe79b31b08')} type="range" min={0} max={Math.max(0,duration-1/fps)} step="0.01" value={frameTime} onChange={e=>{const time=Number(e.target.value);setFrameTime(time);onSeek(time)}} /></label></> : <><label className="grid min-h-36 cursor-pointer place-items-center rounded-lg border border-dashed border-white/20 p-3 text-zinc-400" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!uploading)void upload(event.dataTransfer.files[0])}}>{preview?<img src={stillPreview} alt={translateUi('uiMessages.m06633a9baf50')} className="max-h-40 max-w-full object-contain [image-orientation:none]"/>:uploading?translateUi('uiMessages.m6148b38691e3'):translateUi('uiMessages.m0c97725235ca')}<input aria-label={translateUi('uiMessages.m5fe221ff10e7')} type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif" className="sr-only" disabled={!library||uploading} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(file)}} /></label>{!library && <p className="text-xs text-zinc-400">{translateUi('uiMessages.maa9123fd0144')}</p>}</>}
   <div className="flex justify-end gap-2"><MediaButton disabled={uploading} onClick={onCancel}>{translateUi('canvas.cancel')}</MediaButton><MediaButton variant="primary" disabled={uploading || (tab==='local'&&(!resource||!preview)) || (tab==='frame'&&duration<=0)} onClick={()=>onConfirm(tab==='frame'?{frame_time:frameTime}:{resource_uuid:resource!})}>{translateUi('common.ok')}</MediaButton></div>
  </div>
 </MediaModal>
}
