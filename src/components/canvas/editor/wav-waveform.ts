import type { TimelineWaveform } from './useTimelineWaveforms'

// Streaming avoids holding a long uncompressed recording in an AudioBuffer.
// Limits bound network and CPU work for an optional timeline visualization.
const MAX_STREAM_BYTES = 512 * 1024 * 1024
const MAX_HEADER_CHUNK = 65_536
const READ_BYTES = 65_536

class StreamReader {
 private chunks: Uint8Array[] = []
 private offset = 0
 private available = 0
 private total = 0
 constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}
 async read(size: number): Promise<Uint8Array | undefined> {
  while (this.available < size) {
   const { done, value } = await this.reader.read()
   if (done) return undefined
   this.total += value.byteLength
   if (this.total > MAX_STREAM_BYTES) throw new Error('audio stream too large')
   this.chunks.push(value); this.available += value.byteLength
  }
  const output = new Uint8Array(size); let written = 0
  while (written < size) {
   const chunk = this.chunks[0], length = Math.min(size - written, chunk.length - this.offset)
   output.set(chunk.subarray(this.offset, this.offset + length), written)
   written += length; this.offset += length; this.available -= length
   if (this.offset === chunk.length) { this.chunks.shift(); this.offset = 0 }
  }
  return output
 }
 async skip(size: number): Promise<boolean> {
  while (size > 0) { const count = Math.min(size, READ_BYTES); if (!await this.read(count)) return false; size -= count }
  return true
 }
}

function ascii(bytes: Uint8Array, offset: number, text: string) {
 return [...text].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0))
}

/** Read complete PCM/float WAV data incrementally; never report a partial waveform. */
export async function readWavWaveform(response: Response, signal: AbortSignal): Promise<TimelineWaveform | undefined> {
 if (!response.ok || !response.body) return undefined
 if (Number(response.headers.get('content-length')) > MAX_STREAM_BYTES) { await response.body.cancel(); return undefined }
 const reader = response.body.getReader(), input = new StreamReader(reader)
 try {
  const header = await input.read(12)
  if (!header || !ascii(header, 0, 'RIFF') || !ascii(header, 8, 'WAVE')) return undefined
  const riffBytes = new DataView(header.buffer).getUint32(4, true)
  if (riffBytes < 4) return undefined
  let remaining = riffBytes - 4
  let format: { code: number; channels: number; sampleRate: number; bits: number; frameBytes: number } | undefined
  for (;;) {
   if (signal.aborted || remaining < 8) return undefined
   const chunk = await input.read(8); if (!chunk) return undefined
   const chunkBytes = new DataView(chunk.buffer).getUint32(4, true)
   remaining -= 8
   if (chunkBytes > MAX_STREAM_BYTES || chunkBytes + chunkBytes % 2 > remaining) return undefined
   remaining -= chunkBytes + chunkBytes % 2
   if (ascii(chunk, 0, 'fmt ')) {
    if (chunkBytes < 16 || chunkBytes > MAX_HEADER_CHUNK) return undefined
    const bytes = await input.read(chunkBytes); if (!bytes) return undefined
    const view = new DataView(bytes.buffer), tag = view.getUint16(0, true), channels = view.getUint16(2, true), sampleRate = view.getUint32(4, true), frameBytes = view.getUint16(12, true), bits = view.getUint16(14, true)
    let code = tag
    if (tag === 0xfffe) {
     // WAVE_FORMAT_EXTENSIBLE contains a standard PCM or IEEE-float subtype GUID.
     if (bytes.length < 40 || view.getUint16(16, true) < 22 || 18 + view.getUint16(16, true) > bytes.length || view.getUint16(18, true) < 1 || view.getUint16(18, true) > bits) return undefined
     const suffix = [0, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71]
     if (!suffix.every((value, index) => bytes[25 + index] === value)) return undefined
     code = bytes[24]
    }
    if ((code !== 1 && code !== 3) || channels < 1 || channels > 8 || sampleRate < 1 || sampleRate > 192_000 || ![8, 16, 24, 32].includes(bits) || (code === 3 && bits !== 32) || frameBytes !== channels * bits / 8) return undefined
    format = { code, channels, sampleRate, bits, frameBytes }
   } else if (ascii(chunk, 0, 'data')) {
    if (!format || chunkBytes === 0 || chunkBytes % format.frameBytes !== 0) return undefined
    const frames = chunkBytes / format.frameBytes, duration = frames / format.sampleRate
    if (!Number.isFinite(duration) || duration <= 0) return undefined
    const peaks = new Array<number>(Math.min(1200, Math.max(128, Math.ceil(duration * 10)))).fill(0)
    const framesPerRead = Math.max(1, Math.floor(READ_BYTES / format.frameBytes)), sampleBytes = format.bits / 8
    let position = 0
    while (position < frames) {
     if (signal.aborted) return undefined
     const count = Math.min(framesPerRead, frames - position), bytes = await input.read(count * format.frameBytes)
     if (!bytes) return undefined
     const view = new DataView(bytes.buffer)
     for (let frame = 0; frame < count; frame++) {
      let peak = 0
      for (let channel = 0; channel < format.channels; channel++) {
       const offset = frame * format.frameBytes + channel * sampleBytes
       let value: number
       if (format.code === 3) value = view.getFloat32(offset, true)
       else if (format.bits === 8) value = (view.getUint8(offset) - 128) / 128
       else if (format.bits === 16) value = view.getInt16(offset, true) / 32768
       else if (format.bits === 24) { const raw = view.getUint8(offset) | view.getUint8(offset + 1) << 8 | view.getUint8(offset + 2) << 16; value = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608 }
       else value = view.getInt32(offset, true) / 2147483648
       if (Number.isFinite(value)) peak = Math.max(peak, Math.min(1, Math.abs(value)))
      }
      const bucket = Math.min(peaks.length - 1, Math.floor((position + frame) * peaks.length / frames))
      peaks[bucket] = Math.max(peaks[bucket], peak)
     }
     position += count
    }
    return { peaks, duration }
   } else if (!await input.skip(chunkBytes)) return undefined
   if (chunkBytes % 2 && !await input.skip(1)) return undefined
  }
 } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
