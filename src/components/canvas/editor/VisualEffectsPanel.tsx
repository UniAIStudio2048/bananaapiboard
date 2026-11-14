import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'
import type { VisualEffect } from './api'
import { keyframeTime, valueAt } from './keyframe-values'
import { setEffectKeyframe, toggleEffectKeyframe } from './visual-effects'

export function VisualEffectsPanel({effects,time,outside,disabled,onChange}:{effects:VisualEffect[];time:number;outside:boolean;disabled:boolean;onChange(effects:VisualEffect[]):void}) {
 if(!effects.length)return null
 const update=(index:number,effect:VisualEffect)=>onChange(effects.map((item,i)=>i===index?effect:item))
 return <section aria-label={translateUi('uiMessages.mf4e0af07b382')} className="grid gap-3 border-t border-white/10 pt-3 text-sm"><p className="font-medium">{translateUi('uiMessages.mf4e0af07b382')}</p>{effects.map((effect,index)=>{
  const points=effect.keyframes??[],at=keyframeTime(time),active=points.some(point=>Math.abs(point.time-at)<.001)
  return <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><span>{translateUi('uiMessages.m406c2386ead4', { value1: (index+1) })}</span><div className="flex gap-3"><button type="button" aria-label={translateUi('uiMessages.m7f304bff1d05', { value1: (effect.enabled?translateUi('uiMessages.m4e6fd0e28c55'):translateUi('directorStudio.inspector.enabled')), value2: (index+1) })} aria-pressed={effect.enabled} disabled={disabled} onClick={()=>update(index,{...effect,enabled:!effect.enabled})}>{effect.enabled?translateUi('onboarding.settings.edgeStyleHidden'):translateUi('directorStudio.inspector.visible')}</button><button type="button" aria-label={translateUi('uiMessages.mae8de1fd3ab6', { value1: (index+1) })} disabled={disabled} onClick={()=>onChange(effects.filter((_,i)=>i!==index))}>{translateUi('canvas.delete')}</button></div></div><label>{translateUi('uiMessages.ma2846644a638')}<button type="button" aria-label={translateUi('uiMessages.m88df60cba576', { value1: (index+1) })} aria-pressed={active} disabled={disabled||outside||(!active&&points.length>=32)} onClick={()=>update(index,toggleEffectKeyframe(effect,time))}>{active?'◆':'◇'}</button><input aria-label={translateUi('uiMessages.m112baeaafe02', { value1: (index+1) })} type="number" min="0" max="100" step="1" className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" value={Number(valueAt(effect.intensity,points,time).toFixed(3))} disabled={disabled||(points.length>0&&outside)} onChange={event=>{const value=Number(event.target.value);update(index,points.length?setEffectKeyframe(effect,time,value):{...effect,intensity:value})}} /></label></div>
 })}</section>
}
