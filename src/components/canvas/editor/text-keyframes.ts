import type { TextAnimatedField, TextBackgroundAnimatedField, TextLayer } from './api'

export const textAnimatedFields: TextAnimatedField[] = ['x', 'y', 'size', 'scale', 'opacity', 'rotation']
export const backgroundAnimatedFields:TextBackgroundAnimatedField[]=['background_padding_x','background_padding_y','background_offset_x','background_offset_y','background_radius']
export { keyframeTime, valueAt } from './keyframe-values'
import { keyframeTime, trimRedundantKeyframeEndpoints, valueAt } from './keyframe-values'
import { sliceVisualEffects } from './visual-effects'
import { colorFields, colorValue, validColorKeys } from './color-keyframes'

export function validTextBackground(layer: TextLayer): boolean {
 const bg=layer.background
 return bg===undefined || (bg!==null && typeof bg==='object' && typeof bg.enabled==='boolean' && typeof bg.color==='string' && /^[0-9a-f]{6}$/i.test(bg.color) && Number.isFinite(bg.padding) && bg.padding>=0 && bg.padding<=200 && ([['padding_x',0,600],['padding_y',0,600],['offset_x',-600,600],['offset_y',-600,600],['radius',0,100]] as const).every(([key,min,max])=>bg[key]===undefined||(Number.isFinite(bg[key])&&bg[key]!>=min&&bg[key]!<=max)))
}

export function validTextKeyframes(layer: TextLayer): boolean {
  if (layer.scale !== undefined && (!Number.isFinite(layer.scale) || layer.scale < .1 || layer.scale > 4)) return false
  if (layer.rotation !== undefined && (!Number.isFinite(layer.rotation) || layer.rotation < -360 || layer.rotation > 360)) return false
  if (layer.keyframes === undefined) return true
  if (!layer.keyframes || typeof layer.keyframes !== 'object') return false
  if(!colorFields.every(field=>validColorKeys(layer.keyframes?.[field])))return false
  for (const field of textAnimatedFields) {
    const points=layer.keyframes[field]
    if (points === undefined) continue
    if (!Array.isArray(points) || points.length > 34) return false
    let previous=-1
    for (const point of points) {
      const min=field==='size'?4:field==='scale'?.1:field==='rotation'?-360:0, max=field==='size'?300:field==='scale'?4:field==='rotation'?360:1
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.value) || point.time<0 || point.time>600 || point.time-previous<.001 || point.value<min || point.value>max) return false
      previous=point.time
    }
  }
  for (const field of backgroundAnimatedFields) {
    const points=layer.keyframes[field];if(points===undefined)continue
    if(!Array.isArray(points)||points.length>34)return false
    const min=field==='background_offset_x'||field==='background_offset_y'?-600:0,max=field==='background_radius'?100:600
    let previous=-1
    for(const point of points){if(!point||!Number.isFinite(point.time)||!Number.isFinite(point.value)||point.time<0||point.time>600||point.time-previous<.001||point.value<min||point.value>max)return false;previous=point.time}
  }
  return true
}

export function backgroundValue(layer:TextLayer,field:TextBackgroundAnimatedField,time:number):number {
 const bg=layer.background,key=field.slice('background_'.length) as 'padding_x'|'padding_y'|'offset_x'|'offset_y'|'radius'
 const fallback=key==='padding_x'||key==='padding_y'?bg?.padding??0:0
 return valueAt(bg?.[key]??fallback,layer.keyframes?.[field],time)
}
export function setBackgroundKeyframe(layer:TextLayer,field:TextBackgroundAnimatedField,time:number,value:number):TextLayer {
 const at=keyframeTime(time),points=layer.keyframes?.[field]??[]
 if(points.length>=32&&!points.some(point=>Math.abs(point.time-at)<.001))return layer
 return {...layer,keyframes:{...layer.keyframes,[field]:[...points.filter(point=>Math.abs(point.time-at)>=.001),{time:at,value}].sort((a,b)=>a.time-b.time)}}
}
export function toggleBackgroundKeyframe(layer:TextLayer,field:TextBackgroundAnimatedField,time:number):TextLayer {
 const at=keyframeTime(time),points=layer.keyframes?.[field]??[],remaining=points.filter(point=>Math.abs(point.time-at)>=.001)
 if(remaining.length===points.length)return setBackgroundKeyframe(layer,field,at,backgroundValue(layer,field,at))
 const key=field.slice('background_'.length) as 'padding_x'|'padding_y'|'offset_x'|'offset_y'|'radius'
 return {...layer,...(!remaining.length&&layer.background?{background:{...layer.background,[key]:backgroundValue(layer,field,at)}}:{}),keyframes:{...layer.keyframes,[field]:remaining}}
}

