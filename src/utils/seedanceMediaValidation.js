export const SEEDANCE_MAX_IMAGE_PIXELS = 36_000_000
export const SEEDANCE_MAX_IMAGE_BYTES = 30 * 1024 * 1024

function toPositiveNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function getSeedanceImageCompressionPlan(meta = {}) {
  const width = toPositiveNumber(meta.width)
  const height = toPositiveNumber(meta.height)
  const size = toPositiveNumber(meta.size)
  const pixels = width * height
  const overPixels = pixels > SEEDANCE_MAX_IMAGE_PIXELS
  const overSize = size > SEEDANCE_MAX_IMAGE_BYTES

  if (!overPixels && !overSize) {
    return {
      needsCompression: false,
      reason: '',
      targetWidth: Math.round(width),
      targetHeight: Math.round(height)
    }
  }

  let targetWidth = width
  let targetHeight = height
  if (overPixels && pixels > 0) {
    const scale = Math.sqrt(SEEDANCE_MAX_IMAGE_PIXELS / pixels)
    targetWidth = Math.max(1, Math.floor(width * scale))
    targetHeight = Math.max(1, Math.floor(height * scale))
    while (targetWidth * targetHeight > SEEDANCE_MAX_IMAGE_PIXELS) {
      targetWidth -= 1
    }
  }

  return {
    needsCompression: true,
    reason: overPixels ? 'pixels' : 'size',
    targetWidth: Math.round(targetWidth),
    targetHeight: Math.round(targetHeight)
  }
}

export function validatePreparedSeedanceImage(meta = {}) {
  const width = toPositiveNumber(meta.width)
  const height = toPositiveNumber(meta.height)
  const size = toPositiveNumber(meta.size)
  if (width > 0 && height > 0 && width * height > SEEDANCE_MAX_IMAGE_PIXELS) {
    return '图片像素超过3600万，自动压缩后仍不符合要求，请更换图片'
  }
  if (size > SEEDANCE_MAX_IMAGE_BYTES) {
    return '图片大小超过30MB，自动压缩后仍不符合要求，请更换图片'
  }
  return ''
}

export const SEEDANCE_MAX_IMAGES = 9
export const SEEDANCE_MAX_VIDEOS = 3
export const SEEDANCE_MAX_AUDIOS = 3

export function validateSeedanceModeInputs({ mode, imageCount = 0, videoCount = 0, audioCount = 0 } = {}) {
  if (imageCount > SEEDANCE_MAX_IMAGES) {
    return `参考图片数量不能超过${SEEDANCE_MAX_IMAGES}张，当前${imageCount}张`
  }
  if (videoCount > SEEDANCE_MAX_VIDEOS) {
    return `参考视频数量不能超过${SEEDANCE_MAX_VIDEOS}个，当前${videoCount}个`
  }
  if (audioCount > SEEDANCE_MAX_AUDIOS) {
    return `参考音频数量不能超过${SEEDANCE_MAX_AUDIOS}个，当前${audioCount}个`
  }
  if (mode === 'image2video_first' && imageCount < 1) {
    return '请上传或连接首帧图片'
  }
  if (mode === 'image2video_first_last') {
    if (imageCount < 1) return '请上传或连接首帧图片'
    if (imageCount < 2) return '请上传或连接尾帧图片'
  }
  if (mode === 'multimodal_ref' && imageCount < 1 && videoCount < 1) {
    return '多模态模式至少需要一个参考图片或参考视频'
  }
  if (mode === 'video_edit' && videoCount < 1) {
    return 'Seedance 视频编辑模式至少需要一个参考视频'
  }
  if (mode === 'video_extend' && videoCount < 1) {
    return 'Seedance 视频延长模式至少需要一个参考视频'
  }
  return ''
}
