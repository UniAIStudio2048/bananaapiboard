
import { useEffect, useRef, useState } from 'react'
import { computeWaveformPeaksFromChannels } from './audio-signal'
import type { AudioLayer } from './api'
import { readWavWaveform } from './wav-waveform'
import { readMp3Waveform } from './mp3-waveform'
import { readContainerWaveform } from './container-waveform'

export type TimelineWaveform = { peaks: readonly number[]; duration: number }
type CacheEntry = { url: string; waveform?: TimelineWaveform }
const MAX_BYTES = 20 * 1024 * 1024
// DecodeAudioData expands compressed audio in memory. Do not decode long files
// solely for this optional visualization; editing and playback still work.
const MAX_SECONDS = 120

async function readWaveform(url: string, duration: number, signal: AbortSignal): Promise<TimelineWaveform | undefined> {
 const deadline = AbortSignal.any([signal, AbortSignal.timeout(90_000)])
 const fetchSource = () => fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: deadline })
 const readLarge = async (response: Response) => {
  const wav = await readWavWaveform(response, deadline)
  if (wav || deadline.aborted) return wav
  const mp3 = await readMp3Waveform(await fetchSource(), duration, deadline)
  if (mp3 || deadline.aborted) return mp3
  return readContainerWaveform(url, duration, deadline)
 }
 const response = await fetchSource()
 if (!response.ok || !response.body) return undefined
 if (duration > MAX_SECONDS || Number(response.headers.get('content-length')) > MAX_BYTES) return readLarge(response)
 const reader = response.body.getReader(), chunks: Uint8Array[] = []
 let size = 0
 try {
  for (;;) {
   const { value, done } = await reader.read()
   if (done) break
   size += value.byteLength
   if (size > MAX_BYTES) { await reader.cancel(); return readLarge(await fetchSource()) }
   chunks.push(value)
  }
 } finally { reader.releaseLock() }
 if (deadline.aborted) return undefined
 const bytes = new Uint8Array(size); let offset = 0
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
 const context = new AudioContext()
 try {
  const buffer = await context.decodeAudioData(bytes.buffer)
  if (deadline.aborted || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_SECONDS) return undefined
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
  return { peaks: computeWaveformPeaksFromChannels(channels, Math.min(1200, Math.max(128, Math.ceil(buffer.duration * 10)))), duration: buffer.duration }
 } finally { void context.close().catch(() => undefined) }
}

/** Decode each eligible audio source once per editor, one at a time. */
export function useTimelineWaveforms(layers: AudioLayer[], urls: Record<string, string>, durations: Record<string, number>) {
 const cache = useRef<Record<string, CacheEntry>>({}), [waveforms, setWaveforms] = useState<Record<string, TimelineWaveform>>({})
 const ids = [...new Set(layers.map(layer => layer.resource_uuid))].sort()
 const signature = JSON.stringify(ids.flatMap(id => urls[id] && durations[id] > 0 && Number.isFinite(durations[id]) ? [[id, urls[id], durations[id]]] : []))
 useEffect(() => {
  const sources = JSON.parse(signature) as [string, string, number][], controller = new AbortController(), next: Record<string, TimelineWaveform> = {}, pending: [string, string, number][] = []
  const keep = new Set(sources.map(([id]) => id)); for (const id of Object.keys(cache.current)) if (!keep.has(id)) delete cache.current[id]
  for (const [id, url, duration] of sources) { const entry = cache.current[id]; if (entry?.url === url) { if (entry.waveform) next[id] = entry.waveform } else pending.push([id, url, duration]) }
  queueMicrotask(() => { if (!controller.signal.aborted) setWaveforms(next) })
  async function work() {
   for (const [id, url, duration] of pending) {
    if (controller.signal.aborted) return
    try {
     const waveform = await readWaveform(url, duration, controller.signal)
     if (controller.signal.aborted) return
     cache.current[id] = { url, waveform }
     if (waveform) setWaveforms(previous => ({ ...previous, [id]: waveform }))
    } catch { if (!controller.signal.aborted) cache.current[id] = { url } }
   }
  }
  void work()
  return () => controller.abort()
 }, [signature])
 return waveforms
}
