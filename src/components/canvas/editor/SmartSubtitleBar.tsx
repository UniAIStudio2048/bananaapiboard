import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'
import type { useSmartSubtitles } from './smart-subtitles'

const labels: Record<string, string> = { get queued() { return translateUi('uiMessages.md6f766f2adf5') }, get reserving() { return translateUi('uiMessages.md3947113d2c1') }, get submitting() { return translateUi('uiMessages.m20f2feef1d74') }, get running() { return translateUi('uiMessages.m712deefb40b3') }, get settling() { return translateUi('uiMessages.m8085010b906a') }, get releasing() { return translateUi('uiMessages.m6fd891d5d8d2') }, get succeeded() { return translateUi('uiMessages.mfc679db1e8b4') } }

export function SmartSubtitleBar({ state, disabled }: { state: ReturnType<typeof useSmartSubtitles>; disabled: boolean }) {
 const { target, job, busy, error, notice } = state
 if (!target && !error && !notice) return null
 return <div role="status" aria-label={translateUi('uiMessages.mc7de24d30bd2')} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-100">
  <span className="font-medium">{translateUi('uiMessages.mc7de24d30bd2')}</span>
  {target && <span className="text-zinc-400">{target.name}</span>}
  {target && !job && busy && <span>{translateUi('uiMessages.ma69c44ffcbb5')}</span>}
  {target && !job && !busy && state.active && <span>{translateUi('uiMessages.m9ffbf9cd94b5')}</span>}
  {job?.state === 'quoted' && <>
   <span className="text-zinc-400">{translateUi('uiMessages.md9d4a7b13a2d', { value1: (job.seconds) })}</span>
   <button type="button" disabled={disabled || busy} onClick={() => void state.confirm()} className="rounded-md bg-white px-3 py-1 text-zinc-900 disabled:opacity-40">{translateUi('uiMessages.m6ee8015207bb', { value1: (job.peas) })}</button>
   <button type="button" disabled={busy} onClick={state.cancel} className="rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10 disabled:opacity-40">{translateUi('canvas.cancel')}</button>
  </>}
  {job && labels[job.state] && <span>{labels[job.state]}{state.active ? translateUi('uiMessages.m899e2bade9bd') : ''}</span>}
  {notice && <span className="text-[var(--mf-brand)]">{notice}</span>}
  {error && <span role="alert" className="text-red-300">{error}</span>}
  {!state.active && job?.state !== 'quoted' && (notice || error) && <button type="button" onClick={state.cancel} className="rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10">{translateUi('directorStudio.close')}</button>}
 </div>
}
