import * as React from 'react'
import type { TimelineWaveform } from './useTimelineWaveforms'

/** A cropped source waveform follows trim and split offsets without decoding again. */
export function TimelineWaveformView({ waveform, start, duration }: { waveform: TimelineWaveform; start: number; duration: number }) {
 const count = 192, { peaks } = waveform
 const bars = Array.from({ length: count }, (_, index) => {
  const from = Math.max(0, Math.floor((start + duration * index / count) / waveform.duration * peaks.length))
  const to = Math.min(peaks.length, Math.max(from + 1, Math.ceil((start + duration * (index + 1) / count) / waveform.duration * peaks.length)))
  let level = 0
  for (let at = from; at < to; at++) level = Math.max(level, peaks[at] ?? 0)
  return level
 })
 return <svg data-timeline-waveform aria-hidden="true" viewBox={`0 0 ${count * 2} 100`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full text-[var(--mf-brand)] opacity-70">{bars.map((level, index) => <rect key={index} x={index * 2} y={50 - level * 46} width="1" height={Math.max(1, level * 92)} fill="currentColor" />)}</svg>
}
