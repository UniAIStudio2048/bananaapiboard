function normalizeUrl(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSourceReplacementMap(replacements) {
  const sourceMap = new Map()
  const normalizedReplacements = []

  for (const replacement of Array.isArray(replacements) ? replacements : []) {
    const replacementUrl = normalizeUrl(replacement?.replacementUrl)
    if (!replacementUrl) continue

    const sourceUrls = Array.isArray(replacement?.sourceUrls)
      ? replacement.sourceUrls.map(normalizeUrl).filter(Boolean)
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

export function applyOrderedMediaReplacements(orderedUrls, replacements = []) {
  const urls = Array.isArray(orderedUrls) ? orderedUrls.map(normalizeUrl).filter(Boolean) : []
  const { sourceMap, normalizedReplacements } = buildSourceReplacementMap(replacements)
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
