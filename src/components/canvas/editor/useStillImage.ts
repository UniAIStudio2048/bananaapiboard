import { useEffect, useState } from 'react'

type Entry={refs:number;controller:AbortController;objectUrl?:string;promise:Promise<string>}
const entries=new Map<string,Entry>()
function acquire(url:string):Entry {
 const existing=entries.get(url);if(existing){existing.refs++;return existing}
 const controller=new AbortController(),entry:Entry={refs:1,controller,promise:Promise.resolve(url)}
 entry.promise=(async()=>{
  const timer=setTimeout(()=>controller.abort(),60000)
  try {
  const response=await fetch(url,{credentials:'omit',signal:controller.signal})
  if(!response.ok)throw new Error('E7009')
  const declared=Number(response.headers.get('content-length'))
  if(Number.isFinite(declared)&&declared>20*1024*1024){void response.body?.cancel().catch(()=>{});return url}
  const reader=response.body?.getReader();if(!reader)return url
  const chunks:Uint8Array<ArrayBuffer>[]=[];let total=0
  while(true){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>20*1024*1024){void reader.cancel().catch(()=>{});return url}chunks.push(new Uint8Array(next.value))}
  const blob=new Blob(chunks,{type:response.headers.get('content-type')??''})
  const header=new Uint8Array(await blob.slice(0,10).arrayBuffer()),magic=String.fromCharCode(...header.slice(0,6))
  if(!['GIF87a','GIF89a'].includes(magic)){
   if(controller.signal.aborted)throw new Error('E7009')
   entry.objectUrl=URL.createObjectURL(blob);return entry.objectUrl
  }
  // Reject oversized GIF canvases before browser decoding allocates the bitmap.
  if(header.length<10)throw new Error('E7009')
  const width=header[6]+header[7]*256,height=header[8]+header[9]*256
  if(width<1||height<1||width>4096||height>4096||width*height>16_777_216)throw new Error('E7009')
  let source:CanvasImageSource,decodedWidth:number,decodedHeight:number,releaseSource:()=>void
  try {
   const bitmap=await createImageBitmap(blob);source=bitmap;decodedWidth=bitmap.width;decodedHeight=bitmap.height;releaseSource=()=>bitmap.close()
  } catch {
   // Some browsers can display GIFs but do not support decoding them as ImageBitmap.
   const objectUrl=URL.createObjectURL(blob),image=new Image();image.src=objectUrl
   try {await image.decode()} catch(error) {URL.revokeObjectURL(objectUrl);throw error}
   source=image;decodedWidth=image.naturalWidth;decodedHeight=image.naturalHeight;releaseSource=()=>{image.removeAttribute('src');URL.revokeObjectURL(objectUrl)}
  }
  try {
   if(decodedWidth<1||decodedHeight<1||decodedWidth>4096||decodedHeight>4096||decodedWidth*decodedHeight>16_777_216)throw new Error('E7009')
   const canvas=document.createElement('canvas');canvas.width=decodedWidth;canvas.height=decodedHeight;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('E7009');ctx.drawImage(source,0,0)
   const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('E7009')),'image/png'))
   if(controller.signal.aborted)throw new Error('E7009')
   entry.objectUrl=URL.createObjectURL(png);return entry.objectUrl
  } finally {releaseSource()}
  } finally {clearTimeout(timer)}
 })()
 entries.set(url,entry);return entry
}
function release(url:string,entry:Entry) {
 if(--entry.refs>0)return
 if(entries.get(url)===entry)entries.delete(url)
 entry.controller.abort();if(entry.objectUrl)URL.revokeObjectURL(entry.objectUrl)
}
/** Render the first GIF frame consistently with the still image sent to the renderer. */
export function useStillImage(url?:string):string|undefined {
 const [state,setState]=useState<{source?:string;url?:string}>({})
 useEffect(()=>{
  if(!url){setState({});return}
  const entry=acquire(url);let live=true
  void entry.promise.then(value=>{if(live)setState({source:url,url:value})}).catch(()=>{if(live)setState({source:url,url})})
  return()=>{live=false;release(url,entry)}
 },[url])
 return state.source===url && (state.url===url || (url!==undefined && entries.get(url)?.objectUrl===state.url)) ? state.url : undefined
}
