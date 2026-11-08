import type { AudioLayer, EffectLayer, ImageLayer, TextLayer, VideoClip, VideoLayer, VisualEffect } from './api'
import type { TimelineBookmark } from './bookmarks'

type SnapTrack = 'video'|'overlay'|'audio'|'image'|'text'|'effect'
type Points = Record<string, {time:number}[] | undefined>
export function frameTime(time:number,fps:number):number { return fps>0 && Number.isFinite(fps) ? Math.round(time*fps)/fps : time }
function pointsOf(points:Points|undefined):number[] { return points ? Object.values(points).flatMap(list=>(list??[]).map(point=>point.time)) : [] }
function effectPoints(effects:VisualEffect[]|undefined):number[] {return (effects??[]).flatMap(effect=>(effect.keyframes??[]).map(point=>point.time))}
/** Map source-time video keyframes and timeline-time overlay keyframes into the shared timeline. */
export function timelineSnapTargets(clips:VideoClip[],boundaries:number[],videos:VideoLayer[],audio:AudioLayer[],images:ImageLayer[],text:TextLayer[],playhead:number,kind:SnapTrack,index:number,bookmarks:TimelineBookmark[]=[],includePlayhead=true,effects:EffectLayer[]=[]):number[] {
 const targets=[...(includePlayhead?[playhead]:[]),...bookmarks.map(item=>item.time)]
 clips.forEach((clip,i)=>{
  if(kind==='video'&&i===index)return
  const offset=boundaries[i],end=boundaries[i+1];targets.push(offset,end)
  for(const time of [...pointsOf(clip.transform?.keyframes),...effectPoints(clip.effects)])if(time>=clip.start&&time<=clip.end)targets.push(offset+(time-clip.start)/clip.rate)
 })
 videos.forEach((layer,i)=>{
  if(kind==='overlay'&&i===index)return
  targets.push(layer.start,layer.end)
  for(const time of [...pointsOf(layer.transform?.keyframes),...effectPoints(layer.effects)]){const at=layer.start+(time-layer.source_start)/layer.rate;if(at>=layer.start&&at<=layer.end)targets.push(at)}
 })
 audio.forEach((layer,i)=>{if(kind!=='audio'||i!==index)targets.push(layer.start,layer.end)})
 images.forEach((layer,i)=>{if(kind==='image'&&i===index)return;targets.push(layer.start,layer.end);targets.push(...[...pointsOf(layer.keyframes),...effectPoints(layer.effects)].filter(time=>time>=layer.start&&time<=layer.end))})
 text.forEach((layer,i)=>{if(kind==='text'&&i===index)return;targets.push(layer.start,layer.end);targets.push(...[...pointsOf(layer.keyframes),...effectPoints(layer.effects)].filter(time=>time>=layer.start&&time<=layer.end))})
 effects.forEach((layer,i)=>{if(kind!=='effect'||i!==index)targets.push(layer.start,layer.end)})
 return targets.filter(Number.isFinite)
}

export function snapTime(time:number,targets:number[],threshold:number):number {
 let closest=time,distance=threshold
 for(const target of targets){const next=Math.abs(target-time);if(next<distance){closest=target;distance=next}}
 return closest
}
