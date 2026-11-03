import * as React from 'react'

import { useRef, useState } from 'react'
import type { VideoClip } from './api'

/** A drag is committed once so a single undo restores the prior trim. */
export function ClipTrimHandle({ clip, duration, side, disabled, onCommit }: {
  clip: VideoClip
  duration: number
  side: 'start' | 'end'
  disabled: boolean
  onCommit(value: number): void
}) {
  const drag = useRef<{ x: number; width: number; initial: number; value: number } | undefined>(undefined)
  const [value, setValue] = useState<number>()
  const clamp = (seconds: number) => side === 'start'
    ? Math.max(0, Math.min(clip.end - 0.05, seconds))
    : Math.max(clip.start + 0.05, Math.min(duration, seconds))
  const label = side === 'start' ? '裁剪片段起点' : '裁剪片段终点'
  // The drag offset depends on the measured timeline width at runtime.
  const dragOffset = value === undefined || !drag.current ? 0 : (value - drag.current.initial) / (clip.end - clip.start) * drag.current.width
  return <button type="button" draggable={false} aria-label={label} title={value === undefined ? label : `${label} ${value.toFixed(2)} 秒`} disabled={disabled || !Number.isFinite(duration) || duration <= 0}
    className={`absolute inset-y-1 z-10 w-3 touch-none rounded bg-[var(--mf-brand)]/70 hover:bg-[var(--mf-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${side === 'start' ? 'left-0' : 'right-0'}`}
    style={dragOffset ? { transform: `translateX(${dragOffset}px)` } : undefined}
    onPointerDown={event => {
      event.stopPropagation()
      event.preventDefault()
      const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
      if (!width) return
      const initial = clip[side]
      drag.current = { x: event.clientX, width, initial, value: initial }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      if (!drag.current) return
      const next = clamp(drag.current.initial + (event.clientX - drag.current.x) / drag.current.width * (clip.end - clip.start))
      drag.current.value = next
      setValue(next)
    }}
    onPointerUp={event => {
      event.stopPropagation()
      const current = drag.current
      drag.current = undefined
      setValue(undefined)
      if (current && Math.abs(current.value - current.initial) > 0.001) onCommit(current.value)
    }}
    onPointerCancel={() => { drag.current = undefined; setValue(undefined) }}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      event.stopPropagation()
      onCommit(clamp(clip[side] + (event.key === 'ArrowRight' ? 0.1 : -0.1)))
    }} />
}
