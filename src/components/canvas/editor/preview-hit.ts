import type { ImageLayer, TextLayer, VideoLayer, VideoTransform } from './api'
import { imageValue } from './image-keyframes'
import { backgroundValue, valueAt } from './text-keyframes'
import { orderedVisuals } from './visual-order'

export type PreviewTarget = {kind:'video'|'overlay'|'image'|'text';index:number;x:number;y:number;rotation:number;width:number;height:number;cx:number;cy:number;pivotX?:number;pivotY?:number}
const fallback:VideoTransform={scale:1,x:0,y:0,rotation:0,opacity:1}

/** Compute hit areas from the actual object-contain media, not their letterboxed elements. */
export function previewTargets(canvas:HTMLElement, main:VideoTransform | undefined, mainIndex:number, mainVisible:boolean, videos:VideoLayer[], images:ImageLayer[], text:TextLayer[], urls:Record<string,string>, time:number, sourceTime:number):PreviewTarget[] {
 const frame=canvas.getBoundingClientRect(), w=frame.width, h=frame.height
 if(!w||!h)return []
 const result:PreviewTarget[]=[]
 const media=(kind:PreviewTarget['kind'],index:number,element:HTMLVideoElement|HTMLImageElement|undefined,x:number,y:number,scale:number,rotation:number,opacity:number)=>{
  if(!element||opacity<=0)return
  const mw=element instanceof HTMLVideoElement?element.videoWidth:element.naturalWidth, mh=element instanceof HTMLVideoElement?element.videoHeight:element.naturalHeight
  if(!mw||!mh)return
  const fit=Math.min(w/mw,h/mh)
  result.push({kind,index,x,y,rotation,width:mw*fit*scale,height:mh*fit*scale,cx:frame.left+x*w,cy:frame.top+y*h})
 }
 const base=canvas.querySelector<HTMLVideoElement|HTMLImageElement>('[data-video-tool-preview]'), t=main??fallback
 if(mainVisible)media('video',mainIndex,base??undefined,.5+valueAt(t.x,t.keyframes?.x,sourceTime),.5+valueAt(t.y,t.keyframes?.y,sourceTime),valueAt(t.scale,t.keyframes?.scale,sourceTime),valueAt(t.rotation,t.keyframes?.rotation,sourceTime),valueAt(t.opacity,t.keyframes?.opacity,sourceTime))
 const videoElements=Array.from(canvas.querySelectorAll<HTMLVideoElement>('[aria-label="叠加视频预览"]'))
 const imageElements=Array.from(canvas.querySelectorAll<HTMLImageElement>('[aria-label="图片预览"] img'))
 const textElements=Array.from(canvas.querySelectorAll<HTMLElement>('[aria-label="文字预览"] span'))
 let vi=0,ii=0,ti=0
 for(const ref of orderedVisuals(videos,images,text)) {
  if(ref.kind==='video') {const layer=videos[ref.index],el=urls[layer.resource_uuid]?videoElements[vi++]:undefined;if(time<layer.start||time>=layer.end)continue;const tr=layer.transform??fallback, at=layer.source_start+(time-layer.start)*layer.rate;media('overlay',ref.index,el,.5+valueAt(tr.x,tr.keyframes?.x,at),.5+valueAt(tr.y,tr.keyframes?.y,at),valueAt(tr.scale,tr.keyframes?.scale,at),valueAt(tr.rotation,tr.keyframes?.rotation,at),valueAt(tr.opacity,tr.keyframes?.opacity,at))}
  else if(ref.kind==='image') {const layer=images[ref.index],active=time>=layer.start&&time<layer.end&&urls[layer.resource_uuid],el=active?imageElements[ii++]:undefined;if(active)media('image',ref.index,el,imageValue(layer,'x',time),imageValue(layer,'y',time),imageValue(layer,'scale',time),imageValue(layer,'rotation',time),imageValue(layer,'opacity',time))}
  else {const layer=text[ref.index],active=time>=layer.start&&time<layer.end,el=active?textElements[ti++]:undefined;if(el&&valueAt(layer.opacity,layer.keyframes?.opacity,time)>0){const x=valueAt(layer.x,layer.keyframes?.x,time),y=valueAt(layer.y,layer.keyframes?.y,time),rotation=valueAt(layer.rotation??0,layer.keyframes?.rotation,time),scale=valueAt(layer.scale??1,layer.keyframes?.scale,time),unit=Math.min(w,h)/720,px=layer.background?.enabled?backgroundValue(layer,'background_padding_x',time)*unit:0,py=layer.background?.enabled?backgroundValue(layer,'background_padding_y',time)*unit:0,ox=layer.background?.enabled?backgroundValue(layer,'background_offset_x',time)*unit:0,oy=layer.background?.enabled?backgroundValue(layer,'background_offset_y',time)*unit:0,l=Math.min(-el.offsetWidth/2,-el.offsetWidth/2-px+ox),r=Math.max(el.offsetWidth/2,el.offsetWidth/2+px+ox),top=Math.min(-el.offsetHeight/2,-el.offsetHeight/2-py+oy),bottom=Math.max(el.offsetHeight/2,el.offsetHeight/2+py+oy),dx=(l+r)*scale/2,dy=(top+bottom)*scale/2,angle=rotation*Math.PI/180;result.push({kind:'text',index:ref.index,x,y,rotation,width:(r-l)*scale,height:(bottom-top)*scale,cx:frame.left+x*w+dx*Math.cos(angle)-dy*Math.sin(angle),cy:frame.top+y*h+dx*Math.sin(angle)+dy*Math.cos(angle),pivotX:frame.left+x*w,pivotY:frame.top+y*h})}}
 }
 return result
}
export function hitPreview(targets:PreviewTarget[],clientX:number,clientY:number):PreviewTarget|undefined {
 return targets.slice().reverse().find(target=>{const angle=-target.rotation*Math.PI/180,dx=clientX-target.cx,dy=clientY-target.cy,x=dx*Math.cos(angle)-dy*Math.sin(angle),y=dx*Math.sin(angle)+dy*Math.cos(angle);return Math.abs(x)<=target.width/2&&Math.abs(y)<=target.height/2})
}
