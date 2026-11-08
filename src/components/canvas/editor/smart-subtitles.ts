import { editorStorage } from './storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_TEXT_LAYERS, type AudioLayer, type SubtitleSegment, type TextLayer, type VideoClip, type VideoLayer, type VideoToolApi, type VideoToolJob } from './api'
import type { ClipboardDraft, ClipboardSelection } from './clipboard'
import { frameTime } from './timeline-snap'
import { nextVisualZ } from './visual-order'

/** One audio-bearing timeline element, mapped between source and timeline seconds. */
export interface SubtitleTarget { resource: string; media_type: 'video' | 'audio'; source_start: number; source_end: number; timeline_start: number; rate: number; name: string }

const subtitleStyle = { x: .5, y: .88, size: 42, color: 'FFFFFF', opacity: 1, font: 'sans', background: { enabled: true, color: '000000', padding: 8 } } as const

export function subtitleTarget(state: ClipboardDraft, ref: ClipboardSelection | undefined): SubtitleTarget | undefined {
 if (!ref) return
 if (ref.kind === 'main') {
  const clip: VideoClip | undefined = state.clips[ref.index]
  if (!clip || clip.media_type === 'image') return
  const timeline_start = state.clips.slice(0, ref.index).reduce((sum, item) => sum + (item.end - item.start) / item.rate, 0)
  return { resource: clip.resource_uuid, media_type: 'video', source_start: clip.start, source_end: clip.end, timeline_start, rate: clip.rate, name: `片段 ${ref.index + 1}` }
 }
 if (ref.kind === 'video') {
  const layer: VideoLayer | undefined = state.videoLayers[ref.index]
  if (!layer) return
  return { resource: layer.resource_uuid, media_type: 'video', source_start: layer.source_start, source_end: layer.source_start + (layer.end - layer.start) * layer.rate, timeline_start: layer.start, rate: layer.rate, name: `叠加视频${ref.index + 1}` }
 }
 if (ref.kind === 'audio') {
  const layer: AudioLayer | undefined = state.audioLayers[ref.index]
  if (!layer) return
  return { resource: layer.resource_uuid, media_type: 'audio', source_start: layer.source_start, source_end: layer.source_start + layer.end - layer.start, timeline_start: layer.start, rate: 1, name: `音频${ref.index + 1}` }
 }
}

/** Place recognised lines on one new text track above every existing visual. */
export function subtitleTextLayers(state: ClipboardDraft, target: SubtitleTarget, segments: SubtitleSegment[], trackId: string, fps: number): TextLayer[] {
 const z = nextVisualZ(state.videoLayers, state.imageLayers, state.textLayers, state.effectLayers)
 const visibleEnd = Math.min(600, target.timeline_start + (target.source_end - target.source_start) / target.rate)
 const layers: TextLayer[] = []
 for (const segment of segments) {
  const start = Math.max(layers.at(-1)?.end ?? 0, frameTime(target.timeline_start + segment.start / target.rate, fps))
  const end = Math.min(visibleEnd, frameTime(target.timeline_start + segment.end / target.rate, fps))
  if (end - start < 1 / Math.max(fps, 1)) continue
  layers.push({ ...subtitleStyle, background: { ...subtitleStyle.background }, text: segment.text, start, end, track_id: trackId, z_index: z, track_hidden: false })
 }
 if (layers.length > MAX_TEXT_LAYERS - state.textLayers.length) throw Object.assign(new Error(`文字元素超过 ${MAX_TEXT_LAYERS} 个上限，字幕结果已保留；请删除部分文字后等待自动写入`), { code: 'subtitle_capacity' })
 return layers
}

const terminal = new Set(['quoted', 'succeeded', 'failed', 'unknown'])
type Pending = { job: string; target: SubtitleTarget }

function readPending(key?: string): Pending | undefined {
 try {
  const raw = key ? JSON.parse(editorStorage.getItem(key) ?? 'null') as Pending | null : null
  const t = raw?.target
  if (!raw || typeof raw.job !== 'string' || !/^[a-f0-9-]{36}$/.test(raw.job) || !t || typeof t.resource !== 'string' || (t.media_type !== 'video' && t.media_type !== 'audio') || ![t.source_start, t.source_end, t.timeline_start, t.rate].every(Number.isFinite) || t.rate <= 0 || typeof t.name !== 'string') return
  return raw
 } catch { return undefined }
}
function writePending(key: string | undefined, value?: Pending) {
 if (!key) return
 if (value) editorStorage.setItem(key, JSON.stringify(value)); else editorStorage.removeItem(key)
}

/**
 * Quote, confirm and poll one smart-subtitle job. A submitted job is remembered
 * for the editor session so closing the editor does not lose a paid result.
 */
