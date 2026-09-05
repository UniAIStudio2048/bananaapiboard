export function normalizeEmailWhitelist(whitelist) {
  if (!Array.isArray(whitelist)) return []

  return [...new Set(whitelist
    .map(entry => String(entry ?? '').trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean))]
}
