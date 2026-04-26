export function getImageMediaUrls(work) {
  if (!work || work.media_type !== 'image') return []

  if (Array.isArray(work.media_urls) && work.media_urls.length > 0) {
    return work.media_urls.filter(Boolean)
  }

  if (!work.media_url || typeof work.media_url !== 'string') return []

  try {
    const parsed = JSON.parse(work.media_url)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {}

  return [work.media_url].filter(Boolean)
}
