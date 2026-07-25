import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assetPanel = readFileSync(new URL('./AssetPanel.vue', import.meta.url), 'utf8')
const assetPreviewModal = readFileSync(new URL('./AssetPreviewModal.vue', import.meta.url), 'utf8')

function readZIndex(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?z-index:\\s*(\\d+)`))
  assert.ok(match, `missing z-index for ${selector}`)
  return Number(match[1])
}

test('Seedance character dropdown waits 500ms before hiding after pointer leave', () => {
  const hideHandler = assetPanel.match(/function startHideSeedanceDropdown\(\) \{[\s\S]*?\n\}/)?.[0]

  assert.ok(hideHandler, 'missing startHideSeedanceDropdown handler')
  assert.match(hideHandler, /setTimeout\([\s\S]*?,\s*500\)/)
})

test('asset details stay above the asset panel in fullscreen mode', () => {
  const clickHandler = assetPanel.match(/function handleAssetClick\(e, asset\) \{[\s\S]*?\n\}/)?.[0]
  const fullscreenPanelZIndex = readZIndex(assetPanel, '.asset-panel-container.fullscreen')
  const previewOverlayZIndex = readZIndex(assetPreviewModal, '.asset-preview-overlay')

  assert.ok(clickHandler, 'missing handleAssetClick handler')
  assert.match(assetPanel, /<AssetCard[\s\S]*?@click="handleAssetClick"/)
  assert.match(clickHandler, /previewAsset\.value = asset[\s\S]*?showPreview\.value = true/)
  assert.doesNotMatch(clickHandler, /isFullscreen/)
  assert.ok(
    previewOverlayZIndex > fullscreenPanelZIndex,
    `asset preview z-index ${previewOverlayZIndex} must exceed fullscreen panel z-index ${fullscreenPanelZIndex}`
  )
})
