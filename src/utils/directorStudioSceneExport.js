import { DIRECTOR_ASPECT_FRAMES, DIRECTOR_SCREENSHOT_RESOLUTIONS } from './directorStudioState.js'

const AI_REQUEST_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'])

export function getDirectorAspectFrameRatio(frameValue) {
  return DIRECTOR_ASPECT_FRAMES.find(frame => frame.value === frameValue)?.ratio ?? null
}

export function resolveDirectorAspectRatio(data) {
  if (data?.aspectFrame && data.aspectFrame !== 'panorama') return data.aspectFrame
  const aspectRatio = typeof data?.aspectRatio === 'string' ? data.aspectRatio.trim() : ''
  return aspectRatio && aspectRatio !== 'panorama' ? aspectRatio : '16:9'
}

export function resolveDirectorAiRequestAspectRatio(data) {
  const ratio = resolveDirectorAspectRatio(data)
  return AI_REQUEST_RATIOS.has(ratio) ? ratio : 'auto'
}

export function computeDirectorScreenshotSize(aspectFrame, resolutionValue) {
  const resolution = DIRECTOR_SCREENSHOT_RESOLUTIONS.find(item => item.value === resolutionValue) || DIRECTOR_SCREENSHOT_RESOLUTIONS[0]
  const ratio = getDirectorAspectFrameRatio(aspectFrame) || 16 / 9
  const height = resolution.base
  return {
    width: Math.round(height * ratio),
    height
  }
}
