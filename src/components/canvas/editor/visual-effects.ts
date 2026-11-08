import type { Keyframe, VisualEffect } from './api'
import { keyframeTime, trimRedundantKeyframeEndpoints, valueAt } from './keyframe-values'

export function validVisualEffects(effects:VisualEffect[]|undefined):boolean {
 if(effects===undefined)return true
 if(!Array.isArray(effects)||effects.length>8)return false
 return effects.every(effect=>{
  if(!effect || effect.type!=='blur' || typeof effect.enabled!=='boolean' || !Number.isFinite(effect.intensity) || effect.intensity<0 || effect.intensity>100)return false
  if(effect.keyframes===undefined)return true
  if(!Array.isArray(effect.keyframes)||effect.keyframes.length>34)return false
  let previous=-1
  return effect.keyframes.every(point=>{if(!point||typeof point!=='object')return false;const valid=Number.isFinite(point.time)&&Number.isFinite(point.value)&&point.time>=0&&point.time<=600&&point.time-previous>=.001&&point.value>=0&&point.value<=100;previous=point.time;return valid})
 })
}
export function setEffectKeyframe(effect:VisualEffect,time:number,value:number):VisualEffect {
 const at=keyframeTime(time),points=effect.keyframes??[]
 if(points.length>=32&&!points.some(point=>Math.abs(point.time-at)<.001))return effect
 return {...effect,keyframes:[...points.filter(point=>Math.abs(point.time-at)>=.001),{time:at,value}].sort((a,b)=>a.time-b.time)}
}
export function toggleEffectKeyframe(effect:VisualEffect,time:number):VisualEffect {
 const at=keyframeTime(time),points=effect.keyframes??[]
 if(points.some(point=>Math.abs(point.time-at)<.001)){const remaining=points.filter(point=>Math.abs(point.time-at)>=.001);return {...effect,...(!remaining.length?{intensity:valueAt(effect.intensity,points,at)}:{}),keyframes:remaining}}
 return setEffectKeyframe(effect,at,valueAt(effect.intensity,points,at))
}
/** Keep boundary values when an absolute-time visual layer is exported in isolation. */
export function sliceVisualEffects(effects:VisualEffect[]|undefined,start:number,end:number,offset:number):VisualEffect[]|undefined {
 return effects?.map(effect=>{
  const points=effect.keyframes;if(!points?.length)return effect
  const keys:Keyframe[]=trimRedundantKeyframeEndpoints(end-start<=.001?[{time:start-offset,value:valueAt(effect.intensity,points,start)}]:[{time:start-offset,value:valueAt(effect.intensity,points,start)},...points.filter(point=>point.time>start+.001&&point.time<end-.001).map(point=>({...point,time:point.time-offset})),{time:end-offset,value:valueAt(effect.intensity,points,end)}])
  return {...effect,keyframes:keys}
 })
}
