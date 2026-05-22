function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function readMeta(item, ...keys) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  for (const key of keys) {
    const value = firstValue(item?.[key], metadata[key])
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

export function formatHistoryTimestamp(value) {
  const raw = firstValue(value)
  if (raw === undefined) return '未知'

  let date
  if (typeof raw === 'number') {
    date = new Date(raw < 1e12 ? raw * 1000 : raw)
  } else if (/^\d+$/.test(String(raw))) {
    const numeric = Number(raw)
    date = new Date(numeric < 1e12 ? numeric * 1000 : numeric)
  } else {
    date = new Date(raw)
  }

  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function formatHistoryBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const rounded = size >= 10 || Number.isInteger(size) ? Math.round(size) : Math.round(size * 10) / 10
  return `${rounded} ${units[unitIndex]}`
}

function formatResolution(item) {
  const width = Number(readMeta(item, 'width', 'image_width', 'video_width'))
  const height = Number(readMeta(item, 'height', 'image_height', 'video_height'))
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return `${width} x ${height}`
  }
  return firstValue(
    readMeta(item, 'resolution', 'dimensions', 'imageSize', 'image_size', 'size'),
    item?.aspect_ratio,
    item?.aspectRatio
  ) || ''
}

function formatDuration(value) {
  const duration = firstValue(value)
  if (duration === undefined) return ''
  const text = String(duration).trim()
  if (!text) return ''
  return text.endsWith('s') || text.includes(':') ? text : `${text}s`
}

function formatFps(value) {
  const fps = Number(value)
  if (!Number.isFinite(fps) || fps <= 0) return ''
  return `${Number.isInteger(fps) ? fps : Math.round(fps * 100) / 100} fps`
}

export function buildHistoryMediaDetails(item = {}, options = {}) {
  const modelName = firstValue(
    options.modelName,
    item.model_display_name,
    item.modelDisplayName,
    item.model
  ) || '未知模型'
  const fileSize = formatHistoryBytes(readMeta(item, 'file_size', 'fileSize', 'size_bytes', 'bytes'))
  const details = [
    ['任务ID', firstValue(item.task_id, item.taskId, item.id)],
    ['模型名称', modelName],
    ['提交时间', formatHistoryTimestamp(firstValue(item.created_at, item.createdAt, item.created))],
    ['完成时间', formatHistoryTimestamp(firstValue(item.finished_at, item.finishedAt, item.completed_at, item.completedAt))],
    ['分辨率', formatResolution(item)]
  ]

  if (item.type === 'video' || item.video_url || item.url?.includes?.('.mp4')) {
    details.push(['时长', formatDuration(item.duration)])
    details.push(['帧率', formatFps(readMeta(item, 'fps', 'frame_rate', 'frameRate'))])
  } else if (item.type === 'audio' || item.audio_url) {
    details.push(['时长', formatDuration(firstValue(item.duration, item.audio_duration))])
  }

  details.push(['文件大小', fileSize || '未知'])

  return details
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => ({ label, value: String(value) }))
}

async function readContentLength(url) {
  if (!url || typeof fetch !== 'function') return null
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) return null
    const contentLength = Number(response.headers.get('content-length'))
    return Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
  } catch {
    return null
  }
}

function loadImageMetadata(url) {
  if (!url || typeof Image === 'undefined') return Promise.resolve({})
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({})
    image.src = url
  })
}

function loadMediaMetadata(url, type) {
  if (!url || typeof document === 'undefined') return Promise.resolve({})
  return new Promise(resolve => {
    const media = document.createElement(type === 'audio' ? 'audio' : 'video')
    media.preload = 'metadata'
    media.onloadedmetadata = () => {
      const metadata = {
        duration: Number.isFinite(media.duration) ? Math.round(media.duration * 100) / 100 : undefined
      }
      if (type === 'video') {
        metadata.width = media.videoWidth || undefined
        metadata.height = media.videoHeight || undefined
      }
      media.removeAttribute('src')
      media.load()
      resolve(metadata)
    }
    media.onerror = () => resolve({})
    media.src = url
  })
}

export async function enrichHistoryMediaDetails(item = {}, options = {}) {
  const resolveUrl = typeof options.resolveUrl === 'function' ? options.resolveUrl : value => value
  const rawUrl = firstValue(item.url, item.video_url, item.audio_url)
  const url = resolveUrl(rawUrl)
  const [fileSize, mediaMetadata] = await Promise.all([
    readContentLength(url),
    item.type === 'image'
      ? loadImageMetadata(url)
      : item.type === 'video' || item.video_url
        ? loadMediaMetadata(url, 'video')
        : item.type === 'audio' || item.audio_url
          ? loadMediaMetadata(url, 'audio')
          : Promise.resolve({})
  ])

  return {
    ...item,
    ...Object.fromEntries(Object.entries(mediaMetadata).filter(([, value]) => value !== undefined && value !== null && value !== '')),
    file_size: firstValue(item.file_size, item.fileSize, item.size_bytes, fileSize)
  }
}
