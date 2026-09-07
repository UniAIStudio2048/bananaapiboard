import { uploadCanvasMedia } from './workflow'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { getOriginalImageUrl } from '@/utils/canvasThumbnail'
import { getSeedanceMediaFileInfo } from '@/utils/seedanceMedia'

export async function resolveSeedanceMediaUrl(rawUrl, assetType) {
  const mediaType = assetType.toLowerCase()
  const url = mediaType === 'image' ? getOriginalImageUrl(rawUrl) : rawUrl
  if (!url) throw new Error('未找到素材')
  const isLocal = /^(blob:|data:|\/)/.test(url) || (url.includes('localhost') && url.includes('/api/'))
  if (!isLocal) return url
  const response = await fetch(url.startsWith('/') ? getApiUrl(url) : url, {
    ...(url.startsWith('/') ? { headers: getTenantHeaders(), credentials: 'include' } : {}),
    signal: AbortSignal.timeout(120000)
  })
  if (!response.ok) throw new Error(`读取素材失败：${response.status}`)
  const blob = await response.blob()
  const { mimeType, extension } = getSeedanceMediaFileInfo(blob.type, mediaType, url)
  const file = new File([blob], `seedance_${Date.now()}.${extension}`, { type: mimeType })
  const uploaded = await uploadCanvasMedia(file, mediaType)
  if (!uploaded?.url) throw new Error('上传素材失败')
  return uploaded.url
}
