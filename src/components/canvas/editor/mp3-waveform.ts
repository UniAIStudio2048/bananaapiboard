import type { TimelineWaveform } from './useTimelineWaveforms'

const MAX_BYTES = 128 * 1024 * 1024
const MAX_ID3_BYTES = 32 * 1024 * 1024
const MAX_DECODE_BATCH = 64

/** Bounded, incremental read: audio frames are at most a few KiB. */
class Mp3Reader {
 private chunks: Uint8Array[] = []
 private offset = 0
 private count = 0
 private total = 0
 private done = false
 constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}
 get available() { return this.count }
 async peek(size: number): Promise<Uint8Array | undefined> {
  while (this.count < size && !this.done) {
   const result = await this.reader.read()
   if (result.done) { this.done = true; break }
   this.total += result.value.byteLength
   if (this.total > MAX_BYTES) throw new Error('audio stream too large')
   if (result.value.byteLength) { this.chunks.push(result.value); this.count += result.value.byteLength }
  }
  if (this.count < size) return undefined
  const result = new Uint8Array(size); let written = 0, index = 0, offset = this.offset
  while (written < size) { const chunk = this.chunks[index++], length = Math.min(size - written, chunk.length - offset); result.set(chunk.subarray(offset, offset + length), written); written += length; offset = 0 }
  return result
 }
 async read(size: number): Promise<Uint8Array | undefined> {
  const result = await this.peek(size); if (!result) return undefined
  let remaining = size
  while (remaining) { const chunk = this.chunks[0], length = Math.min(remaining, chunk.length - this.offset); this.offset += length; this.count -= length; remaining -= length; if (this.offset === chunk.length) { this.chunks.shift(); this.offset = 0 } }
  return result
 }
 async skip(size: number): Promise<boolean> { while (size > 0) { const part = Math.min(size, 65536); if (!await this.read(part)) return false; size -= part } return true }
}

type Frame = { bytes: number; sampleRate: number; channels: number; samples: number; version: number }
function frameHeader(bytes: Uint8Array): Frame | undefined {
 const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
 const version = header >>> 19 & 3, layer = header >>> 17 & 3, bitrate = header >>> 12 & 15, rate = header >>> 10 & 3
 if (header >>> 21 !== 0x7ff || version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || rate === 3) return undefined
 const sampleRate = [44100, 48000, 32000][rate] / (version === 3 ? 1 : version === 2 ? 2 : 4)
 const rates = version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
 return { bytes: Math.floor((version === 3 ? 144 : 72) * rates[bitrate] * 1000 / sampleRate) + (header >>> 9 & 1), sampleRate, channels: (header >>> 6 & 3) === 3 ? 1 : 2, samples: version === 3 ? 1152 : 576, version }
}
function text(bytes: Uint8Array, start: number, length: number) { return String.fromCharCode(...bytes.subarray(start, start + length)) }

/** Accept gapless Xing/Info streams only when their declared duration matches playback. */
function gapless(frame: Uint8Array, info: Frame, duration: number) {
 const at = 4 + (info.version === 3 ? (info.channels === 1 ? 17 : 32) : (info.channels === 1 ? 9 : 17))
 if (frame.length < at + 8 || !['Xing', 'Info'].includes(text(frame, at, 4))) return undefined
 const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength), flags = view.getUint32(at + 4)
 if (!(flags & 1) || flags & ~15 || frame.length < at + 12) return undefined
 const frames = view.getUint32(at + 8)
 const encoder = at + 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0) + (flags & 4 ? 100 : 0) + (flags & 8 ? 4 : 0)
 if (!frames || frame.length < encoder + 24 || !['LAME', 'Lavc', 'Lavf'].includes(text(frame, encoder, 4))) return undefined
 const bits = frame[encoder + 21] * 65536 + frame[encoder + 22] * 256 + frame[encoder + 23], delay = bits >>> 12, padding = bits & 4095
 if (Math.abs((frames * info.samples - delay - padding) / info.sampleRate - duration) > .1) return undefined
 return { frames, skip: delay + 529 }
}

