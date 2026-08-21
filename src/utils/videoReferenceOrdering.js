function normalizeUrlWith(value, normalizeUrl) {
  const base = typeof value === 'string' ? value.trim() : ''
  if (!base) return ''
  return typeof normalizeUrl === 'function' ? normalizeUrl(base) : base
}

function buildSourceReplacementMap(replacements, normalizeUrl) {
  const sourceMap = new Map()
  const normalizedReplacements = []

  for (const replacement of Array.isArray(replacements) ? replacements : []) {
    const replacementUrl = normalizeUrlWith(replacement?.replacementUrl, normalizeUrl)
    if (!replacementUrl) continue

    const sourceUrls = Array.isArray(replacement?.sourceUrls)
      ? replacement.sourceUrls.map(url => normalizeUrlWith(url, normalizeUrl)).filter(Boolean)
      : []
    normalizedReplacements.push({ replacementUrl, sourceUrls })

    for (const sourceUrl of sourceUrls) {
      if (!sourceMap.has(sourceUrl)) {
        sourceMap.set(sourceUrl, replacementUrl)
      }
    }
  }

  return { sourceMap, normalizedReplacements }
}

export function applyOrderedMediaReplacements(orderedUrls, replacements = [], { normalizeUrl } = {}) {
  const urls = Array.isArray(orderedUrls) ? orderedUrls.map(url => normalizeUrlWith(url, normalizeUrl)).filter(Boolean) : []
  const { sourceMap, normalizedReplacements } = buildSourceReplacementMap(replacements, normalizeUrl)
  const usedReplacements = new Set()

  const replacedUrls = urls.map(url => {
    const replacementUrl = sourceMap.get(url)
    if (!replacementUrl) return url
    usedReplacements.add(replacementUrl)
    return replacementUrl
  })

  for (const replacement of normalizedReplacements) {
    if (!usedReplacements.has(replacement.replacementUrl) && !replacedUrls.includes(replacement.replacementUrl)) {
      replacedUrls.push(replacement.replacementUrl)
    }
  }

  return replacedUrls
}
