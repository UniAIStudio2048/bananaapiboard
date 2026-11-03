import type { ColorKeyframe, TextLayer } from './api'
import { keyframeTime } from './keyframe-values'
export type ColorField='color'|'background_color'
export const colorFields:ColorField[]=['color','background_color']
export function validColorKeys(points:unknown):points is ColorKeyframe[]|undefined {
 if(points===undefined)return true
 if(!Array.isArray(points)||points.length>34)return false
 let previous=-1
 for(const point of points){if(!point||!Number.isFinite(point.time)||point.time<0||point.time>600||point.time-previous<.001||typeof point.value!=='string'||!/^[0-9a-f]{6}$/i.test(point.value))return false;previous=point.time}
 return true
}
function base(layer:TextLayer,field:ColorField) {return field==='color'?layer.color:layer.background?.color??'000000'}
export function colorValue(layer:TextLayer,field:ColorField,time:number):string {
 const points=layer.keyframes?.[field]??[]
 if(!points.length)return base(layer,field)
 let a=points[0],b=points[points.length-1]
 if(time<=a.time)return a.value
 if(time>=b.time)return b.value
 for(let i=1;i<points.length;i++)if(time<=points[i].time){a=points[i-1];b=points[i];break}
 const ratio=(time-a.time)/(b.time-a.time)
 return [0,2,4].map(i=>Math.round(parseInt(a.value.slice(i,i+2),16)*(1-ratio)+parseInt(b.value.slice(i,i+2),16)*ratio).toString(16).padStart(2,'0')).join('').toUpperCase()
}
export function setColorKeyframe(layer:TextLayer,field:ColorField,time:number,value:string):TextLayer {
 const at=keyframeTime(time),points=layer.keyframes?.[field]??[]
 if(points.length>=32&&!points.some(point=>Math.abs(point.time-at)<.001))return layer
 return {...layer,keyframes:{...layer.keyframes,[field]:[...points.filter(point=>Math.abs(point.time-at)>=.001),{time:at,value}].sort((a,b)=>a.time-b.time)}}
}
export function toggleColorKeyframe(layer:TextLayer,field:ColorField,time:number):TextLayer {
 const at=keyframeTime(time),points=layer.keyframes?.[field]??[],remaining=points.filter(point=>Math.abs(point.time-at)>=.001)
 if(remaining.length===points.length)return setColorKeyframe(layer,field,at,colorValue(layer,field,at))
 const current=colorValue(layer,field,at),update=remaining.length?{}:field==='color'?{color:current}:layer.background?{background:{...layer.background,color:current}}:{}
 return {...layer,...update,keyframes:{...layer.keyframes,[field]:remaining}}
}