export function setTextKeyframe(layer: TextLayer, field: TextAnimatedField, time: number, value: number): TextLayer {
  const at=keyframeTime(time), previous=layer.keyframes?.[field] ?? []
  if (previous.length >= 32 && !previous.some(point => Math.abs(point.time-at)<.001)) return layer
  const points=[...previous.filter(point => Math.abs(point.time-at)>=.001),{ time:at, value }].sort((a,b)=>a.time-b.time)
  return { ...layer, keyframes: { ...layer.keyframes, [field]: points } }
}

export function toggleTextKeyframe(layer: TextLayer, field: TextAnimatedField, time: number): TextLayer {
  const at=keyframeTime(time), previous=layer.keyframes?.[field] ?? []
  if (previous.some(point => Math.abs(point.time-at)<.001)) {
    const remaining=previous.filter(point => Math.abs(point.time-at)>=.001)
    return { ...layer, ...(remaining.length ? {} : { [field]:valueAt(layer[field] ?? (field==='scale'?1:0),previous,at) }), keyframes: { ...layer.keyframes, [field]: remaining } }
  }
  return setTextKeyframe(layer,field,at,valueAt(layer[field] ?? (field==='scale'?1:0),previous,at))
}

/** Clip absolute keyframe time to a selected export while retaining boundary values. */
export function sliceTextLayer(layer: TextLayer, from: number, to: number, offset: number): TextLayer | undefined {
  const start=Math.max(layer.start,from), end=Math.min(layer.end,to)
  if (end <= start) return undefined
  const keys: NonNullable<TextLayer['keyframes']> = {}
  for (const field of textAnimatedFields) {
    const points=layer.keyframes?.[field]
    if (!points?.length) continue
    keys[field]=trimRedundantKeyframeEndpoints(end-start<=.001 ? [{time:start-offset,value:valueAt(layer[field] ?? (field==='scale'?1:0),points,start)}] : [{time:start-offset,value:valueAt(layer[field] ?? (field==='scale'?1:0),points,start)}, ...points.filter(point=>point.time>start+.001 && point.time<end-.001).map(point=>({time:point.time-offset,value:point.value})), {time:end-offset,value:valueAt(layer[field] ?? (field==='scale'?1:0),points,end)}])
  }
  for(const field of backgroundAnimatedFields){const points=layer.keyframes?.[field];if(!points?.length)continue;keys[field]=trimRedundantKeyframeEndpoints(end-start<=.001?[{time:start-offset,value:backgroundValue(layer,field,start)}]:[{time:start-offset,value:backgroundValue(layer,field,start)},...points.filter(point=>point.time>start+.001&&point.time<end-.001).map(point=>({time:point.time-offset,value:point.value})),{time:end-offset,value:backgroundValue(layer,field,end)}])}
  for(const field of colorFields){const points=layer.keyframes?.[field];if(!points?.length)continue;keys[field]=trimRedundantKeyframeEndpoints(end-start<=.001?[{time:start-offset,value:colorValue(layer,field,start)}]:[{time:start-offset,value:colorValue(layer,field,start)},...points.filter(point=>point.time>start+.001&&point.time<end-.001).map(point=>({time:point.time-offset,value:point.value})),{time:end-offset,value:colorValue(layer,field,end)}])}
  return { ...layer, start:start-offset, end:end-offset, effects:sliceVisualEffects(layer.effects,start,end,offset), ...(Object.keys(keys).length ? { keyframes:keys } : { keyframes:undefined }) }
}
