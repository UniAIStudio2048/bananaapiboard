import * as React from 'react'
import type { useSmartSubtitles } from './smart-subtitles'

const labels: Record<string, string> = { queued: '排队中', reserving: '冻结积分中', submitting: '提交识别中', running: '语音识别中', settling: '结算中', releasing: '退回积分中', succeeded: '写入时间轴中' }

export function SmartSubtitleBar({ state, disabled }: { state: ReturnType<typeof useSmartSubtitles>; disabled: boolean }) {
 const { target, job, busy, error, notice } = state
 if (!target && !error && !notice) return null
 return <div role="status" aria-label="智能字幕" className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-100">
  <span className="font-medium">智能字幕</span>
  {target && <span className="text-zinc-400">{target.name}</span>}
  {target && !job && busy && <span>正在计算费用…</span>}
  {target && !job && !busy && state.active && <span>正在恢复字幕任务…</span>}
  {job?.state === 'quoted' && <>
   <span className="text-zinc-400">{job.seconds} 秒音频</span>
   <button type="button" disabled={disabled || busy} onClick={() => void state.confirm()} className="rounded-md bg-white px-3 py-1 text-zinc-900 disabled:opacity-40">确认生成 · {job.peas} 积分</button>
   <button type="button" disabled={busy} onClick={state.cancel} className="rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10 disabled:opacity-40">取消</button>
  </>}
  {job && labels[job.state] && <span>{labels[job.state]}{state.active ? ' · 可继续编辑' : ''}</span>}
  {notice && <span className="text-[var(--mf-brand)]">{notice}</span>}
  {error && <span role="alert" className="text-red-300">{error}</span>}
  {!state.active && job?.state !== 'quoted' && (notice || error) && <button type="button" onClick={state.cancel} className="rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10">关闭</button>}
 </div>
}
