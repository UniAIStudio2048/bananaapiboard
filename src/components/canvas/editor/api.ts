import type { ApiPort } from '@flowx/module-contracts'
import type { BlendMode } from './blend-mode'
export type VideoAnimatedField = 'scale' | 'x' | 'y' | 'rotation' | 'opacity'
export interface VideoTransform { scale: number; x: number; y: number; rotation: number; opacity: number; keyframes?: Partial<Record<VideoAnimatedField, Keyframe[]>> }
export interface VisualEffect { type:'blur'; enabled:boolean; intensity:number; keyframes?:Keyframe[] }
export interface VideoClip { blend_mode?:BlendMode; muted?:boolean; effects?:VisualEffect[]; media_type?: 'video' | 'image'; hidden?: boolean; track_hidden?: boolean; resource_uuid: string; start: number; end: number; rate: number; volume_db: number; transform?: VideoTransform }
export interface VideoLayer { blend_mode?:BlendMode; effects?:VisualEffect[]; track_id?: string; track_muted?: boolean; hidden?: boolean; track_hidden?: boolean; z_index?: number; resource_uuid: string; start: number; end: number; source_start: number; rate: number; volume_db: number; muted?: boolean; transform?: VideoTransform }
export type ImageAnimatedField = 'x' | 'y' | 'scale' | 'rotation' | 'opacity'
export interface ImageLayer { blend_mode?:BlendMode; is_sticker?:boolean; effects?:VisualEffect[]; track_id?: string; track_muted?: boolean; hidden?: boolean; track_hidden?: boolean; z_index?: number; resource_uuid: string; start: number; end: number; x: number; y: number; scale: number; rotation?: number; opacity: number; keyframes?: Partial<Record<ImageAnimatedField, Keyframe[]>> }
export interface EffectLayer { track_id?: string; hidden?: boolean; track_hidden?: boolean; z_index?: number; start: number; end: number; intensity: number }
export interface AudioLayer { track_id?: string; track_order?: number; track_muted?: boolean; resource_uuid: string; start: number; end: number; source_start: number; volume_db: number; muted?: boolean }
export interface Keyframe { time: number; value: number }
export interface ColorKeyframe { time: number; value: string }
export type TextAnimatedField = 'x' | 'y' | 'size' | 'scale' | 'opacity' | 'rotation'
export type TextBackgroundAnimatedField = 'background_padding_x'|'background_padding_y'|'background_offset_x'|'background_offset_y'|'background_radius'
export interface TextBackground { enabled: boolean; color: string; padding: number; padding_x?:number; padding_y?:number; offset_x?:number; offset_y?:number; radius?:number }
export interface TextLayer { blend_mode?:BlendMode; effects?:VisualEffect[]; scale?: number; track_id?: string; hidden?: boolean; track_hidden?: boolean; rotation?: number; z_index?: number; background?: TextBackground; text: string; start: number; end: number; x: number; y: number; size: number; color: string; opacity: number; font: 'sans' | 'serif'; keyframes?: Partial<Record<TextAnimatedField | TextBackgroundAnimatedField, Keyframe[]>> & {color?:ColorKeyframe[];background_color?:ColorKeyframe[]} }
export interface VideoRect { x1: number; y1: number; x2: number; y2: number }
export type EraseMode = 'subtitle_all_area' | 'subtitle_sel_area' | 'watermark_all_area' | 'watermark_sel_area'
export type VideoAspect = '' | '16:9' | '4:3' | '2.35:1' | '2:1' | '1.85:1' | '9:16' | '3:4' | '5.8' | '1:1'
export interface VideoCover { frame_time?: number; resource_uuid?: string; prepend?: boolean }
export interface VideoToolInput { effect_layers?: EffectLayer[]; background_color?: string; origin_resource_uuid?: string; canvas_source?: 'origin'; cover?: VideoCover; operation: 'edit' | 'erase' | 'depth'; mode: EraseMode | ''; depth_resolution?: '480P' | '720P'; clips: VideoClip[]; rect?: VideoRect; output_kind?: 'video' | 'audio' | 'both'; audio_format?: 'mp3' | 'wav'; output_fps?: 24 | 25 | 30 | 60 | 120; output_aspect?: VideoAspect; output_resolution?: 360 | 480 | 720 | 1080; output_resolution_mode?: 'height'; output_mute?: boolean; output_format?: 'mp4' | 'webm'; video_layers?: VideoLayer[]; audio_layers?: AudioLayer[]; image_layers?: ImageLayer[]; text_layers?: TextLayer[] }
export interface VideoToolJob { cover?: VideoCover; output_fps?: 24 | 25 | 30 | 60 | 120; output_kind?: 'video' | 'audio' | 'both'; audio_format?: 'mp3' | 'wav'; operation?: string; depth_resolution?: '480P' | '720P'; source_resource_uuid?: string; output_format?: 'mp4' | 'webm'; uuid: string; state: string; seconds: number; peas: number; error_code?: string; created_at: string }
export interface VideoToolConfig { edit_enabled: boolean; erase_enabled: boolean; depth_enabled?: boolean; subtitle_enabled?: boolean }
/** Text elements per timeline; matches media-service MaxTextLayers so a long clip can be fully subtitled. */
export const MAX_TEXT_LAYERS = 300
export interface SubtitleToolInput { operation: 'subtitle'; mode: ''; clips: [{ resource_uuid: string; media_type?: 'video' | 'audio'; start: number; end: number; rate: 1; volume_db: 0 }] }
/** Times are seconds from the start of the transcribed source range. */
export interface SubtitleSegment { start: number; end: number; text: string }
export interface VideoToolApi {
 source(project: string, resource: string): Promise<string>
 checkProjectAccess(project: string): Promise<void>
 config(): Promise<VideoToolConfig>
 quote(project: string, input: VideoToolInput | SubtitleToolInput): Promise<VideoToolJob>
 submit(project: string, id: string): Promise<VideoToolJob>
 get(project: string, id: string): Promise<VideoToolJob>
 list(project: string): Promise<VideoToolJob[]>
 result(project: string, id: string, kind?: 'audio' | 'video'): Promise<string>
 depthResult?(project: string, id: string): Promise<Blob>
 subtitles?(project: string, id: string): Promise<SubtitleSegment[]>
}
const states = new Set(['quoted', 'queued', 'reserving', 'submitting', 'rendering', 'running', 'settling', 'releasing', 'succeeded', 'failed', 'unknown'])
export function validCover(cover: VideoCover): boolean {
 if (!cover || typeof cover !== 'object' || (cover.prepend !== undefined && typeof cover.prepend !== 'boolean')) return false
 const hasFrame=cover.frame_time !== undefined, hasResource=cover.resource_uuid !== undefined
 return hasFrame !== hasResource && (hasFrame ? typeof cover.frame_time === 'number' && Number.isFinite(cover.frame_time) && cover.frame_time >= 0 && cover.frame_time < 600 : typeof cover.resource_uuid === 'string' && /^(https?:\/\/|\/)/.test(cover.resource_uuid))
}
export function parseVideoToolJob(v: unknown): VideoToolJob {
 const r = v as VideoToolJob
 if (!r || typeof r.uuid !== 'string' || !/^[a-f0-9-]{36}$/.test(r.uuid) || !states.has(r.state) || !Number.isSafeInteger(r.seconds) || r.seconds < 1 || !Number.isSafeInteger(r.peas) || r.peas < 0 || typeof r.created_at !== 'string' || (r.cover !== undefined && (!validCover(r.cover) || r.output_kind === 'audio')) || (r.output_fps !== undefined && ![24,25,30,60,120].includes(r.output_fps)) || (r.output_format !== undefined && r.output_format !== 'mp4' && r.output_format !== 'webm') || (r.output_kind !== undefined && r.output_kind !== 'video' && r.output_kind !== 'audio' && r.output_kind !== 'both') || (r.output_kind === 'audio' || r.output_kind === 'both' ? r.audio_format !== 'mp3' && r.audio_format !== 'wav' : r.audio_format !== undefined)) throw new Error('E7009')
 if (r.depth_resolution !== undefined && (r.operation !== 'depth' || (r.depth_resolution !== '480P' && r.depth_resolution !== '720P'))) throw new Error('E7009')
 return { ...(r.cover ? {cover:{...(r.cover.frame_time !== undefined ? {frame_time:r.cover.frame_time} : {resource_uuid:r.cover.resource_uuid}),...(r.cover.prepend ? {prepend:true} : {})}} : {}), ...(r.output_fps ? {output_fps:r.output_fps} : {}), ...(r.output_kind === 'video' || r.output_kind === 'audio' || r.output_kind === 'both' ? { output_kind:r.output_kind } : {}), ...(r.audio_format === 'mp3' || r.audio_format === 'wav' ? { audio_format:r.audio_format } : {}), ...(typeof r.operation === 'string' ? { operation: r.operation } : {}), ...(r.depth_resolution ? { depth_resolution:r.depth_resolution } : {}), ...(typeof r.source_resource_uuid === 'string' ? { source_resource_uuid: r.source_resource_uuid } : {}), ...(r.output_format === 'mp4' || r.output_format === 'webm' ? { output_format: r.output_format } : {}), uuid: r.uuid, state: r.state, seconds: r.seconds, peas: r.peas, created_at: r.created_at, ...(/^E\d{4}$/.test(r.error_code ?? '') ? { error_code: r.error_code } : {}) }
}
export function createVideoToolApi(port: ApiPort, getAccessToken: () => string | null = () => null, fetcher: typeof fetch = globalThis.fetch): VideoToolApi {
 async function request(method: string, path: string, body?: unknown) {
  const e = await port.request<{ code: number; data: unknown }>({ method, path, ...(body !== undefined ? { body } : {}) })
  if (!e || e.code !== 0) throw new Error('E7009')
  return e.data
 }
 const base = (project: string) => `/api/v1/media/projects/${encodeURIComponent(project)}/video-tools`
 return {
  async depthResult(project, id) {
   if (!/^[a-f0-9-]{36}$/.test(project) || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('E7009')
   const token = getAccessToken()
   if (!token || /[\r\n]/.test(token)) throw new Error('E7008')
   const response = await fetcher(`${base(project)}/jobs/${encodeURIComponent(id)}/depth-content`, { credentials:'same-origin', cache:'no-store', redirect:'error', headers:{ Authorization:`Bearer ${token}` } })
   if (!response.ok) throw new Error('E7009')
   const blob = await response.blob()
   if (blob.type.split(';')[0] !== 'video/mp4' || blob.size === 0 || blob.size > 500*1024*1024) throw new Error('E7009')
   return blob
  },
  async source(project, resource) { const d = await request('GET', `${base(project)}/sources/${encodeURIComponent(resource)}`) as { url: string }; if (typeof d?.url !== 'string' || new URL(d.url).protocol !== 'https:') throw new Error('E7009'); return d.url },
  async checkProjectAccess(project) { const d = await request('GET', `/api/v1/media/projects/${encodeURIComponent(project)}`) as { project?: { uuid?: unknown } }; if (typeof d?.project?.uuid !== 'string' || d.project.uuid.toLowerCase() !== project.toLowerCase()) throw new Error('E7009') },
  async config() { const c = await request('GET', '/api/v1/media/video-tools/config') as VideoToolConfig; if (typeof c?.edit_enabled !== 'boolean' || typeof c.erase_enabled !== 'boolean' || (c.depth_enabled !== undefined && typeof c.depth_enabled !== 'boolean') || (c.subtitle_enabled !== undefined && typeof c.subtitle_enabled !== 'boolean')) throw new Error('E7009'); return { edit_enabled: c.edit_enabled, erase_enabled: c.erase_enabled, ...(c.depth_enabled !== undefined ? { depth_enabled: c.depth_enabled } : {}), ...(c.subtitle_enabled !== undefined ? { subtitle_enabled: c.subtitle_enabled } : {}) } },
  async subtitles(project, id) { const data = await request('GET', `${base(project)}/jobs/${encodeURIComponent(id)}/subtitles`) as { segments: unknown }; return parseSubtitleSegments(data?.segments) },
  async quote(project, input) { return parseVideoToolJob(await request('POST', `${base(project)}/quotes`, input)) },
  async submit(project, id) { return parseVideoToolJob(await request('POST', `${base(project)}/jobs/${encodeURIComponent(id)}`)) },
  async get(project, id) { return parseVideoToolJob(await request('GET', `${base(project)}/jobs/${encodeURIComponent(id)}`)) },
  async list(project) { const data = await request('GET', `${base(project)}/jobs`) as { items: unknown[] }; if (!Array.isArray(data?.items)) throw new Error('E7009'); return data.items.map(parseVideoToolJob) },
  async result(project, id, kind) { const data = await request('GET', `${base(project)}/jobs/${encodeURIComponent(id)}/result${kind ? `?kind=${kind}` : ''}`) as { url: string }; if (typeof data?.url !== 'string' || new URL(data.url).protocol !== 'https:') throw new Error('E7009'); return data.url },
 }
}
export function clipDuration(c: VideoClip) { return (c.end - c.start) / c.rate }
export function splitClip(clips: VideoClip[], index: number, sourceTime: number, keep: 'both' | 'left' | 'right' = 'both'): VideoClip[] {
 const c = clips[index]; if (!c || sourceTime <= c.start + 0.05 || sourceTime >= c.end - 0.05) return clips
 const left = { ...c, end: sourceTime }; const right = { ...c, start: sourceTime }
 return [...clips.slice(0, index), ...(keep === 'both' ? [left, right] : [keep === 'left' ? left : right]), ...clips.slice(index + 1)]
}
export function timelineSeek(clips: VideoClip[], seconds: number): { index: number; sourceTime: number } {
 let offset = 0
 for (let index=0; index<clips.length; index++) {
  const c=clips[index]; const duration=clipDuration(c)
  if (seconds < offset+duration || index===clips.length-1) return { index, sourceTime: c.start+Math.max(0,Math.min(duration,seconds-offset))*c.rate }
  offset+=duration
 }
 return { index:0, sourceTime:0 }
}
export function parseSubtitleSegments(value: unknown): SubtitleSegment[] {
 if (!Array.isArray(value) || value.length > MAX_TEXT_LAYERS) throw new Error('E7009')
 return value.map(item => {
  const s = item as SubtitleSegment
  if (!s || typeof s.text !== 'string' || !s.text.trim() || s.text.length > 1000 || s.text.includes('\0') || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.end > 600) throw new Error('E7009')
  return { start: s.start, end: s.end, text: s.text }
 })
}
