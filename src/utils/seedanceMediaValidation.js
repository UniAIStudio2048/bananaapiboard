export const SEEDANCE_MAX_IMAGE_PIXELS = 36_000_000
export const SEEDANCE_MAX_IMAGE_BYTES = 30 * 1024 * 1024
export const SEEDANCE_MIN_VIDEO_PIXELS = 409_600
export const SEEDANCE_MAX_VIDEO_PIXELS = 927_408
export const SEEDANCE_ANT_MAX_VIDEO_PIXELS = 2_086_876
export const SEEDANCE_MAX_VIDEO_BYTES = 50 * 1024 * 1024

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

function evenCeil(value) {
  return Math.ceil(value / 2) * 2
}

function getMinimumVideoDimensions(width, height) {
  const scale = Math.sqrt(SEEDANCE_MIN_VIDEO_PIXELS / (width * height))
  const targetWidth = evenCeil(width * scale)
  let targetHeight = evenCeil(height * scale)
  while (targetWidth * targetHeight < SEEDANCE_MIN_VIDEO_PIXELS) targetHeight += 2
  return { width: targetWidth, height: targetHeight }
}

export function validateSeedanceVideoMetadata(meta = {}, options = {}) {
  const { index = 0, apiType = '' } = options
  const label = `参考视频${index + 1}`
  const width = Math.round(toPositiveNumber(meta.width))
  const height = Math.round(toPositiveNumber(meta.height))
  const duration = toPositiveNumber(meta.duration)
  const size = toPositiveNumber(meta.size)
  const type = String(meta.type || '').toLowerCase()
  const maxPixels = apiType === 'ant' ? SEEDANCE_ANT_MAX_VIDEO_PIXELS : SEEDANCE_MAX_VIDEO_PIXELS

  if (type && !['video/mp4', 'video/quicktime'].includes(type)) {
    return `${label}格式不受支持，请使用 MP4 或 MOV`
  }
  if (size > SEEDANCE_MAX_VIDEO_BYTES) {
    return `${label}大小超过50MB，请压缩文件后重试`
  }
  if (duration < 2 || duration > 15) {
    return `${label}时长需在2到15秒之间`
  }
  if (!width || !height) {
    return `无法读取${label}的分辨率，请更换视频文件`
  }
  if (width < 300 || height < 300 || width > 6000 || height > 6000) {
    return `${label}尺寸为 ${width}×${height}，宽高均需在 300到6000 像素之间`
  }

  const aspectRatio = width / height
  if (aspectRatio < 0.4 || aspectRatio > 2.5) {
    return `${label}宽高比为 ${aspectRatio.toFixed(2)}，要求在 0.4到2.5之间`
  }

  const pixels = width * height
  if (pixels < SEEDANCE_MIN_VIDEO_PIXELS) {
    const recommended = getMinimumVideoDimensions(width, height)
    return `${label}分辨率过低：当前 ${width}×${height}（${pixels} 像素），要求至少 ${SEEDANCE_MIN_VIDEO_PIXELS} 像素，请提升到 ${recommended.width}×${recommended.height} 或更高后重试`
  }
  if (pixels > maxPixels) {
    return `${label}分辨率过高：当前 ${width}×${height}（${pixels} 像素），当前渠道最多支持 ${maxPixels} 像素`
  }
  return ''
}

export function readLocalVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const timeoutId = setTimeout(() => finish(new Error('读取视频规格超时，请更换视频文件')), 10_000)
    const finish = (error, metadata) => {
      clearTimeout(timeoutId)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      URL.revokeObjectURL(url)
      if (error) reject(error)
      else resolve(metadata)
    }

    video.preload = 'metadata'
    video.onloadedmetadata = () => finish(null, {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      size: file.size,
      type: file.type
    })
    video.onerror = () => finish(new Error('无法读取视频规格，请更换视频文件'))
    video.src = url
  })
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
