import type { ImageLayer, Keyframe, VideoClip, VisualEffect } from './api'
import { valueAt } from './keyframe-values'

/** Convert source-time animation into absolute timeline-time animation for a main-track image. */
function imageKeys(points:Keyframe[],base:number,clip:VideoClip,start:number,offset=0):Keyframe[] {
 const values=[{time:clip.start,value:valueAt(base,points,clip.start)},...points.filter(p=>p.time>clip.start&&p.time<clip.end),{time:clip.end,value:valueAt(base,points,clip.end)}]
 const output:Keyframe[]=[]
 for(const point of values){const time=Math.round((start+(point.time-clip.start)/clip.rate)*1000)/1000,value=point.value+offset,last=output.at(-1);if(last&&time-last.time<.001)output[output.length-1]={time,value};else output.push({time,value})}
 // Preserve interpolation while avoiding redundant endpoints over the limit.
 if(output.length>34&&output[0].value===output[1].value)output.shift()
 if(output.length>34&&output.at(-1)!.value===output.at(-2)!.value)output.pop()
 return output
}
export function mainImage(clip:VideoClip,start:number):ImageLayer|undefined {
 const t=clip.transform??{x:0,y:0,scale:1,rotation:0,opacity:1},keys:ImageLayer['keyframes']={}
 for(const field of ['x','y','scale','rotation','opacity'] as const){const points=t.keyframes?.[field];if(points?.length)keys[field]=imageKeys(points,t[field],clip,start,field==='x'||field==='y'?.5:0)}
 const x=t.x+.5,y=t.y+.5
 if([x,y,...(keys.x??[]).map(p=>p.value),...(keys.y??[]).map(p=>p.value)].some(v=>v < -2 || v > 2))return
 const effects:VisualEffect[]|undefined=clip.effects?.map(effect=>({...effect,keyframes:effect.keyframes?.length?imageKeys(effect.keyframes,effect.intensity,clip,start):effect.keyframes}))
 return {resource_uuid:clip.resource_uuid,start,end:start+(clip.end-clip.start)/clip.rate,x,y,scale:t.scale,rotation:t.rotation,opacity:t.opacity,hidden:clip.hidden,blend_mode:clip.blend_mode,effects,...(Object.keys(keys).length?{keyframes:keys}:{})}
}
