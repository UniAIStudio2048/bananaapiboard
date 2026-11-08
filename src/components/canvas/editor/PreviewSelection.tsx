import * as React from 'react'
import { useLayoutEffect, useState, type RefObject, type PointerEvent } from 'react'
import { RotateCw } from 'lucide-react'
import type { ImageLayer, TextLayer, VideoLayer, VideoTransform } from './api'
import { previewTargets } from './preview-hit'

type Selection={kind:'video'|'overlay'|'audio'|'image'|'text';index:number}
type Bounds={x:number;y:number;width:number;height:number;rotation:number}
export function PreviewSelection({canvas,selection,main,mainIndex,mainVisible,videos,images,text,urls,time,sourceTime,onHandle}:{onHandle:(event:PointerEvent<HTMLButtonElement>,mode:'scale'|'rotate')=>void;canvas:RefObject<HTMLDivElement|null>;selection:Selection;main?:VideoTransform;mainIndex:number;mainVisible:boolean;videos:VideoLayer[];images:ImageLayer[];text:TextLayer[];urls:Record<string,string>;time:number;sourceTime:number}) {
 const [bounds,setBounds]=useState<Bounds>()
 useLayoutEffect(()=>{
  const element=canvas.current;if(!element)return
  const measure=()=>{const frame=element.getBoundingClientRect(),target=previewTargets(element,main,mainIndex,mainVisible,videos,images,text,urls,time,sourceTime).find(item=>item.kind===selection.kind&&item.index===selection.index);const next=target?{x:target.cx-frame.left,y:target.cy-frame.top,width:target.width,height:target.height,rotation:target.rotation}:undefined;setBounds(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next)}
  measure();const observer=new ResizeObserver(measure);observer.observe(element);element.addEventListener('load',measure,true);element.addEventListener('loadedmetadata',measure,true)
  return ()=>{observer.disconnect();element.removeEventListener('load',measure,true);element.removeEventListener('loadedmetadata',measure,true)}
 },[canvas,selection,main,mainIndex,mainVisible,videos,images,text,urls,time,sourceTime])
 if(!bounds)return null
 return <div data-preview-selection className="pointer-events-none absolute border-2 border-[var(--mf-brand)]" style={{left:bounds.x,top:bounds.y,width:bounds.width,height:bounds.height,transform:`translate(-50%, -50%) rotate(${bounds.rotation}deg)`}}>
  {(['左上','右上','左下','右下'] as const).map((name,index)=><button type="button" key={name} aria-label={`画面${name}缩放`} onPointerDown={event=>onHandle(event,'scale')} className={`pointer-events-auto absolute h-3 w-3 touch-none rounded-full border border-zinc-900 bg-[var(--mf-brand)] ${index<2?'top-0':'bottom-0'} ${index%2===0?'left-0':'right-0'} cursor-nwse-resize`} />)}
  {<button type="button" aria-label="画面旋转" onPointerDown={event=>onHandle(event,'rotate')} className="pointer-events-auto absolute left-1/2 top-2 grid h-6 w-6 -translate-x-1/2 touch-none place-items-center rounded-full border border-[var(--mf-brand)] bg-zinc-900 text-white"><RotateCw size={14} aria-hidden="true" /></button>}
 </div>
}