export function useSmartSubtitles({ api, project, storageKey, onSegments }: { api: VideoToolApi; project: string; storageKey?: string; onSegments(target: SubtitleTarget, segments: SubtitleSegment[], jobId: string): string }) {
 const [target, setTarget] = useState<SubtitleTarget>()
 const [job, setJob] = useState<VideoToolJob>()
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const [recovering, setRecovering] = useState(() => Boolean(readPending(storageKey)))
 const applied = useRef('')
 const apply = useRef(onSegments)
 apply.current = onSegments
 useEffect(() => {
  const pending = readPending(storageKey)
  setRecovering(Boolean(pending))
  if (!pending) return
  let live = true
  let timer: ReturnType<typeof setTimeout> | undefined
  setTarget(pending.target)
  const lookup = () => { void api.get(project, pending.job).then(next => {
   if (!live) return
   if (next.operation !== 'subtitle') throw new Error('字幕任务类型无效')
   setJob(next); setRecovering(false); setError('')
  }).catch(() => { if (live) { setError('E7009 字幕任务状态暂不可用，正在重试，请勿重复生成'); timer = setTimeout(lookup, 2000) } }) }
  lookup()
  return () => { live = false; clearTimeout(timer) }
 }, [api, project, storageKey])
 useEffect(() => {
  if (!job || terminal.has(job.state)) return
  let live = true
  const timer = setInterval(() => { void api.get(project, job.uuid).then(next => { if (live) setJob(next) }).catch(() => { /* Keep polling the same job. */ }) }, 2000)
  return () => { live = false; clearInterval(timer) }
 }, [api, project, job?.uuid, job?.state])
 useEffect(() => {
  if (!job || !target) return
  if (job.state === 'failed') { writePending(storageKey); setError(`${job.error_code ?? 'E7009'} 字幕识别失败，积分已退回`); return }
  if (job.state === 'unknown') { setError('E7099 字幕任务结果待确认，请勿重复生成'); return }
  if (job.state !== 'succeeded' || applied.current === job.uuid) return
  if (!api.subtitles) { setError('E7009 当前环境暂不支持读取字幕结果'); return }
  let live = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const load = () => { void api.subtitles!(project, job.uuid).then(segments => {
   if (!live) return
   let notice = ''
   editorStorage.transaction(() => { notice = apply.current(target, segments, job.uuid); writePending(storageKey) })
   applied.current = job.uuid
   setNotice(notice); setError(''); setJob(undefined); setTarget(undefined)
  }).catch(error => { if (live) { setError(error?.code === 'subtitle_capacity' ? error.message : 'E7009 字幕结果读取失败，正在重试'); timer = setTimeout(load, 2000) } }) }
  load()
  return () => { live = false; clearTimeout(timer) }
 }, [api, project, storageKey, job?.uuid, job?.state, target])
 const start = useCallback(async (next: SubtitleTarget) => {
  if (recovering || busy || (job && job.state !== 'failed')) return
  setBusy(true); setError(''); setNotice(''); setTarget(next); setJob(undefined)
  try {
   setJob(await api.quote(project, { operation: 'subtitle', mode: '', clips: [{ resource_uuid: next.resource, ...(next.media_type === 'audio' ? { media_type: 'audio' as const } : {}), start: next.source_start, end: next.source_end, rate: 1, volume_db: 0 }] }))
  } catch { setTarget(undefined); setError('E7009 无法为该片段生成字幕，请确认片段包含音频且智能字幕已启用') }
  finally { setBusy(false) }
 }, [api, project, busy, job, recovering])
 const confirm = useCallback(async () => {
  if (!job || job.state !== 'quoted' || !target || busy) return
  setBusy(true); setError('')
  let attempted = false
  try {
   writePending(storageKey, { job: job.uuid, target })
   await editorStorage.flush()
   attempted = true
   const next = await api.submit(project, job.uuid)
   setJob(next)
  } catch {
   if (attempted) { setError('E7099 提交状态待确认，正在查询原任务，请勿重复生成'); setJob({ ...job, state: 'queued' }) }
   else setError('E7009 字幕任务编号尚未保存，请先重试保存再确认生成')
  }
  finally { setBusy(false) }
 }, [api, project, storageKey, job, target, busy])
 const cancel = useCallback(() => { if (recovering || (job && !terminal.has(job.state))) return; writePending(storageKey); setJob(undefined); setTarget(undefined); setError(''); setNotice('') }, [job, recovering, storageKey])
 return { target, job, busy, error, notice, active: recovering || Boolean(job && (!terminal.has(job.state) || (job.state === 'succeeded' && applied.current !== job.uuid))), start, confirm, cancel }
}
