const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const clean = value => Math.round(value * 1e8) / 1e8

export function initialFrameCrop() {
  return { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
}

export function moveFrameCrop(crop, dx, dy) {
  return { ...crop, x: clean(clamp(crop.x + dx, 0, 1 - crop.width)), y: clean(clamp(crop.y + dy, 0, 1 - crop.height)) }
}

export function resizeFrameCrop(crop, edge, dx, dy, width, height) {
  const minWidth = Math.min(1, 16 / width)
  const minHeight = Math.min(1, 16 / height)
  let left = crop.x, top = crop.y, right = crop.x + crop.width, bottom = crop.y + crop.height
  if (edge.includes('w')) left = clamp(left + dx, 0, right - minWidth)
  if (edge.includes('e')) right = clamp(right + dx, left + minWidth, 1)
  if (edge.includes('n')) top = clamp(top + dy, 0, bottom - minHeight)
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + minHeight, 1)
  return { x: clean(left), y: clean(top), width: Math.max(minWidth, clean(right - left)), height: Math.max(minHeight, clean(bottom - top)) }
}

export function frameCropPixels(crop, width, height) {
  const evenFloor = value => Math.floor((value + 1e-7) / 2) * 2
  const x = clamp(evenFloor(crop.x * width), 0, evenFloor(width - 2))
  const y = clamp(evenFloor(crop.y * height), 0, evenFloor(height - 2))
  return {
    x, y,
    width: clamp(evenFloor(crop.width * width), 2, evenFloor(width - x)),
    height: clamp(evenFloor(crop.height * height), 2, evenFloor(height - y))
  }
}
