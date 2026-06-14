const TYPE_CONFIG = {
  image: {
    ext: '.png',
    mime: 'image/png',
    defaultPrefix: 'image',
    allowedExts: ['jpg', 'jpeg', 'png', 'gif', 'webp']
  },
  video: {
    ext: '.mp4',
    mime: 'video/mp4',
    defaultPrefix: 'video',
    allowedExts: ['mp4', 'webm', 'mov', 'avi', 'mkv']
  },
  audio: {
    ext: '.mp3',
    mime: 'audio/mpeg',
    defaultPrefix: 'audio',
    allowedExts: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
  }
}

export function getAssistantAttachmentTypeConfig(type) {
  return TYPE_CONFIG[type] || {
    ext: '',
    mime: 'application/octet-stream',
    defaultPrefix: 'file',
    allowedExts: []
  }
}

export function inferUrlExtension(url, type) {
  const config = getAssistantAttachmentTypeConfig(type)
  const urlExt = String(url || '').split('.').pop()?.split('?')[0]?.toLowerCase()
  return config.allowedExts.includes(urlExt) ? urlExt : ''
}

export function normalizeAssistantAttachmentName({ url, type, name, now = Date.now() }) {
  const config = getAssistantAttachmentTypeConfig(type)
  let fileName = name || `${config.defaultPrefix}_${now}${config.ext}`

  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!name || config.allowedExts.includes(ext)) {
    return fileName
  }

  const urlExt = inferUrlExtension(url, type)
  const nextExt = urlExt ? `.${urlExt}` : config.ext
  return fileName.replace(/\.[^.]+$/, '') + nextExt
}

export function shouldFetchAssistantAttachmentUrl(url) {
  if (!url || typeof url !== 'string') return false

  if (url.startsWith('data:') || url.startsWith('blob:')) return true

  return false
}

export function buildDirectUrlAttachment({ url, type, name }) {
  const fileName = normalizeAssistantAttachmentName({ url, type, name })
  const ext = fileName.split('.').pop()

  return {
    type,
    name: fileName,
    fileType: type,
    ext,
    size: 0,
    preview: url,
    url
  }
}
