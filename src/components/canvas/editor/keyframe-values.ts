import type { Keyframe } from './api'

export const keyframeTime = (time: number) => Math.round(Math.max(0, Math.min(600, time)) * 1000) / 1000
export function valueAt(base:number, points:Keyframe[] | undefined, time:number):number {
 if (!points?.length) return base
 if (time <= points[0].time) return points[0].value
 for (let i=1; i<points.length; i++) {
  const left=points[i-1], right=points[i]
  if (time <= right.time) return left.value+(right.value-left.value)*(time-left.time)/(right.time-left.time)
 }
 return points[points.length-1].value
}

/** Drop only flat synthetic boundaries if clipping exceeds the accepted key count. */
export function trimRedundantKeyframeEndpoints<T extends number|string>(points:{time:number;value:T}[]):{time:number;value:T}[] {
 if(points.length<=34)return points
 const result=points.slice(), equal=(a:T,b:T)=>typeof a==='string'&&typeof b==='string'?a.toUpperCase()===b.toUpperCase():a===b
 if(result.length>34&&equal(result[0].value,result[1].value))result.shift()
 if(result.length>34&&equal(result[result.length-1].value,result[result.length-2].value))result.pop()
 return result
}
