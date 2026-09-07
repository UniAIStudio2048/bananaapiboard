export function getSeedanceMediaType(data = {}) {
  const value = String(data?.assetType || data?.AssetType || 'Image').toLowerCase()
  return value === 'video' || value === 'audio' ? value : 'image'
}

export function getSeedanceSourceUrl(data = {}, assetType = 'Image') {
  const type = String(assetType).toLowerCase()
  if (type === 'audio') return data.audioUrl || data.output?.url || data.audioData || ''
  if (type === 'video') return data.output?.url || data.output?.urls?.[0] || data.sourceVideo || ''
  if (data.nodeRole === 'source' && data.sourceImages?.length) return data.sourceImages[0]
  return data.output?.urls?.[0] || data.output?.url || data.sourceImages?.[0] || ''
}

export function mapLocalSeedanceAsset(asset) {
  let metadata = asset.metadata || {}
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata) } catch { metadata = {} }
  }
  if (!metadata || typeof metadata !== 'object') metadata = {}
  return {
    Id: metadata.assetId || asset.id,
    Name: asset.name,
    URL: metadata.assetUrl || asset.thumbnail_url || (/^(https?:|\/)/.test(asset.url || '') ? asset.url : ''),
    ThumbnailURL: metadata.thumbnailUrl || asset.thumbnail_url || '',
    AssetUri: metadata.assetUri || asset.url,
    Status: metadata.status || 'Active',
    GroupId: metadata.groupId,
    AssetType: metadata.assetType || 'Image',
    providerType: metadata.providerType,
    Duration: metadata.duration,
    _canvasId: asset.id,
    _userId: asset.user_id
  }
}

export function buildSeedanceCharacterData(asset) {
  const type = getSeedanceMediaType(asset)
  const assetType = type[0].toUpperCase() + type.slice(1)
  const assetUri = /^(asset:\/\/|face:)/.test(asset.AssetUri || '') ? asset.AssetUri : `asset://${asset.Id}`
  const thumbnailUrl = asset.ThumbnailURL || (type === 'image' ? asset.URL : '')
  return {
    assetId: asset.Id,
    assetUri,
    assetUrl: asset.URL || '',
    groupId: asset.GroupId,
    assetName: asset.Name,
    status: asset.Status,
    assetType,
    providerType: asset.providerType,
    thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    duration: asset.Duration,
    projectName: asset.ProjectName,
    createTime: asset.CreateTime,
    updateTime: asset.UpdateTime,
    output: { type, url: assetUri, urls: [assetUri], thumbnailUrl }
  }
}

export function getSeedanceMediaFileInfo(mimeType, mediaType, url = '') {
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm' }
  const normalizedMime = String(mimeType || '').split(';')[0].toLowerCase()
  if (normalizedMime && normalizedMime !== 'application/octet-stream' && !normalizedMime.startsWith(`${mediaType}/`)) throw new Error('文件类型与素材类型不一致')
  const urlExtension = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  const inferredMime = Object.keys(extensions).find(key => key.startsWith(`${mediaType}/`) && extensions[key] === urlExtension)
  const defaultMime = mediaType === 'video' ? 'video/mp4' : mediaType === 'audio' ? 'audio/mpeg' : 'image/png'
  const resolvedMime = extensions[normalizedMime] ? normalizedMime : inferredMime || defaultMime
  return { mimeType: resolvedMime, extension: extensions[resolvedMime] }
}
