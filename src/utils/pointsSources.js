import { toPointsNumber } from './points.js'

export function normalizePointsSources(sources) {
  if (!Array.isArray(sources)) return []

  return sources
    .map((source) => {
      const total = toPointsNumber(source?.total)
      return {
        ...source,
        type: source?.type || 'other',
        total,
        count: Math.max(0, Math.trunc(toPointsNumber(source?.count))),
        earned: toPointsNumber(source?.earned),
        spent: toPointsNumber(source?.spent)
      }
    })
    .filter((source) => source.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function getPointsSourcesMaxTotal(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return 0
  return sources.reduce((max, source) => Math.max(max, toPointsNumber(source?.total)), 0)
}
