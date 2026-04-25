import { findClosestAspectRatio } from './aspectRatio.js'

export function resolveNanoBananaAspectRatio(width, height) {
  const numericWidth = Number(width)
  const numericHeight = Number(height)

  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight) || numericWidth <= 0 || numericHeight <= 0) {
    return '1:1'
  }

  return findClosestAspectRatio(numericWidth, numericHeight)
}