/** Stream gapless MP3 frames through WebCodecs without expanding the whole file. */
export async function readMp3Waveform(response: Response, duration: number, signal: AbortSignal): Promise<TimelineWaveform | undefined> {
 if (!response.ok || !response.body || typeof AudioDecoder !== 'function' || typeof EncodedAudioChunk !== 'function' || !Number.isFinite(duration) || duration <= 0) { await response.body?.cancel(); return undefined }
 if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body.cancel(); return undefined }
 const reader = response.body.getReader(), input = new Mp3Reader(reader)
 let decoder: AudioDecoder | undefined
 try {
  const initial = await input.peek(10); if (!initial) return undefined
  if (text(initial, 0, 3) === 'ID3') {
   if (initial[3] < 2 || initial[3] > 4 || initial.slice(6, 10).some(byte => byte > 127)) return undefined
   const size = initial[6] * 2097152 + initial[7] * 16384 + initial[8] * 128 + initial[9] + 10 + (initial[3] === 4 && initial[5] & 0x10 ? 10 : 0)
   if (size > MAX_ID3_BYTES || !await input.skip(size)) return undefined
  }
  const header = await input.peek(4), info = header && frameHeader(header)
  if (!info || info.bytes < 4) return undefined
  const first = await input.read(info.bytes), metadata = first && gapless(first, info, duration)
  if (!metadata || signal.aborted) return undefined
  const config = { codec: 'mp3', sampleRate: info.sampleRate, numberOfChannels: info.channels }
  if (!(await AudioDecoder.isConfigSupported(config)).supported || signal.aborted) return undefined
  const peaks = new Array<number>(Math.min(1200, Math.max(128, Math.ceil(duration * 10)))).fill(0)
  let failure = false, outputSamples = 0, wake: (() => void) | undefined
  decoder = new AudioDecoder({ error: () => { failure = true; wake?.() }, output: data => {
   try {
    if (data.sampleRate !== info.sampleRate || data.numberOfChannels !== info.channels) { failure = true; wake?.(); return }
    outputSamples += data.numberOfFrames
    for (let channel = 0; channel < data.numberOfChannels; channel++) {
     const samples = new Float32Array(data.numberOfFrames); data.copyTo(samples, { planeIndex: channel, format: 'f32-planar' })
     for (let index = 0; index < samples.length; index++) {
      const time = data.timestamp / 1_000_000 + (index - metadata.skip) / info.sampleRate
      if (time < 0 || time >= duration) continue
      const value = Math.abs(samples[index]); if (!Number.isFinite(value)) continue
      const bucket = Math.min(peaks.length - 1, Math.floor(time / duration * peaks.length))
      peaks[bucket] = Math.max(peaks[bucket], Math.min(1, value))
     }
    }
   } catch { failure = true; wake?.() } finally { data.close() }
  } })
  decoder.configure(config)
  for (let frame = 0; frame < metadata.frames; frame++) {
   if (signal.aborted || failure) return undefined
   const bytes = await input.peek(4), next = bytes && frameHeader(bytes)
   if (!next || next.sampleRate !== info.sampleRate || next.channels !== info.channels || next.version !== info.version || next.bytes < 4) return undefined
   const data = await input.read(next.bytes); if (!data) return undefined
   decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(frame * info.samples * 1_000_000 / info.sampleRate), data }))
   // A mid-stream flush can clear the MP3 bit reservoir. Apply backpressure
   // without flushing so frames that depend on earlier data remain intact.
   if (decoder.decodeQueueSize >= MAX_DECODE_BATCH) await new Promise<void>(resolve => {
    const done = () => { decoder?.removeEventListener('dequeue', done); signal.removeEventListener('abort', done); wake = undefined; resolve() }
    wake = done; decoder!.addEventListener('dequeue', done, { once: true }); signal.addEventListener('abort', done, { once: true })
    if (signal.aborted || failure) done()
   })
  }
  await new Promise<void>((resolve, reject) => {
   const done = () => { signal.removeEventListener('abort', done); resolve() }
   signal.addEventListener('abort', done, { once: true })
   decoder!.flush().then(done, error => { signal.removeEventListener('abort', done); reject(error) })
   if (signal.aborted) done()
  })
  if (failure || signal.aborted || outputSamples < duration * info.sampleRate + metadata.skip - info.samples) return undefined
  const trailer = await input.peek(1)
  if (trailer) {
   const tag = await input.peek(3)
   if (!tag || text(tag, 0, 3) !== 'TAG' || !await input.skip(128) || await input.peek(1)) return undefined
  } else if (input.available) return undefined
  return { peaks, duration }
 } finally { if (decoder && decoder.state !== 'closed') decoder.close(); await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
