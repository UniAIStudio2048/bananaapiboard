import { resolveVideoResolutionPricing } from './videoResolutionPricing.js'
import { resolveVideoInputMultiplier } from './videoInputMultiplier.js'

export function getWan3OutputEstimate(config, duration) {
  const seconds = Number(duration)
  return seconds > 0 ? seconds : Number(config.wan3Config?.duration) || 5
}

export function estimateWan3Points(config, resolution, duration, referenceDurations) {
  const outputSeconds = getWan3OutputEstimate(config, duration)
  const pricing = resolveVideoResolutionPricing(config.resolutionPricing, resolution)
  const overrides = pricing?.costPerSecond ?? config.costPerSecond
  const inputSeconds = referenceDurations.reduce((total, seconds) => total + seconds, 0)
  const durationPoints = config.pointsCost?.[outputSeconds]
  const fallbackPoints = config.pointsCost?.[10]
  const costPerSecond = overrides != null && overrides !== '' && Number.isFinite(Number(overrides)) && Number(overrides) >= 0
    ? Number(overrides)
    : durationPoints != null ? Number(durationPoints) / outputSeconds
      : fallbackPoints != null ? Number(fallbackPoints) / 10 : (Number(config.pointsCost ?? 40) || 0) / outputSeconds
  const multiplierConfig = Array.isArray(config.videoInputMultipliers)
    ? { videoInputMultipliers: config.videoInputMultipliers }
    : config
  return (inputSeconds + outputSeconds) * costPerSecond * resolveVideoInputMultiplier(multiplierConfig, referenceDurations.length)
}

export function readWan3ReferenceDuration(url, signal) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const timeout = setTimeout(() => finish(), 10000)
    const abort = () => finish()
    function finish(duration) {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null)
    }
    signal.addEventListener('abort', abort, { once: true })
    video.preload = 'metadata'
    video.onloadedmetadata = () => finish(video.duration)
    video.onerror = () => finish()
    video.src = url
  })
}
