import * as React from 'react'
import { VideoTransformControls } from './VideoTransformControls'
import { useEffect, useRef } from 'react'
import type { VideoLayer, VideoTransform } from './api'
import { valueAt } from './text-keyframes'

const field='w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100'
const fallback:VideoTransform={scale:1,x:0,y:0,rotation:0,opacity:1}
function LayerVideo({layer,url,time,playing,onDuration}:{layer:VideoLayer;url:string;time:number;playing:boolean;onDuration?:(id:string,duration:number)=>void}) {
 const ref=useRef<HTMLVideoElement>(null), active=time>=layer.start && time<layer.end
 const sourceTime=layer.source_start+Math.max(0,time-layer.start)*layer.rate
 const t=layer.transform??fallback
 const animated={scale:valueAt(t.scale,t.keyframes?.scale,sourceTime),x:valueAt(t.x,t.keyframes?.x,sourceTime),y:valueAt(t.y,t.keyframes?.y,sourceTime),rotation:valueAt(t.rotation,t.keyframes?.rotation,sourceTime),opacity:valueAt(t.opacity,t.keyframes?.opacity,sourceTime)}
 useEffect(()=>{const v=ref.current;if(!v)return;if(Number.isFinite(layer.rate)&&layer.rate>=.25&&layer.rate<=4)v.playbackRate=layer.rate;v.volume=Number.isFinite(layer.volume_db)?Math.min(1,Math.pow(10,layer.volume_db/20)):0;v.muted=Boolean(layer.muted);if(v.readyState>=1 && Math.abs(v.currentTime-sourceTime)>(playing?.15:.001)){try{v.currentTime=sourceTime}catch{/* Wait for metadata. */}}if(active&&playing)void v.play().catch(()=>{});else v.pause()},[active,playing,sourceTime,layer.rate,layer.volume_db,layer.muted,url])
 return <video ref={ref} aria-label="叠加视频预览" src={url} preload="metadata" className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${active?'':'invisible'}`} style={{transform:`translate(${animated.x*100}%, ${animated.y*100}%) rotate(${animated.rotation}deg) scale(${animated.scale})`,opacity:animated.opacity}} onLoadedMetadata={e=>{if(Number.isFinite(e.currentTarget.duration)&&e.currentTarget.duration>0)onDuration?.(layer.resource_uuid,e.currentTarget.duration);try{e.currentTarget.currentTime=sourceTime}catch{/* Ignore unavailable seek. */}}}/>
}
export function VideoLayerOverlay({layers,urls,time,playing=false,onDuration}:{layers:VideoLayer[];urls:Record<string,string>;time:number;playing?:boolean;onDuration?:(id:string,duration:number)=>void}) {return <>{layers.map((layer,i)=>urls[layer.resource_uuid]&&<LayerVideo key={`${layer.resource_uuid}:${i}`} layer={layer} url={urls[layer.resource_uuid]} time={time} playing={playing} onDuration={onDuration}/>)}</>}
export function VideoLayerPanel({layer,time,disabled,onChange,onDelete}:{layer:VideoLayer;time:number;disabled:boolean;onChange(change:Partial<VideoLayer>):void;onDelete():void}) {
 const t=layer.transform??fallback, sourceTime=layer.source_start+Math.max(0,time-layer.start)*layer.rate, outside=time<layer.start||time>=layer.end
 return <><p className="font-medium">叠加视频</p><VideoTransformControls transform={t} time={sourceTime} outside={outside} disabled={disabled} blendMode={layer.blend_mode} onTransform={transform=>onChange({transform})} onBlend={blend_mode=>onChange({blend_mode})}/>
 {([['start','轨道开始（秒）',0,600,.01],['end','轨道结束（秒）',0,600,.01],['source_start','素材起点（秒）',0,600,.01],['rate','变速倍数',.25,4,.05],['volume_db','音量增益（dB）',-60,12,.1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={label} className={field} type="number" min={min} max={max} step={step} value={layer[key]} disabled={disabled} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label>)}
 <label><input type="checkbox" checked={Boolean(layer.muted)} disabled={disabled} onChange={e=>onChange({muted:e.target.checked})}/> 静音叠加视频</label><button type="button" disabled={disabled} onClick={onDelete}>删除叠加视频</button></>
}
