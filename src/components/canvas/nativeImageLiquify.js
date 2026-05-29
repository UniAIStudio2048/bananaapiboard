const MIN_RADIUS = 1
const MAX_RADIUS = 300
const MIN_PRESSURE = 0
const MAX_PRESSURE = 1

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function cloneImageDataLike(imageData) {
  return {
    data: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height
  }
}

function copyPixel(source, target, sourceX, sourceY, targetX, targetY, width) {
  const sourceIndex = (sourceY * width + sourceX) * 4
  const targetIndex = (targetY * width + targetX) * 4

  target[targetIndex] = source[sourceIndex]
  target[targetIndex + 1] = source[sourceIndex + 1]
  target[targetIndex + 2] = source[sourceIndex + 2]
  target[targetIndex + 3] = source[sourceIndex + 3]
}

export function clampLiquifySettings(settings = {}) {
  return {
    radius: clamp(settings.radius, MIN_RADIUS, MAX_RADIUS),
    pressure: clamp(settings.pressure, MIN_PRESSURE, MAX_PRESSURE)
  }
}

export function getLiquifyDirtyRect(options = {}, width = 0, height = 0) {
  const imageWidth = Math.max(0, Math.floor(Number(width) || 0))
  const imageHeight = Math.max(0, Math.floor(Number(height) || 0))

  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const previous = options.previous || {}
  const current = options.current || {}
  const { radius } = clampLiquifySettings({
    radius: options.radius,
    pressure: 1
  })

  const minX = Math.max(0, Math.floor(Math.min(Number(previous.x), Number(current.x)) - radius))
  const maxX = Math.min(imageWidth - 1, Math.ceil(Math.max(Number(previous.x), Number(current.x)) + radius))
  const minY = Math.max(0, Math.floor(Math.min(Number(previous.y), Number(current.y)) - radius))
  const maxY = Math.min(imageHeight - 1, Math.ceil(Math.max(Number(previous.y), Number(current.y)) + radius))

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX + 1),
    height: Math.max(0, maxY - minY + 1)
  }
}

export function applyLiquifyPush(imageData, options = {}) {
  const width = Number(imageData?.width) || 0
  const height = Number(imageData?.height) || 0
  const offsetX = Number(options.offsetX) || 0
  const offsetY = Number(options.offsetY) || 0

  if (!imageData?.data || width <= 0 || height <= 0) {
    return cloneImageDataLike({ data: new Uint8ClampedArray(), width: 0, height: 0 })
  }

  const previous = options.previous || {}
  const current = options.current || {}
  const dx = Number(current.x) - Number(previous.x)
  const dy = Number(current.y) - Number(previous.y)
  const distance = Math.hypot(dx, dy)

  if (!distance) {
    return cloneImageDataLike(imageData)
  }

  const { radius, pressure } = clampLiquifySettings({
    radius: options.radius,
    pressure: options.pressure
  })

  if (pressure <= 0) {
    return cloneImageDataLike(imageData)
  }

  const source = imageData.data
  const target = new Uint8ClampedArray(source)
  const centerX = Number(current.x)
  const centerY = Number(current.y)
  const minX = Math.max(0, Math.floor(centerX - radius - offsetX))
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius - offsetX))
  const minY = Math.max(0, Math.floor(centerY - radius - offsetY))
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius - offsetY))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const globalX = x + offsetX
      const globalY = y + offsetY
      const pointOffsetX = globalX - centerX
      const pointOffsetY = globalY - centerY
      const localDistance = Math.hypot(pointOffsetX, pointOffsetY)

      if (localDistance > radius) continue

      const falloff = 1 - (localDistance / radius)
      const strength = falloff * falloff * pressure
      const sampleGlobalX = clamp(globalX - dx * strength, offsetX, offsetX + width - 1)
      const sampleGlobalY = clamp(globalY - dy * strength, offsetY, offsetY + height - 1)
      const sampleX = Math.round(sampleGlobalX - offsetX)
      const sampleY = Math.round(sampleGlobalY - offsetY)

      copyPixel(source, target, sampleX, sampleY, x, y, width)
    }
  }

  return {
    data: target,
    width,
    height
  }
}
