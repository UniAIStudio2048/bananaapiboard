const TRANSIENT_URL_RE = /^(?:blob:|data:)/i

const MIME_EXTENSIONS = {
  image: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    default: '.jpg'
  },
  video: {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    default: '.mp4'
  },
  audio: {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'audio/m4a': '.m4a',
    default: '.mp3'
  }
}

function normalizeMediaUrl(url) {
  if (typeof url !== 'string') return ''
  return url.trim()
}

export function shouldUploadTextNodeLlmMediaUrl(url) {
  const normalized = normalizeMediaUrl(url)
  return !!normalized && TRANSIENT_URL_RE.test(normalized)
}

function appendMediaUrl({ url, type, mediaItems, directUrls, uploadItems }) {
  const normalized = normalizeMediaUrl(url)
  if (!normalized) return

  const shouldUpload = shouldUploadTextNodeLlmMediaUrl(normalized)
  const item = { type, url: normalized, shouldUpload }
  mediaItems.push(item)

  if (shouldUpload) {
    uploadItems.push({ type, url: normalized })
  } else {
    directUrls.push(normalized)
  }
}

export function collectTextNodeLlmMediaReferences({ videoUrls = [], imageUrls = [], audioUrls = [] } = {}) {
  const mediaItems = []
  const directUrls = []
  const uploadItems = []

  for (const url of videoUrls || []) {
    appendMediaUrl({ url, type: 'video', mediaItems, directUrls, uploadItems })
  }
  for (const url of imageUrls || []) {
    appendMediaUrl({ url, type: 'image', mediaItems, directUrls, uploadItems })
  }
  for (const url of audioUrls || []) {
    appendMediaUrl({ url, type: 'audio', mediaItems, directUrls, uploadItems })
  }

  return { mediaItems, directUrls, uploadItems }
}

export function getTextNodeLlmMediaDefaultMimeType(type) {
  if (type === 'video') return 'video/mp4'
  if (type === 'audio') return 'audio/mpeg'
  return 'image/jpeg'
}

export function getTextNodeLlmMediaExtension({ type, mimeType } = {}) {
  const config = MIME_EXTENSIONS[type] || MIME_EXTENSIONS.image
  const normalizedMime = String(mimeType || '').split(';')[0].trim().toLowerCase()
  return config[normalizedMime] || config.default
}

export function buildTextNodeLlmMediaUploadFileName({ type = 'image', mimeType = '', now = Date.now() } = {}) {
  return `text_node_reference_${now}${getTextNodeLlmMediaExtension({ type, mimeType })}`
}
