import { t as translateUi } from '../../../i18n/index.js'
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
  return <div aria-label={translateUi('uiMessages.mc4b0767efd26')} className="grid gap-2 rounded-xl border border-white/10 bg-zinc-950/30 p-3">
    {layers.map((layer, index) => selectedIndex !== undefined && selectedIndex !== index ? null : <div key={`${layer.resource_uuid}:${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--mf-brand)]/30 bg-[var(--mf-brand)]/5 p-2">
      <span className="min-w-20 text-xs">{sources.find(source => source.resource === layer.resource_uuid)?.name ?? translateUi('uiMessages.md2444a2e68aa', { value1: (index + 1) })}</span>
      {([['start', translateUi('uiMessages.m5491701e1c3a')], ['end', translateUi('uiMessages.m129b7f6241e0')], ['source_start', translateUi('uiMessages.m7036a55a52fc')], ['volume_db', translateUi('uiMessages.m8b83c2976fb1')]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-1 text-xs">{label}<input aria-label={translateUi('uiMessages.m5c952837c74c', { value1: (index + 1), value2: (label) })} className="w-20 rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" type="number" step="0.1" value={layer[key]} disabled={disabled} onChange={event => onChange(index, { [key]: Number(event.target.value) })} /></label>)}
      <button type="button" aria-label={translateUi('uiMessages.mef785a369817', { value1: (index + 1) })} aria-pressed={Boolean(layer.muted)} disabled={disabled} onClick={() => onChange(index, { muted: !layer.muted })}>{layer.muted ? translateUi('uiMessages.m8d01732e7477') : translateUi('uiMessages.m7db2e189ecb0')}</button>
      <button type="button" aria-label={translateUi('uiMessages.m38d1157f74eb', { value1: (index + 1) })} disabled={disabled} onClick={() => onDelete(index)}>{translateUi('canvas.delete')}</button>
    </div>)}
  </div>
}
