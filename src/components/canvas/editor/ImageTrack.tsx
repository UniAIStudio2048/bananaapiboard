import * as React from 'react'
import { BlendModeSelect } from './BlendModeSelect'
/* eslint-disable @next/next/no-img-element -- Private capability URLs must be fetched directly, not sent through the image optimizer. */
import type { ImageLayer } from './api'
import { imageValue, setImageKeyframe, toggleImageKeyframe } from './image-keyframes'
import { keyframeTime } from './text-keyframes'
import { useStillImage } from './useStillImage'

function StillImage({layer,url,time}:{layer:ImageLayer;url:string;time:number}) {
 const src=useStillImage(url)
 return <img alt="" src={src} className={`absolute h-full w-full max-w-none object-contain [image-orientation:none] ${src?'':'invisible'}`} style={{
  // Position and transform are computed from the output canvas and timeline.
  left:`${imageValue(layer,'x',time)*100}%`,top:`${imageValue(layer,'y',time)*100}%`,transform:`translate(-50%, -50%) rotate(${imageValue(layer,'rotation',time)}deg) scale(${imageValue(layer,'scale',time)})`,opacity:imageValue(layer,'opacity',time),
 }} />
}
export function ImageOverlay({ layers, urls, time }: { layers: ImageLayer[]; urls: Record<string,string>; time: number }) {
 return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="图片预览">{layers.map((layer,index)=>time>=layer.start && time<layer.end && urls[layer.resource_uuid] ? <StillImage key={index} layer={layer} url={urls[layer.resource_uuid]} time={time}/> : null)}</div>
}
export function ImageTrackPanel({ layers, time, disabled, onChange, onDelete, selectedIndex }: { layers: ImageLayer[]; time:number; selectedIndex?:number; disabled:boolean; onChange(index:number,change:Partial<ImageLayer>):void; onDelete(index:number):void }) {
 if(!layers.length)return null
 return <div aria-label={selectedIndex!==undefined&&layers[selectedIndex]?.is_sticker?'贴纸属性':'图片轨道'} className="grid gap-2 rounded-xl border border-white/10 bg-zinc-950/30 p-3">{layers.map((layer,index)=>selectedIndex !== undefined && selectedIndex !== index ? null : <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--mf-brand)]/30 bg-[var(--mf-brand)]/5 p-2"><span className="text-xs">{layer.is_sticker?'贴纸':'图片'} {index+1}</span><BlendModeSelect value={layer.blend_mode} disabled={disabled} onChange={blend_mode=>onChange(index,{blend_mode})}/>
 {([['start','起点'],['end','终点']] as const).map(([key,label])=><label key={key} className="flex items-center gap-1 text-xs">{label}<input aria-label={`${layer.is_sticker?'贴纸':'图片'}${index+1}${label}`} type="number" min={0} max={600} step=".05" className="w-20 rounded-lg border border-white/15 bg-zinc-900 px-2 py-1 text-sm text-zinc-100" value={layer[key]} disabled={disabled} onChange={e=>onChange(index,{[key]:Number(e.target.value)})}/></label>)}
 {([['x','位置 X',-2,2],['y','位置 Y',-2,2],['scale','缩放',.1,4],['rotation','旋转',-360,360],['opacity','透明度',0,1]] as const).map(([key,label,min,max])=>{const points=layer.keyframes?.[key]??[],at=keyframeTime(time),active=points.some(point=>Math.abs(point.time-at)<.001),outside=time<layer.start||time>=layer.end;return <div key={key} className="flex items-center gap-1 text-xs">{label}<button type="button" aria-label={`${layer.is_sticker?'贴纸':'图片'}${index+1}${label}关键帧`} aria-pressed={active} title={outside?'将播放头移入图片片段':'切换当前时间的关键帧'} disabled={disabled || outside || (!active && points.length>=32)} onClick={()=>onChange(index,toggleImageKeyframe(layer,key,time))}>{active?'◆':'◇'}</button><input aria-label={`${layer.is_sticker?'贴纸':'图片'}${index+1}${label}`} type="number" min={min} max={max} step={key==='rotation'?'1':'.05'} className="w-20 rounded-lg border border-white/15 bg-zinc-900 px-2 py-1 text-sm text-zinc-100" value={Number(imageValue(layer,key,time).toFixed(4))} disabled={disabled || (points.length>0 && outside)} onChange={e=>onChange(index,points.length?setImageKeyframe(layer,key,time,Number(e.target.value)):{[key]:Number(e.target.value)})}/></div>})}<button type="button" aria-label={`删除${layer.is_sticker?'贴纸':'图片'}${index+1}`} disabled={disabled} onClick={()=>onDelete(index)}>删除</button></div>)}</div>
}
