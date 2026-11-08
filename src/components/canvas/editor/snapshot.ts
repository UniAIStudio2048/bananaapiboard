import { clipDuration, timelineSeek, type EffectLayer, type ImageLayer, type TextLayer, type VideoClip, type VideoLayer, type VideoTransform, type VisualEffect } from './api'
import { imageValue } from './image-keyframes'
import { backgroundValue, valueAt } from './text-keyframes'
import { orderedVisuals } from './visual-order'
import { validVisualEffects } from './visual-effects'
import { canvasBlend, validBlendMode, type BlendMode } from './blend-mode'
import { colorValue } from './color-keyframes'

interface SnapshotInput {
 background?: string
 duration?: number
 effects?: EffectLayer[]
 clips: VideoClip[]
 videos: VideoLayer[]
 images: ImageLayer[]
 text: TextLayer[]
 urls: Record<string,string>
 time: number
 fps: number
 width: number
 height: number
}
const defaultTransform:VideoTransform={scale:1,x:0,y:0,rotation:0,opacity:1}

// Canvas renders a tab as a space. Measure tab stops in the same browser
// layout used by the preview, then paint the runs at their measured positions.
function measureTabbedText(text:string,lines:string[],fontFamily:string,size:number) {
 const span=document.createElement('span')
 span.className='fixed left-0 top-0 invisible whitespace-pre text-left leading-tight'
 span.setAttribute('aria-hidden','true')
 // Font family and size are computed from the current timeline frame.
 span.style.fontFamily=fontFamily;span.style.fontSize=`${size}px`;span.textContent=text
 document.body.appendChild(span)
 try {
  const node=span.firstChild,box=span.getBoundingClientRect(),range=document.createRange(),runs:{text:string;left:number;line:number}[]=[]
  if(!node)throw new Error('E7009')
  let offset=0
  for(let line=0;line<lines.length;line++) {
   const parts=lines[line].split('\t')
   for(let index=0;index<parts.length;index++) {
    const part=parts[index]
    if(part){range.setStart(node,offset);range.setEnd(node,offset+part.length);runs.push({text:part,left:range.getBoundingClientRect().left-box.left,line})}
    offset+=part.length+(index<parts.length-1?1:0)
   }
   offset++ // The next line begins after its newline, when present.
  }
  return {width:box.width,runs,direction:getComputedStyle(span).direction==='rtl'?'rtl' as const:'ltr' as const}
 } finally {span.remove()}
}

