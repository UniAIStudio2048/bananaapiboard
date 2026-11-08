import * as React from 'react'
import type { VisualEffect } from './api'
import { keyframeTime, valueAt } from './keyframe-values'
import { setEffectKeyframe, toggleEffectKeyframe } from './visual-effects'

export function VisualEffectsPanel({effects,time,outside,disabled,onChange}:{effects:VisualEffect[];time:number;outside:boolean;disabled:boolean;onChange(effects:VisualEffect[]):void}) {
 if(!effects.length)return null
 const update=(index:number,effect:VisualEffect)=>onChange(effects.map((item,i)=>i===index?effect:item))
 return <section aria-label="素材特效" className="grid gap-3 border-t border-white/10 pt-3 text-sm"><p className="font-medium">素材特效</p>{effects.map((effect,index)=>{
  const points=effect.keyframes??[],at=keyframeTime(time),active=points.some(point=>Math.abs(point.time-at)<.001)
  return <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><span>模糊 {index+1}</span><div className="flex gap-3"><button type="button" aria-label={`${effect.enabled?'停用':'启用'}素材模糊${index+1}`} aria-pressed={effect.enabled} disabled={disabled} onClick={()=>update(index,{...effect,enabled:!effect.enabled})}>{effect.enabled?'隐藏':'显示'}</button><button type="button" aria-label={`删除素材模糊${index+1}`} disabled={disabled} onClick={()=>onChange(effects.filter((_,i)=>i!==index))}>删除</button></div></div><label>强度 <button type="button" aria-label={`素材模糊${index+1}强度关键帧`} aria-pressed={active} disabled={disabled||outside||(!active&&points.length>=32)} onClick={()=>update(index,toggleEffectKeyframe(effect,time))}>{active?'◆':'◇'}</button><input aria-label={`素材模糊${index+1}强度`} type="number" min="0" max="100" step="1" className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" value={Number(valueAt(effect.intensity,points,time).toFixed(3))} disabled={disabled||(points.length>0&&outside)} onChange={event=>{const value=Number(event.target.value);update(index,points.length?setEffectKeyframe(effect,time,value):{...effect,intensity:value})}} /></label></div>
 })}</section>
}
