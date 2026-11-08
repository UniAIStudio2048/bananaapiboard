import test from 'node:test'
import assert from 'node:assert/strict'
import { readWavWaveform } from '../wav-waveform'

function wav(bits: 8 | 16 | 24 | 32, floating = false) {
 const frames = 256, channels = 2, frameBytes = channels * bits / 8, dataBytes = frames * frameBytes
 // Odd-sized JUNK exercises padding and fragmented chunk headers.
 const data = new Uint8Array(56 + dataBytes), view = new DataView(data.buffer)
 const text = (offset: number, value: string) => [...value].forEach((character, index) => { data[offset + index] = character.charCodeAt(0) })
 text(0, 'RIFF'); view.setUint32(4, data.length - 8, true); text(8, 'WAVE'); text(12, 'JUNK'); view.setUint32(16, 3, true)
 text(24, 'fmt '); view.setUint32(28, 16, true); view.setUint16(32, floating ? 3 : 1, true); view.setUint16(34, channels, true); view.setUint32(36, 128, true); view.setUint32(40, 128 * frameBytes, true); view.setUint16(44, frameBytes, true); view.setUint16(46, bits, true); text(48, 'data'); view.setUint32(52, dataBytes, true)
 for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) {
  const offset = 56 + i * frameBytes + channel * bits / 8, value = i < frames / 2 ? 0 : channel ? -.5 : .25
  if (floating) view.setFloat32(offset, value, true)
  else if (bits === 8) view.setUint8(offset, 128 + value * 128)
  else if (bits === 16) view.setInt16(offset, value * 32768, true)
  else if (bits === 24) { const n = Math.round(value * 8388608) & 0xffffff; view.setUint8(offset, n); view.setUint8(offset + 1, n >> 8); view.setUint8(offset + 2, n >> 16) }
  else view.setInt32(offset, value * 2147483648, true)
 }
 return data
}
function response(bytes: Uint8Array, chunkSize = 7) {
 let offset = 0
 return new Response(new ReadableStream<Uint8Array>({ pull(controller) { if (offset >= bytes.length) { controller.close(); return } controller.enqueue(bytes.slice(offset, offset + chunkSize)); offset += chunkSize } }))
}
test('streamed PCM and float WAV peaks preserve stereo silence and signal across fragmented chunks', async () => {
 for (const [bits, floating] of [[8, false], [16, false], [24, false], [32, false], [32, true]] as const) {
  const waveform = await readWavWaveform(response(wav(bits, floating)), new AbortController().signal)
  assert.equal(waveform?.duration, 2); assert.equal(waveform?.peaks.length, 128)
  assert.equal(waveform?.peaks[20], 0); assert.ok(Math.abs(waveform!.peaks[100] - .5) < .01)
 }
})
test('streamed WAV rejects truncated, invalid and cancelled inputs instead of displaying partial peaks', async () => {
 const bytes = wav(16), truncated = bytes.slice(0, -5), invalid = bytes.slice(); invalid[0] = 0
 assert.equal(await readWavWaveform(response(truncated), new AbortController().signal), undefined)
 assert.equal(await readWavWaveform(response(invalid), new AbortController().signal), undefined)
 const badRiff = bytes.slice(); new DataView(badRiff.buffer).setUint32(4, 40, true)
 assert.equal(await readWavWaveform(response(badRiff), new AbortController().signal), undefined)
 const controller = new AbortController(); controller.abort()
 assert.equal(await readWavWaveform(response(bytes), controller.signal), undefined)
})
test('WAVE_FORMAT_EXTENSIBLE accepts known PCM and float subtypes, rejecting unknown GUIDs', async () => {
 for (const floating of [false, true]) {
  const original = wav(32, floating), extended = new Uint8Array(original.length + 24)
  extended.set(original.subarray(0, 48)); extended.set(original.subarray(48), 72)
  const view = new DataView(extended.buffer); view.setUint32(4, extended.length - 8, true); view.setUint32(28, 40, true); view.setUint16(32, 0xfffe, true); view.setUint16(48, 22, true); view.setUint16(50, 32, true)
  extended.set([floating ? 3 : 1, 0, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71], 56)
  const result = await readWavWaveform(response(extended, 13), new AbortController().signal)
  assert.ok(Math.abs(result!.peaks[100] - .5) < .01)
  extended[70] = 0; assert.equal(await readWavWaveform(response(extended), new AbortController().signal), undefined)
 }
})
