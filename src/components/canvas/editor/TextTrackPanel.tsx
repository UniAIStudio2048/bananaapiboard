import * as React from 'react'
import { BlendModeSelect } from './BlendModeSelect'

import type { TextAnimatedField, TextBackgroundAnimatedField, TextLayer } from './api'
import { backgroundValue, keyframeTime, setBackgroundKeyframe, setTextKeyframe, toggleBackgroundKeyframe, toggleTextKeyframe, valueAt } from './text-keyframes'
import { colorValue, setColorKeyframe, toggleColorKeyframe, type ColorField } from './color-keyframes'

const control = 'w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100'
export function TextTrackPanel({ layers, time, disabled, onChange, onDelete, onSavePreset, selectedIndex }: {
  layers: TextLayer[]
  selectedIndex?: number
  time: number
  disabled: boolean
  onChange(index: number, change: Partial<TextLayer>): void
  onDelete(index: number): void
  onSavePreset(layer: TextLayer): void
}) {
  if (!layers.length) return null
  const colorControl=(layer:TextLayer,index:number,field:ColorField)=>{
   const label=field==='color'?'颜色':'背景颜色',points=layer.keyframes?.[field]??[],at=keyframeTime(time),active=points.some(point=>Math.abs(point.time-at)<.001),outside=time<layer.start||time>=layer.end
   return <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs"><span>颜色 <button type="button" aria-label={`文字${index+1}${label}关键帧`} aria-pressed={active} disabled={disabled||outside||(!active&&points.length>=32)} onClick={()=>onChange(index,toggleColorKeyframe(layer,field,time))}>{active?'◆':'◇'}</button></span><input aria-label={`文字${index+1}${label}`} type="color" value={`#${colorValue(layer,field,time)}`} disabled={disabled||(points.length>0&&outside)} onChange={event=>{const value=event.target.value.slice(1);onChange(index,points.length?setColorKeyframe(layer,field,time,value):field==='color'?{color:value}:{background:{...layer.background!,color:value}})}} /></label>
  }
  const transformControl=(layer:TextLayer,index:number,key:TextAnimatedField,label:string,compact=false)=>{
   const points=layer.keyframes?.[key]??[],at=keyframeTime(time),active=points.some(point=>Math.abs(point.time-at)<.001),outside=time<layer.start||time>=layer.end
   return <div key={key} className={`${compact?'grid gap-1':'grid grid-cols-[64px_1fr] items-center gap-2'} text-xs`}><span>{label} <button type="button" aria-label={`文字${index+1}${label}关键帧`} aria-pressed={active} title={outside?'将播放头移入文字片段':'切换当前时间的关键帧'} disabled={disabled||outside||(!active&&points.length>=32)} onClick={()=>onChange(index,toggleTextKeyframe(layer,key,time))}>{active?'◆':'◇'}</button></span><input aria-label={`文字${index+1}${label}`} className={control} type="number" step={key==='size'?'.1':key==='rotation'?'1':'.05'} value={Number(valueAt(layer[key]??(key==='scale'?1:0),points,time).toFixed(4))} disabled={disabled||(points.length>0&&outside)} onChange={event=>{const value=Number(event.target.value);onChange(index,points.length?setTextKeyframe(layer,key,time,value):{[key]:value})}} /></div>
  }
  return <div aria-label="文字轨道" className="grid gap-4">
    {layers.map((layer, index) => selectedIndex !== undefined && selectedIndex !== index ? null : <div key={index} className="grid gap-4">
      <section className="grid gap-2"><p className="font-medium">内容</p><textarea aria-label={`文字${index + 1}内容`} className={`${control} min-h-16 resize-y`} rows={3} maxLength={1000} value={layer.text} disabled={disabled} onChange={event => onChange(index, { text: event.target.value })} /></section>
      <section className="grid gap-2"><p className="font-medium">变换</p>{([['scale','缩放'],['x','位置 X'],['y','位置 Y'],['rotation','旋转']] as const).map(([key,label])=>transformControl(layer,index,key,label))}</section>
      <section className="grid gap-2"><p className="font-medium">混合</p><div className="grid grid-cols-2 items-end gap-2">{transformControl(layer,index,'opacity','透明度',true)}<BlendModeSelect value={layer.blend_mode} disabled={disabled} onChange={blend_mode=>onChange(index,{blend_mode})}/></div></section>
      <section className="grid gap-2"><p className="font-medium">字体排版</p>
       <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs">字体<select aria-label={`文字${index + 1}字体`} className={control} value={layer.font} disabled={disabled} onChange={event => onChange(index, { font: event.target.value as TextLayer['font'] })}><option className="bg-white text-[#111827]" value="sans">黑体</option><option className="bg-white text-[#111827]" value="serif">宋体</option></select></label>
       {transformControl(layer,index,'size','字号')}
       {colorControl(layer,index,'color')}
      </section>
      <section className="grid gap-2"><p className="font-medium">背景</p>
       <label className="flex items-center gap-2 text-xs"><input aria-label={`文字${index + 1}背景`} type="checkbox" checked={layer.background?.enabled ?? false} disabled={disabled} onChange={event => onChange(index, {background:{...layer.background,enabled:event.target.checked,color:layer.background?.color ?? '000000',padding:layer.background?.padding ?? 30}})} />启用文字背景</label>
       {layer.background?.enabled && <>{colorControl(layer,index,'background_color')}<label className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs">边距<input aria-label={`文字${index + 1}背景边距`} className={control} type="number" min="0" max="200" step="1" value={layer.background.padding} disabled={disabled} onChange={event=>onChange(index,{background:{...layer.background!,padding:Number(event.target.value),...(layer.background?.padding_x!==undefined?{padding_x:Number(event.target.value)}:{}),...(layer.background?.padding_y!==undefined?{padding_y:Number(event.target.value)}:{})}})} /></label></>}
       {layer.background?.enabled && ([['background_padding_x','宽度',0,600],['background_padding_y','高度',0,600],['background_offset_x','X 偏移',-600,600],['background_offset_y','Y 偏移',-600,600],['background_radius','圆角',0,100]] as const).map(([field,label,min,max])=>{const points=layer.keyframes?.[field]??[],at=keyframeTime(time),active=points.some(point=>Math.abs(point.time-at)<.001),outside=time<layer.start||time>=layer.end,key=field.slice('background_'.length) as 'padding_x'|'padding_y'|'offset_x'|'offset_y'|'radius';return <div key={field} className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs"><span>{label} <button type="button" aria-label={`文字${index+1}背景${label}关键帧`} aria-pressed={active} disabled={disabled||outside||(!active&&points.length>=32)} onClick={()=>onChange(index,toggleBackgroundKeyframe(layer,field,time))}>{active?'◆':'◇'}</button></span><input aria-label={`文字${index+1}背景${label}`} className={control} type="number" min={min} max={max} step="1" value={Number(backgroundValue(layer,field,time).toFixed(3))} disabled={disabled||(points.length>0&&outside)} onChange={event=>{const value=Number(event.target.value);onChange(index,points.length?setBackgroundKeyframe(layer,field as TextBackgroundAnimatedField,time,value):{background:{...layer.background!,[key]:value}})}} /></div>})}
      </section>
      <section className="grid gap-2"><p className="font-medium">时间</p>{([['start', '起点'], ['end', '终点']] as const).map(([key, label]) => <label key={key} className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs">{label}<input aria-label={`文字${index + 1}${label}`} className={control} type="number" step=".1" value={layer[key]} disabled={disabled} onChange={event => onChange(index, { [key]: Number(event.target.value) })} /></label>)}</section>
      <button type="button" aria-label="保存文字预设" disabled={disabled} onClick={()=>onSavePreset(layer)} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-100 hover:border-[var(--mf-brand)] disabled:opacity-50">保存预设</button>
      <button type="button" className="text-left text-xs text-red-300" aria-label={`删除文字${index + 1}`} disabled={disabled} onClick={() => onDelete(index)}>删除文字</button>
    </div>)}
  </div>
}
