import * as React from 'react'
import { useRef, useState } from 'react'
import type { AudioLayer, EffectLayer, ImageLayer, TextLayer, VideoLayer } from './api'
import { backgroundAnimatedFields, textAnimatedFields } from './text-keyframes'
import { colorFields } from './color-keyframes'
import { imageAnimatedFields } from './image-keyframes'
import { frameTime } from './timeline-snap'
import { TimelineFilmstrip } from './TimelineFilmstrip'
import type { Filmstrip } from './useTimelineFilmstrips'
import type { TimelineWaveform } from './useTimelineWaveforms'
import { TimelineWaveformView } from './TimelineWaveform'

type Layer = AudioLayer | EffectLayer | ImageLayer | TextLayer | VideoLayer
type DragKind = 'move' | 'start' | 'end'
const clamp = (value:number, min:number, max:number) => Math.max(min,Math.min(max,value))

/** Keep clip and text-keyframe times within the timeline and audio within its source. */
export function moveTimelineLayer<T extends Layer>(layer:T, mode:DragKind, delta:number, sourceDuration?:number, round=true): T {
 const duration=layer.end-layer.start
 const rate='rate' in layer ? layer.rate : 1
 let low=-layer.start, high=600-layer.end
 if (mode==='start') { high=duration-.05; if ('source_start' in layer) low=Math.max(low,-layer.source_start/rate) }
 if (mode==='end') { low=.05-duration; high=600-layer.end; if ('source_start' in layer && sourceDuration!==undefined) high=Math.min(high,(sourceDuration-layer.source_start)/rate-duration) }
 if (mode==='move' && 'text' in layer && layer.keyframes) for(const field of [...textAnimatedFields,...backgroundAnimatedFields,...colorFields]) for(const point of layer.keyframes[field] ?? []) { low=Math.max(low,-point.time); high=Math.min(high,600-point.time) }
 if (mode==='move' && 'scale' in layer && layer.keyframes) for(const field of imageAnimatedFields) for(const point of layer.keyframes[field] ?? []) { low=Math.max(low,-point.time); high=Math.min(high,600-point.time) }
 if (mode==='move' && ('text' in layer || 'scale' in layer) && layer.effects) for(const effect of layer.effects) for(const point of effect.keyframes ?? []) { low=Math.max(low,-point.time); high=Math.min(high,600-point.time) }
 const bounded=clamp(delta,low,high),shift=round?Math.round(bounded*1000)/1000:bounded
 if(mode==='start') return {...layer,start:layer.start+shift,...('source_start' in layer?{source_start:layer.source_start+shift*rate}:{})}
 if(mode==='end') return {...layer,end:layer.end+shift}
 const effects=('text' in layer || 'scale' in layer) && layer.effects ? layer.effects.map(effect=>({...effect,keyframes:effect.keyframes?.map(point=>({...point,time:point.time+shift}))})) : undefined
 if('text' in layer && layer.keyframes) {
  const keyframes={...layer.keyframes};for(const field of [...textAnimatedFields,...backgroundAnimatedFields]) if(keyframes[field]) keyframes[field]=keyframes[field]!.map(point=>({...point,time:point.time+shift}))
  for(const field of colorFields)if(keyframes[field])keyframes[field]=keyframes[field]!.map(point=>({...point,time:point.time+shift}))
  return {...layer,start:layer.start+shift,end:layer.end+shift,keyframes,...(effects?{effects}:{})}
 }
 if('scale' in layer && layer.keyframes) {
  const keyframes={...layer.keyframes};for(const field of imageAnimatedFields) if(keyframes[field]) keyframes[field]=keyframes[field]!.map(point=>({...point,time:point.time+shift}))
  return {...layer,start:layer.start+shift,end:layer.end+shift,keyframes,...(effects?{effects}:{})}
 }
 return {...layer,start:layer.start+shift,end:layer.end+shift,...(effects?{effects}:{})}
}
export function splitTimelineLayer<T extends Layer>(layer:T, time:number, keep:'both'|'left'|'right'): T[] {
 if (time <= layer.start+.05 || time >= layer.end-.05) return [layer]
 const left={...layer,end:time}
 const right={...layer,start:time,...('source_start' in layer?{source_start:layer.source_start+(time-layer.start)*('rate' in layer?layer.rate:1)}:{})}
 return keep==='both'?[left,right]:[keep==='left'?left:right]
}
export function sliceVideoLayer(layer: VideoLayer, from:number, to:number, offset:number): VideoLayer | undefined {
 const start=Math.max(layer.start,from), end=Math.min(layer.end,to)
 return end>start ? {...layer,start:start-offset,end:end-offset,source_start:layer.source_start+(start-layer.start)*layer.rate} : undefined
}
export function snapTimelineDelta(layer: Layer, mode:DragKind, delta:number, targets:number[], threshold:number): number {
 const anchors=mode==='move'?[layer.start,layer.end]:[mode==='start'?layer.start:layer.end]
 let best=delta, distance=threshold
 for(const anchor of anchors) for(const target of targets) {const adjustment=target-(anchor+delta);if(Math.abs(adjustment)<distance){distance=Math.abs(adjustment);best=delta+adjustment}}
 return best
}
/** Trimming cannot overlap another clip on the same track. */
export function constrainTrackTrim<T extends Layer>(initial:T,next:T,mode:DragKind,siblings:Layer[],sourceDuration?:number):T {
 if(mode==='move')return next
 if(mode==='start'){const boundary=Math.max(0,...siblings.filter(item=>item.end<=initial.start+.00001).map(item=>item.end));return moveTimelineLayer(initial,'start',Math.max(next.start,boundary)-initial.start,sourceDuration,false)}
 const boundary=Math.min(600,...siblings.filter(item=>item.start>=initial.end-.00001).map(item=>item.start));return moveTimelineLayer(initial,'end',Math.min(next.end,boundary)-initial.end,sourceDuration,false)
}
export function TimelineLayer({ layer, name, bladeKind, bladeIndex, effectKind, effectIndex, isSelected=false, selectedGroup=false, strip, waveform, imageUrl, trackKey, pixelsPerSecond, sourceDuration, fps, disabled, snap, targets, onCommit, onSelect }: { layer: Layer; name:string; bladeKind?:'overlay'|'audio'|'image'|'text'|'effect'; bladeIndex?:number; effectKind?:'overlay'|'image'|'text'; effectIndex?:number; isSelected?:boolean; selectedGroup?:boolean; strip?:Filmstrip; waveform?:TimelineWaveform; imageUrl?:string; trackKey:string; pixelsPerSecond:number; sourceDuration?:number; fps:number; disabled:boolean; snap:boolean; targets:number[]; onCommit(layer:Layer,targetKey:string|undefined,mode:DragKind,above?:boolean):void; onSelect(multi:boolean):void }) {
 const drag=useRef<{x:number; mode:DragKind; initial:Layer; next:Layer} | undefined>(undefined)
 const [preview,setPreview]=useState<Layer>()
 const current=preview ?? layer
 function begin(event:React.PointerEvent<HTMLButtonElement>, mode:DragKind) {
  if(disabled)return;event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});const multi=event.metaKey||event.ctrlKey||event.shiftKey,keepSelection=selectedGroup&&!multi;if(!keepSelection)onSelect(multi);drag.current={x:event.clientX,mode,initial:layer,next:layer};event.currentTarget.setPointerCapture(event.pointerId)
 }
 function move(event:React.PointerEvent<HTMLButtonElement>) {
  const d=drag.current;if(!d)return;const anchor=d.mode==='end'?d.initial.end:d.initial.start;let delta=frameTime(anchor+(event.clientX-d.x)/pixelsPerSecond,fps)-anchor
  if(snap&&!event.shiftKey) delta=snapTimelineDelta(d.initial,d.mode,delta,targets,10/pixelsPerSecond)
  d.next=moveTimelineLayer(d.initial,d.mode,delta,sourceDuration,false);setPreview(d.next)
 }
 function finish(event:React.PointerEvent<HTMLButtonElement>) { event.stopPropagation();const d=drag.current;drag.current=undefined;setPreview(undefined);if(!d)return;const hit=d.mode==='move'?document.elementFromPoint(event.clientX,event.clientY):null,row=hit?.closest('[data-video-tool-track]'),main=hit?.closest('[data-main-video-track]'),timeline=hit?.closest('[data-video-tool-timeline-content]'),target=row?.getAttribute('data-video-tool-track')??(main?'main':timeline?'outside':undefined),box=(row??main)?.getBoundingClientRect(),mainBox=timeline?.querySelector('[data-main-video-track]')?.getBoundingClientRect(),above=box?event.clientY<box.top+box.height/2:mainBox?event.clientY<mainBox.top:undefined;if(d.next.start!==d.initial.start || d.next.end!==d.initial.end || (target!==undefined&&target!==trackKey))onCommit(d.next,target,d.mode,above) }
 function keyboard(event:React.KeyboardEvent<HTMLButtonElement>,mode:DragKind) {if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();const multi=event.metaKey||event.ctrlKey||event.shiftKey;if(!selectedGroup||multi)onSelect(multi);onCommit(moveTimelineLayer(layer,mode,event.key==='ArrowLeft'?-.1:.1,sourceDuration),undefined,mode)}
 // Timeline geometry is calculated from duration, zoom, and drag position.
 return <div data-selected={isSelected} data-blade-kind={bladeKind} data-blade-index={bladeIndex} data-effect-kind={effectKind} data-effect-index={effectIndex} className={`absolute inset-y-1 min-w-3 rounded-md border ${isSelected?'border-[var(--mf-brand)] bg-[var(--mf-brand)]/25':'border-white/15 bg-white/5'}`} style={{left:current.start*pixelsPerSecond,width:(current.end-current.start)*pixelsPerSecond}}>
  {(['start','move','end'] as const).map(mode=><button key={mode} type="button" aria-pressed={mode==='move'?isSelected:undefined} aria-label={`${name}${mode==='move'?'移动':mode==='start'?'裁剪起点':'裁剪终点'}`} disabled={disabled} onPointerDown={e=>begin(e,mode)} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{drag.current=undefined;setPreview(undefined)}} onKeyDown={e=>keyboard(e,mode)} className={mode==='move'?'absolute inset-0 overflow-hidden whitespace-nowrap px-3 text-left text-xs':'absolute inset-y-0 z-10 w-2 touch-none rounded bg-[var(--mf-brand)]/80 '+(mode==='start'?'left-0 cursor-ew-resize':'right-0 cursor-ew-resize')}>{mode==='move'&&<><TimelineFilmstrip strip={strip} imageUrl={imageUrl} start={'source_start' in current?current.source_start:0} duration={current.end-current.start} rate={'rate' in current?current.rate:1} pixelsPerSecond={pixelsPerSecond} height={40}/>{waveform && 'source_start' in current && <TimelineWaveformView waveform={waveform} start={current.source_start} duration={current.end-current.start}/>}<span className="relative z-10 rounded bg-black/40 px-1 text-white">{name}</span></>}</button>)}
 </div>
}
