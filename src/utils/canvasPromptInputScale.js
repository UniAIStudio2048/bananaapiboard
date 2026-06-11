export const PROMPT_INPUT_FIXED_SCALE_KEY = 'promptInputFixedScale'

export function getPromptInputFixedScaleDefault(interactionMode) {
  return interactionMode === 'infinite-canvas'
}

export function resolvePromptInputFixedScalePreference(preferences, fallback = false) {
  const value = preferences?.canvas?.[PROMPT_INPUT_FIXED_SCALE_KEY]
  return typeof value === 'boolean' ? value : fallback
}

export function buildPromptInputScaleStyle({ enabled, zoom } = {}) {
  if (!enabled) return {}

  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1
  const inverseScale = 1 / safeZoom

  return {
    '--canvas-prompt-input-fixed-scale': formatCssNumber(inverseScale),
    '--canvas-prompt-input-zoom': formatCssNumber(safeZoom)
  }
}

function formatCssNumber(value) {
  return Number.parseFloat(value.toFixed(4)).toString()
}
