/** Capture from an already-authorized result Blob, never from a cross-origin canvas. */
export async function captureCoverFrame(blob: Blob, seconds: number): Promise<Blob> {
 const url=URL.createObjectURL(blob)
 try {
  return await new Promise<Blob>((resolve,reject)=>{
   const video=document.createElement('video')
   let done=false
   const timer=setTimeout(()=>finish(undefined),15000)
   function finish(result?:Blob) {if(done)return;done=true;clearTimeout(timer);video.removeAttribute('src');video.load();result?resolve(result):reject(new Error('E7009'))}
   function capture() {
    if(!video.videoWidth||!video.videoHeight||video.videoWidth>4096||video.videoHeight>4096){finish(undefined);return}
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight
    const context=canvas.getContext('2d');if(!context){finish(undefined);return}
    try {context.drawImage(video,0,0);canvas.toBlob(result=>finish(result??undefined),'image/png')} catch {finish(undefined)}
   }
   video.preload='auto';video.muted=true
   video.onerror=()=>finish(undefined)
   video.onloadeddata=()=>{const at=Math.max(0,Math.min(seconds,Math.max(0,video.duration-.001)));if(at<.001)capture();else {try{video.currentTime=at}catch{finish(undefined)}}}
   video.onseeked=()=>capture()
   video.src=url
  })
 } finally {URL.revokeObjectURL(url)}
}
