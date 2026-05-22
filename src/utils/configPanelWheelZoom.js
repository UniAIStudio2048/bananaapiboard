import { ref } from 'vue'

const MIN_CONFIG_PANEL_SCALE = 0.75
const MAX_CONFIG_PANEL_SCALE = 1.35
const CONFIG_PANEL_WHEEL_SPEED = 0.0015

function clampScale(value) {
  return Math.min(MAX_CONFIG_PANEL_SCALE, Math.max(MIN_CONFIG_PANEL_SCALE, value))
}

function isEditableWheelTarget(target) {
  return Boolean(target?.closest?.([
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '.prompt-mention-popup',
    '.model-dropdown-list',
    '.preset-dropdown-list',
    '.model-dropdown',
    '.preset-dropdown',
    '.language-dropdown',
    '[data-config-panel-wheel-scroll="true"]'
  ].join(',')))
}

export function createConfigPanelWheelZoom() {
  const configPanelScale = ref(1)

  function resetConfigPanelScale() {
    configPanelScale.value = 1
  }

  function handleConfigPanelWheel(event, isExpanded) {
    if (!isExpanded || isEditableWheelTarget(event.target)) return

    event.preventDefault()
    event.stopPropagation()

    const multiplier = Math.exp(-event.deltaY * CONFIG_PANEL_WHEEL_SPEED)
    configPanelScale.value = Number(clampScale(configPanelScale.value * multiplier).toFixed(3))
  }

  return {
    configPanelScale,
    handleConfigPanelWheel,
    resetConfigPanelScale
  }
}
