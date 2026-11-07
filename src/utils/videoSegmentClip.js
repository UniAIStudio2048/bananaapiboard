const round = value => Math.round(value * 1000) / 1000
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function initialClipRange(duration) {
  const length = Math.max(0, Number(duration) || 0)
  return { start: 0, end: Math.min(length, Math.max(length / 3, 1)) }
}

export function resizeClipRange(range, duration, edge, time, snap = false) {
  const length = Math.max(0, Number(duration) || 0)
  const minimum = Math.min(1, length)
  const nearest = Math.round(time)
  const target = snap ? nearest : time
  if (edge === 'start') {
    return { start: round(clamp(target, 0, Math.max(0, range.end - minimum))), end: range.end }
  }
  return { start: range.start, end: round(clamp(target, Math.min(length, range.start + minimum), length)) }
}

export function moveClipRange(range, duration, delta, snap = false) {
  const length = Math.max(0, Number(duration) || 0)
  const span = Math.min(length, range.end - range.start)
  let start = clamp(range.start + delta, 0, length - span)
  if (snap) {
    const adjustments = [start, start + span].map(time => Math.round(time) - time)
      .filter(adjustment => Math.abs(adjustment) <= 0.1)
      .sort((a, b) => Math.abs(a) - Math.abs(b))
    if (adjustments.length) start = clamp(start + adjustments[0], 0, length - span)
  }
  start = round(start)
  return { start, end: round(start + span) }
}

export function adjustClipRangeByKey(range, duration, key, playhead = 0, fast = false) {
  const step = fast ? 1 : 0.1
  if (key === 'ArrowLeft') return moveClipRange(range, duration, -step)
  if (key === 'ArrowRight') return moveClipRange(range, duration, step)
  if (key === 'ArrowUp') return resizeClipRange(range, duration, 'end', range.end - step)
  if (key === 'ArrowDown') return resizeClipRange(range, duration, 'end', range.end + step)
  if (key.toLowerCase() === 'i') return resizeClipRange(range, duration, 'start', playhead)
  if (key.toLowerCase() === 'o') return resizeClipRange(range, duration, 'end', playhead)
  return range
}

export function getClipBarPosition(anchor, viewportWidth, viewportHeight, height) {
  const width = Math.max(0, Math.min(980, viewportWidth - 24))
  const left = clamp(anchor.left + anchor.width / 2 - width / 2, 12, Math.max(12, viewportWidth - width - 12))
  const top = clamp(anchor.bottom + 12, 8, Math.max(8, viewportHeight - height - 8))
  return { left: round(left), top: round(top), width }
}
