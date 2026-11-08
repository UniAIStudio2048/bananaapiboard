import * as React from 'react'

import type { AudioLayer } from './api'
import type { AudioSource } from './context'

export function AudioTrackPanel({ layers, sources, disabled, onChange, onDelete, selectedIndex }: {
  layers: AudioLayer[]
  selectedIndex?: number
  sources: AudioSource[]
  disabled: boolean
  onChange(index: number, change: Partial<AudioLayer>): void
  onDelete(index: number): void
}) {
  if (!layers.length) return null
  return <div aria-label="音频轨道" className="grid gap-2 rounded-xl border border-white/10 bg-zinc-950/30 p-3">
    {layers.map((layer, index) => selectedIndex !== undefined && selectedIndex !== index ? null : <div key={`${layer.resource_uuid}:${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--mf-brand)]/30 bg-[var(--mf-brand)]/5 p-2">
      <span className="min-w-20 text-xs">{sources.find(source => source.resource === layer.resource_uuid)?.name ?? `音频 ${index + 1}`}</span>
      {([['start', '起点'], ['end', '终点'], ['source_start', '源起点'], ['volume_db', '音量 dB']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-1 text-xs">{label}<input aria-label={`音频${index + 1}${label}`} className="w-20 rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" type="number" step="0.1" value={layer[key]} disabled={disabled} onChange={event => onChange(index, { [key]: Number(event.target.value) })} /></label>)}
      <button type="button" aria-label={`音频${index + 1}静音`} aria-pressed={Boolean(layer.muted)} disabled={disabled} onClick={() => onChange(index, { muted: !layer.muted })}>{layer.muted ? '取消静音' : '静音'}</button>
      <button type="button" aria-label={`删除音频${index + 1}`} disabled={disabled} onClick={() => onDelete(index)}>删除</button>
    </div>)}
  </div>
}
