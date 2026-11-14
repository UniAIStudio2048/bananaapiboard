import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'
import type { VideoTransform } from './api'
import type { BlendMode } from './blend-mode'
import { BlendModeSelect } from './BlendModeSelect'
import { keyframeTime, valueAt } from './text-keyframes'
import { setVideoKeyframe, toggleVideoKeyframe } from './video-keyframes'

const field='w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100'
export function VideoTransformControls({transform,time,outside,disabled,blendMode,onTransform,onBlend}:{transform:VideoTransform;time:number;outside:boolean;disabled:boolean;blendMode?:BlendMode;onTransform(value:VideoTransform):void;onBlend(value:BlendMode):void}) {
 const fields=[['scale',translateUi('directorStudio.inspector.scale'),.1,4,.05],['x',translateUi('uiMessages.m5484805add55'),-2,2,.01],['y',translateUi('uiMessages.m985aade0a013'),-2,2,.01],['rotation',translateUi('directorStudio.inspector.rotation'),-360,360,1],['opacity',translateUi('uiMessages.m2a7357d73df6'),0,1,.05]] as const
 const control=([key,label,min,max,step]:typeof fields[number])=>{
  const points=transform.keyframes?.[key]??[],active=points.some(point=>Math.abs(point.time-keyframeTime(time))<.001)
  return <label key={key} className="min-w-0">{label} <button type="button" aria-label={translateUi('uiMessages.mb5a498e7d163', { value1: (label) })} aria-pressed={active} disabled={disabled||outside||(!active&&points.length>=32)} onClick={()=>onTransform(toggleVideoKeyframe(transform,key,time))}>{active?'◆':'◇'}</button><input aria-label={label} className={field} type="number" min={min} max={max} step={step} value={Number(valueAt(transform[key],points,time).toFixed(4))} disabled={disabled||(points.length>0&&outside)} onChange={event=>{const value=Number(event.target.value);onTransform(points.length?setVideoKeyframe(transform,key,time,value):{...transform,[key]:value})}} /></label>
 }
 return <>{fields.slice(0,4).map(control)}<p className="font-medium">{translateUi('uiMessages.m1b76c104f489')}</p><div className="grid grid-cols-2 items-end gap-2">{control(fields[4])}<BlendModeSelect value={blendMode} disabled={disabled} onChange={onBlend}/></div></>
}