/** Capture the composed timeline from authorized assets without tainting the canvas. */
export async function captureTimelineSnapshot(input:SnapshotInput):Promise<Blob> {
 if ((input.background !== undefined && !/^[0-9a-f]{6}$/i.test(input.background)) || (input.duration !== undefined && (!Number.isFinite(input.duration) || input.duration<0 || input.duration>600)) || !Number.isFinite(input.time) || !Number.isInteger(input.width) || input.width<1 || input.width>4096 || !Number.isInteger(input.height) || input.height<1 || input.height>4096 || !Number.isFinite(input.fps) || input.fps<=0) throw new Error('E7009')
 const duration=Math.max(input.duration??0,input.clips.reduce((sum,c)=>sum+clipDuration(c),0),...input.videos.map(l=>l.end),...input.images.map(l=>l.end),...input.text.map(l=>l.end),...(input.effects??[]).map(l=>l.end),0)
 if(duration<=0)throw new Error('E7009')
 const time=Math.max(0,Math.min(input.time,Math.max(0,duration-1/input.fps)))
 const {width,height}=input
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
 const context=canvas.getContext('2d');if(!context)throw new Error('E7009')
 let ctx:CanvasRenderingContext2D=context
 ctx.fillStyle=`#${input.background ?? '000000'}`;ctx.fillRect(0,0,width,height)
 const resources=new Map<string,Promise<Blob>>()
 function asset(id:string):Promise<Blob> {
  const url=input.urls[id];if(!url)throw new Error('E7009')
  let pending=resources.get(url)
  if(!pending) {pending=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);try{const response=await fetch(url,{credentials:'omit',signal:controller.signal});if(!response.ok)throw new Error('E7009');return await response.blob()}finally{clearTimeout(timer)}})();resources.set(url,pending)}
  return pending
 }
 async function videoFrame(id:string,at:number):Promise<{element:HTMLVideoElement;release():void}> {
  const url=URL.createObjectURL(await asset(id)), element=document.createElement('video')
  try {
   await new Promise<void>((resolve,reject)=>{
    let finished=false
    const timer=setTimeout(()=>finish(false),20000)
    function finish(ok:boolean) {if(finished)return;finished=true;clearTimeout(timer);element.onloadedmetadata=null;element.onloadeddata=null;element.onseeked=null;element.onerror=null;ok?resolve():reject(new Error('E7009'))}
    element.preload='auto';element.muted=true
    element.onerror=()=>finish(false)
    element.onloadedmetadata=()=>{if(!Number.isFinite(element.duration)||element.duration<=0){finish(false);return}const target=Math.max(0,Math.min(at,element.duration-.001));if(target<.001){if(element.readyState>=2)finish(true)}else try{element.currentTime=target}catch{finish(false)}}
    element.onloadeddata=()=>{if(at<.001)finish(true)}
    element.onseeked=()=>finish(true)
    element.src=url
   })
   return {element,release:()=>{element.removeAttribute('src');element.load();URL.revokeObjectURL(url)}}
  } catch(error) {element.removeAttribute('src');element.load();URL.revokeObjectURL(url);throw error}
 }
 async function imageFrame(id:string):Promise<{element:CanvasImageSource;width:number;height:number;release():void}> {
  const data=await asset(id)
  let bitmap:ImageBitmap | undefined
  try {bitmap=await createImageBitmap(data,{imageOrientation:'none'})} catch {/* Some browser-decodable PNGs are rejected by createImageBitmap. */}
  if(bitmap) return {element:bitmap,width:bitmap.width,height:bitmap.height,release:()=>bitmap!.close()}
  const objectUrl=URL.createObjectURL(data),image=new Image()
  try {image.style.imageOrientation='none';image.src=objectUrl;await image.decode();return {element:image,width:image.naturalWidth,height:image.naturalHeight,release:()=>{image.removeAttribute('src');URL.revokeObjectURL(objectUrl)}}}
  catch(error){image.removeAttribute('src');URL.revokeObjectURL(objectUrl);throw error}
 }
 function draw(source:CanvasImageSource,w:number,h:number,transform:{x:number;y:number;scale:number;rotation:number;opacity:number},centerX:number,centerY:number) {
  if(!w||!h)throw new Error('E7009')
  const fit=Math.min(width/w,height/h);ctx.save();ctx.globalAlpha=transform.opacity;ctx.translate(centerX,centerY);ctx.rotate(transform.rotation*Math.PI/180);ctx.scale(transform.scale,transform.scale);ctx.drawImage(source,-w*fit/2,-h*fit/2,w*fit,h*fit);ctx.restore()
 }
 function withAttached(effects:VisualEffect[]|undefined,at:number,filterWidth:number,filterHeight:number,paint:()=>void) {
  if(!validVisualEffects(effects))throw new Error('E7009')
  const active=(effects??[]).filter(effect=>effect.enabled&&valueAt(effect.intensity,effect.keyframes,at)>0)
  if(!active.length){paint();return}
  const source=document.createElement('canvas');source.width=width;source.height=height;const offscreen=source.getContext('2d');if(!offscreen)throw new Error('E7009')
  const target=ctx;ctx=offscreen;try{paint()}finally{ctx=target}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),filter=document.createElementNS(ns,'filter'),id=`flowx-asset-snapshot-${crypto.randomUUID()}`
  filter.id=id;filter.setAttribute('x','-100%');filter.setAttribute('y','-100%');filter.setAttribute('width','300%');filter.setAttribute('height','300%');filter.setAttribute('color-interpolation-filters','sRGB')
  for(const effect of active){const blur=document.createElementNS(ns,'feGaussianBlur'),value=valueAt(effect.intensity,effect.keyframes,at);blur.setAttribute('stdDeviation',`${value/5*filterWidth/1920} ${value/5*filterHeight/1080}`);blur.setAttribute('edgeMode','duplicate');filter.appendChild(blur)}
  svg.appendChild(filter);svg.setAttribute('width','0');svg.setAttribute('height','0');document.body.appendChild(svg)
  try{ctx.save();ctx.filter=`url(#${id})`;ctx.drawImage(source,0,0);ctx.restore()}finally{svg.remove()}
 }
 function withBlend(mode:BlendMode|undefined,paint:()=>void,opacity=1) {
  if(!validBlendMode(mode))throw new Error('E7009')
  if((!mode||mode==='normal')&&opacity===1){paint();return}
  // Group each source before blending so its overlapping text and background form one layer.
  const source=document.createElement('canvas');source.width=width;source.height=height;const offscreen=source.getContext('2d');if(!offscreen)throw new Error('E7009')
  const target=ctx;ctx=offscreen;try{paint()}finally{ctx=target}
  ctx.save();ctx.globalCompositeOperation=canvasBlend(mode);ctx.globalAlpha=opacity;ctx.drawImage(source,0,0);ctx.restore()
 }
 function fitted(w:number,h:number,scale:number) {const fit=Math.min(width/w,height/h)*scale;return {width:w*fit,height:h*fit}}
 function textEffectSize(layer:TextLayer) {const xs=layer.keyframes?.x?.map(point=>point.value)??[],ys=layer.keyframes?.y?.map(point=>point.value)??[],minX=xs.length?Math.min(...xs):layer.x,maxX=xs.length?Math.max(...xs):layer.x,minY=ys.length?Math.min(...ys):layer.y,maxY=ys.length?Math.max(...ys):layer.y;return Math.hypot(Math.max(maxX,1-minX)*width,Math.max(maxY,1-minY)*height)*2}
 function animated(t:VideoTransform,at:number) {return {x:valueAt(t.x,t.keyframes?.x,at),y:valueAt(t.y,t.keyframes?.y,at),scale:valueAt(t.scale,t.keyframes?.scale,at),rotation:valueAt(t.rotation,t.keyframes?.rotation,at),opacity:valueAt(t.opacity,t.keyframes?.opacity,at)}}
 const baseDuration=input.clips.reduce((sum,c)=>sum+clipDuration(c),0)
 if(time<baseDuration) {
  const target=timelineSeek(input.clips,time),clip=input.clips[target.index],t=animated(clip.transform??defaultTransform,target.sourceTime)
  if(t.opacity>0){
   if(clip.media_type==='image'){const frame=await imageFrame(clip.resource_uuid);try {const size=fitted(frame.width,frame.height,t.scale);withBlend(clip.blend_mode,()=>withAttached(clip.effects,target.sourceTime,size.width,size.height,()=>draw(frame.element,frame.width,frame.height,t,width*(.5+t.x),height*(.5+t.y))))} finally {frame.release()}}
   else {const frame=await videoFrame(clip.resource_uuid,target.sourceTime);try {const size=fitted(frame.element.videoWidth,frame.element.videoHeight,t.scale);withBlend(clip.blend_mode,()=>withAttached(clip.effects,target.sourceTime,size.width,size.height,()=>draw(frame.element,frame.element.videoWidth,frame.element.videoHeight,t,width*(.5+t.x),height*(.5+t.y))))} finally {frame.release()}}
  }
 }
 await document.fonts.ready
 const shortSide=Math.min(width,height)
 for(const ref of orderedVisuals(input.videos,input.images,input.text,input.effects)) {
 if(ref.kind==='effect') {
  const effect=input.effects![ref.index];if(time<effect.start||time>=effect.end||effect.intensity<=0)continue
  if(!Number.isFinite(effect.intensity)||effect.intensity>100)throw new Error('E7009')
  const source=document.createElement('canvas');source.width=width;source.height=height;const copy=source.getContext('2d');if(!copy)throw new Error('E7009');copy.drawImage(canvas,0,0)
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),filter=document.createElementNS(ns,'filter'),blur=document.createElementNS(ns,'feGaussianBlur'),id=`flowx-snapshot-${crypto.randomUUID()}`
  filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');blur.setAttribute('stdDeviation',`${effect.intensity/5*width/1920} ${effect.intensity/5*height/1080}`);blur.setAttribute('edgeMode','duplicate');filter.appendChild(blur);svg.appendChild(filter);svg.setAttribute('width','0');svg.setAttribute('height','0');document.body.appendChild(svg)
  try {ctx.clearRect(0,0,width,height);ctx.filter=`url(#${id})`;ctx.drawImage(source,0,0);ctx.filter='none'} finally {ctx.filter='none';svg.remove()}
 } else
 if(ref.kind==='video') {
  const layer=input.videos[ref.index];if(time<layer.start||time>=layer.end)continue
  const at=layer.source_start+(time-layer.start)*layer.rate,t=animated(layer.transform??defaultTransform,at);if(t.opacity<=0)continue
  const frame=await videoFrame(layer.resource_uuid,at);try {const size=fitted(frame.element.videoWidth,frame.element.videoHeight,t.scale);withBlend(layer.blend_mode,()=>withAttached(layer.effects,at,size.width,size.height,()=>draw(frame.element,frame.element.videoWidth,frame.element.videoHeight,t,width*(.5+t.x),height*(.5+t.y))))} finally {frame.release()}
 } else if(ref.kind==='image') {
  const layer=input.images[ref.index];if(time<layer.start||time>=layer.end)continue
  const t={x:imageValue(layer,'x',time),y:imageValue(layer,'y',time),scale:imageValue(layer,'scale',time),rotation:imageValue(layer,'rotation',time),opacity:imageValue(layer,'opacity',time)};if(t.opacity<=0)continue
  const frame=await imageFrame(layer.resource_uuid)
  try {const size=fitted(frame.width,frame.height,t.scale);withBlend(layer.blend_mode,()=>withAttached(layer.effects,time,size.width,size.height,()=>draw(frame.element,frame.width,frame.height,t,width*t.x,height*t.y)))} finally {frame.release()}
 } else {
  const layer=input.text[ref.index];if(time<layer.start||time>=layer.end)continue
  const size=shortSide*valueAt(layer.size,layer.keyframes?.size,time)/720, x=width*valueAt(layer.x,layer.keyframes?.x,time), y=height*valueAt(layer.y,layer.keyframes?.y,time)
  const effectSize=textEffectSize(layer);withBlend(layer.blend_mode,()=>withAttached(layer.effects,time,effectSize,effectSize,()=>{ctx.save();ctx.translate(x,y);ctx.rotate(valueAt(layer.rotation ?? 0,layer.keyframes?.rotation,time)*Math.PI/180);const scale=valueAt(layer.scale ?? 1,layer.keyframes?.scale,time);ctx.scale(scale,scale);const family=layer.font==='serif'?'"Noto Serif CJK SC", "Songti SC", serif':'"Noto Sans CJK SC", "PingFang SC", sans-serif';ctx.font=`${size}px ${family}`;ctx.textBaseline='middle'
  // Detached canvases do not inherit the page direction like the preview does.
  ctx.direction=getComputedStyle(document.body).direction==='rtl'?'rtl':'ltr';ctx.textAlign='left'
  // CSS white-space: pre ignores carriage returns and the final newline.
  const normalizedText=layer.text.replace(/\r/g,''),lines=normalizedText.split('\n');if(lines.length>1&&lines[lines.length-1]==='')lines.pop()
  const lineHeight=size*1.25, tabbed=normalizedText.includes('\t')?measureTabbedText(normalizedText,lines,family,size):undefined, textWidth=tabbed?.width??Math.max(...lines.map(line=>ctx.measureText(line).width)), textHeight=normalizedText?lineHeight*lines.length:0
  if(layer.background?.enabled){const unit=shortSide/720,px=backgroundValue(layer,'background_padding_x',time)*unit,py=backgroundValue(layer,'background_padding_y',time)*unit,ox=backgroundValue(layer,'background_offset_x',time)*unit,oy=backgroundValue(layer,'background_offset_y',time)*unit,w=textWidth+px*2,h=textHeight+py*2,radius=Math.min(w,h)*backgroundValue(layer,'background_radius',time)/200;ctx.fillStyle=`#${colorValue(layer,'background_color',time)}`;ctx.beginPath();ctx.roundRect(-textWidth/2-px+ox,-textHeight/2-py+oy,w,h,radius);ctx.fill()}
  ctx.fillStyle=`#${colorValue(layer,'color',time)}`;if(tabbed){ctx.direction=tabbed.direction;ctx.textAlign='left';for(const run of tabbed.runs)ctx.fillText(run.text,-textWidth/2+run.left,-textHeight/2+lineHeight*(run.line+.5))}else for(let index=0;index<lines.length;index++)ctx.fillText(lines[index],-textWidth/2,-textHeight/2+lineHeight*(index+.5));ctx.restore()}),valueAt(layer.opacity,layer.keyframes?.opacity,time))
 }
 }
 return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('E7009')),'image/png'))
}
