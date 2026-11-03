import type { VideoAnimatedField, VideoTransform } from './api'
import { keyframeTime, valueAt } from './text-keyframes'

const bounds: Record<VideoAnimatedField, [number,number]> = { scale:[.1,4], x:[-2,2], y:[-2,2], rotation:[-360,360], opacity:[0,1] }
export const videoFields = Object.keys(bounds) as VideoAnimatedField[]
export function validVideoTransform(t: VideoTransform): boolean {
 if (!t || typeof t !== 'object') return false
 for (const field of videoFields) {
  const [min,max]=bounds[field], value=t[field], points=t.keyframes?.[field]
  if (!Number.isFinite(value)||value<min||value>max) return false
  if (points===undefined) continue
  if (!Array.isArray(points)||points.length>34) return false
  let previous=-1
  for (const point of points) { if (!point||!Number.isFinite(point.time)||!Number.isFinite(point.value)||point.time<0||point.time>600||point.time-previous<.001||point.value<min||point.value>max)return false; previous=point.time }
 }
 return t.keyframes===undefined || (t.keyframes!==null && typeof t.keyframes==='object')
}
export function setVideoKeyframe(t: VideoTransform, field: VideoAnimatedField, time: number, value: number): VideoTransform {
 const at=keyframeTime(time), old=t.keyframes?.[field] ?? []
 if (old.length>=32&&!old.some(point=>Math.abs(point.time-at)<.001)) return t
 return {...t,keyframes:{...t.keyframes,[field]:[...old.filter(point=>Math.abs(point.time-at)>=.001),{time:at,value}].sort((a,b)=>a.time-b.time)}}
}
export function toggleVideoKeyframe(t: VideoTransform, field: VideoAnimatedField, time: number): VideoTransform {
 const at=keyframeTime(time), old=t.keyframes?.[field] ?? []
 if (!old.some(point=>Math.abs(point.time-at)<.001)) return setVideoKeyframe(t,field,at,valueAt(t[field],old,at))
 const remaining=old.filter(point=>Math.abs(point.time-at)>=.001)
 return {...t,...(remaining.length?{}:{[field]:valueAt(t[field],old,at)}),keyframes:{...t.keyframes,[field]:remaining}}
}
