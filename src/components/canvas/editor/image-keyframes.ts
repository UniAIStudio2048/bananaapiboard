import type { ImageAnimatedField, ImageLayer, Keyframe } from './api'
import { keyframeTime, valueAt } from './text-keyframes'
import { sliceVisualEffects } from './visual-effects'
import { trimRedundantKeyframeEndpoints } from './keyframe-values'

export const imageAnimatedFields: ImageAnimatedField[] = ['x','y','scale','rotation','opacity']
export function imageValue(layer: ImageLayer, field: ImageAnimatedField, time: number) {
 return valueAt(layer[field] ?? 0,layer.keyframes?.[field],time)
}
export function validImageKeyframes(layer: ImageLayer): boolean {
 if (layer.rotation !== undefined && (!Number.isFinite(layer.rotation) || layer.rotation < -360 || layer.rotation > 360)) return false
 if (layer.keyframes === undefined) return true
 if (!layer.keyframes || typeof layer.keyframes !== 'object') return false
 for (const field of imageAnimatedFields) {
  const points=layer.keyframes[field];if(points===undefined)continue
  if(!Array.isArray(points) || points.length>34)return false
  let previous=-1
  for(const point of points) {
   const min=field==='scale'?.1:field==='opacity'?0:field==='rotation'?-360:-2
   const max=field==='scale'?4:field==='opacity'?1:field==='rotation'?360:2
   if(!point || !Number.isFinite(point.time) || !Number.isFinite(point.value) || point.time<0 || point.time>600 || point.time-previous<.001 || point.value<min || point.value>max)return false
   previous=point.time
  }
 }
 return true
}
export function setImageKeyframe(layer: ImageLayer, field: ImageAnimatedField, time: number, value: number): ImageLayer {
 const at=keyframeTime(time),previous=layer.keyframes?.[field]??[]
 if(previous.length>=32 && !previous.some(point=>Math.abs(point.time-at)<.001))return layer
 return {...layer,keyframes:{...layer.keyframes,[field]:[...previous.filter(point=>Math.abs(point.time-at)>=.001),{time:at,value}].sort((a,b)=>a.time-b.time)}}
}
export function toggleImageKeyframe(layer: ImageLayer, field: ImageAnimatedField, time: number): ImageLayer {
 const at=keyframeTime(time), previous=layer.keyframes?.[field]??[]
 if(previous.some(point=>Math.abs(point.time-at)<.001)) {
  const remaining=previous.filter(point=>Math.abs(point.time-at)>=.001)
  return {...layer,...(remaining.length?{}:{[field]:imageValue(layer,field,at)}),keyframes:{...layer.keyframes,[field]:remaining}}
 }
 return setImageKeyframe(layer,field,at,imageValue(layer,field,at))
}
export function sliceImageLayer(layer: ImageLayer, from: number, to: number, offset: number): ImageLayer | undefined {
 const start=Math.max(layer.start,from),end=Math.min(layer.end,to)
 if(end<=start)return undefined
 const keys: Partial<Record<ImageAnimatedField,Keyframe[]>>={}
 for(const field of imageAnimatedFields) {
  const points=layer.keyframes?.[field];if(!points?.length)continue
  keys[field]=trimRedundantKeyframeEndpoints(end-start<=.001?[{time:start-offset,value:imageValue(layer,field,start)}]:[{time:start-offset,value:imageValue(layer,field,start)},...points.filter(point=>point.time>start+.001 && point.time<end-.001).map(point=>({time:point.time-offset,value:point.value})),{time:end-offset,value:imageValue(layer,field,end)}])
 }
 return {...layer,start:start-offset,end:end-offset,effects:sliceVisualEffects(layer.effects,start,end,offset),...(Object.keys(keys).length?{keyframes:keys}:{keyframes:undefined})}
}
