import type { TimelineWaveform } from './useTimelineWaveforms'

const MAX_BYTES = 128 * 1024 * 1024
const MAX_CHANNELS = 8
const MAX_SAMPLE_RATE = 192_000

/** Decode container audio incrementally; reject incomplete or unsupported inputs. */
export async function readContainerWaveform(url: string, duration: number, signal: AbortSignal): Promise<TimelineWaveform | undefined> {
 if (signal.aborted || !Number.isFinite(duration) || duration <= 0 || typeof AudioDecoder !== 'function') return undefined
 const { Input, UrlSource, AudioSampleSink, MP4, OGG, MP3 } = await import('mediabunny')
 if (signal.aborted) return undefined
 const source = new UrlSource(url, { requestInit: { credentials: 'same-origin', cache: 'no-store' }, maxCacheSize: 4 * 1024 * 1024, parallelism: 1, getRetryDelay: () => null, handleUnhandledError: () => undefined })
 const input = new Input({ source, formats: [MP4, OGG, MP3] })
 const cancel = () => input.dispose()
 signal.addEventListener('abort', cancel, { once: true })
 try {
  if (signal.aborted || await source.getSize() > MAX_BYTES) return undefined
  const format = await input.getFormat(), track = await input.getPrimaryAudioTrack()
  if (!track || !await track.canDecode()) return undefined
  const codec = await track.getCodec(), channels = await track.getNumberOfChannels(), sampleRate = await track.getSampleRate()
  if (channels < 1 || channels > MAX_CHANNELS || sampleRate < 1 || sampleRate > MAX_SAMPLE_RATE) return undefined
  const peaks = new Array<number>(Math.min(1200, Math.max(128, Math.ceil(duration * 10)))).fill(0)
  let first: number | undefined, last = -Infinity, shift = 0, count = 0
  for await (const sample of new AudioSampleSink(track).samples()) {
   try {
    if (signal.aborted || !Number.isFinite(sample.timestamp) || sample.numberOfChannels !== channels || sample.sampleRate !== sampleRate || sample.numberOfFrames < 1 || sample.numberOfFrames > sampleRate * 10) return undefined
    if (first === undefined) {
     first = sample.timestamp
     // Ogg Vorbis starts with a decoder priming packet. The sample iterator
     // exposes its negative timestamp, while HTML audio starts at that packet.
     if (format === OGG && codec === 'vorbis' && first < 0) { if (first < -.1) return undefined; shift = -first }
    }
    const start = sample.timestamp + shift
    last = Math.max(last, start + sample.numberOfFrames / sampleRate); count++
    for (let channel = 0; channel < channels; channel++) {
     const values = new Float32Array(sample.numberOfFrames)
     sample.copyTo(values, { format: 'f32-planar', planeIndex: channel })
     for (let index = 0; index < values.length; index++) {
      const time = start + index / sampleRate
      if (time < 0 || time >= duration) continue
      const value = Math.abs(values[index]); if (!Number.isFinite(value)) continue
      const bucket = Math.min(peaks.length - 1, Math.floor(time / duration * peaks.length))
      peaks[bucket] = Math.max(peaks[bucket], Math.min(1, value))
     }
    }
   } finally { sample.close() }
  }
  if (signal.aborted || count === 0 || last < duration - .1) return undefined
  return { peaks, duration }
 } finally { signal.removeEventListener('abort', cancel); input.dispose() }
}
