const DEFAULT_WINDOW_MS = 2000
const DUPLICATE_MESSAGE = '检测到重复提交，请稍后再试'

function normalizeValue(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeValue(value[key])
      return acc
    }, {})
  }
  return String(value).trim()
}

export function buildCanvasSubmitFingerprint(payload = {}) {
  const normalized = Object.keys(payload).sort().reduce((acc, key) => {
    acc[key] = normalizeValue(payload[key])
    return acc
  }, {})
  return JSON.stringify(normalized)
}

export function createCanvasDuplicateSubmitGuard(options = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const now = options.now || (() => Date.now())
  const lastSubmitByFingerprint = new Map()
  const inFlightFingerprints = new Set()

  return {
    check(fingerprint) {
      const currentTime = now()
      for (const [storedFingerprint, submittedAt] of lastSubmitByFingerprint.entries()) {
        if (currentTime - submittedAt >= windowMs) {
          lastSubmitByFingerprint.delete(storedFingerprint)
        }
      }

      const lastSubmitAt = lastSubmitByFingerprint.get(fingerprint)

      if (inFlightFingerprints.has(fingerprint) || (lastSubmitAt !== undefined && currentTime - lastSubmitAt < windowMs)) {
        return {
          blocked: true,
          message: DUPLICATE_MESSAGE
        }
      }

      lastSubmitByFingerprint.set(fingerprint, currentTime)
      return { blocked: false }
    },

    hold(fingerprint) {
      inFlightFingerprints.add(fingerprint)
    },

    release(fingerprint) {
      inFlightFingerprints.delete(fingerprint)
    },

    clear() {
      lastSubmitByFingerprint.clear()
      inFlightFingerprints.clear()
    }
  }
}
