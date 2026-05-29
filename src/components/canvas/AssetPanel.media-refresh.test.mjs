import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assetPanel = readFileSync(new URL('./AssetPanel.vue', import.meta.url), 'utf8')
const nodeContextMenu = readFileSync(new URL('./NodeContextMenu.vue', import.meta.url), 'utf8')

test('right-click add to assets notifies open asset panels after save completes', () => {
  assert.match(nodeContextMenu, /function notifyAssetsUpdated\(/)
  assert.match(nodeContextMenu, /notifyAssetsUpdated\(result,\s*assetData\)/)
})

test('AssetPanel refresh event can prepend the newly saved asset before server refresh finishes', () => {
  assert.match(assetPanel, /function upsertAssetInList\(/)
  assert.match(assetPanel, /event\?\.detail\?\.asset/)
  assert.match(assetPanel, /upsertAssetInList\(event\.detail\.asset\)/)
})

test('AssetPanel uses extracted asset card and preview components', () => {
  assert.match(assetPanel, /import AssetCard from '\.\/AssetCard\.vue'/)
  assert.match(assetPanel, /import AssetHoverPreview from '\.\/AssetHoverPreview\.vue'/)
  assert.match(assetPanel, /import AssetPreviewModal from '\.\/AssetPreviewModal\.vue'/)
  assert.match(assetPanel, /<AssetCard\b/)
  assert.match(assetPanel, /<AssetHoverPreview\b/)
  assert.match(assetPanel, /<AssetPreviewModal\b/)
})

test('AssetPanel media cards preserve original media ratio and bottom tag filter bar', () => {
  const assetCard = readFileSync(new URL('./AssetCard.vue', import.meta.url), 'utf8')
  assert.match(assetCard, /const measuredAspectRatio = ref\(''\)/)
  assert.match(assetCard, /function handleMediaImageLoad\(/)
  assert.match(assetCard, /function handleVideoMetadata\(/)
  assert.match(assetCard, /--asset-thumb-ratio/)
  assert.match(assetCard, /\.asset-card-thumb\s*\{[\s\S]*?aspect-ratio:\s*var\(--asset-thumb-ratio,\s*1\s*\/\s*1\)/)
  assert.match(assetCard, /\.asset-card-media-wrap :deep\(img\)\s*\{[\s\S]*?object-fit:\s*contain/)
  assert.match(assetCard, /\.asset-card-media\s*\{[\s\S]*?object-fit:\s*contain/)
  assert.match(assetCard, /\.favorite-overlay\s*\{[\s\S]*?opacity:\s*0/)
  assert.match(assetCard, /\.asset-card\.asset-card-v2:hover \.favorite-overlay/)
  assert.match(assetPanel, /const ASSET_ROW_HEIGHT = 560/)
  assert.match(assetPanel, /class="asset-grid-window"/)
  assert.match(assetPanel, /class="asset-grid-track"/)
  assert.match(assetPanel, /\.asset-grid-track\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.doesNotMatch(assetPanel, /\?\s*\{ display:\s*'contents' \}/)
  assert.match(assetPanel, /class="asset-tag-bar-bottom"/)
  assert.doesNotMatch(assetPanel, /class="tag-filter"/)
})

test('AssetPanel bottom tag bar has explicit light theme colors', () => {
  assert.match(assetPanel, /:root\.canvas-theme-light \.asset-panel \.asset-tag-bar-bottom\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.92\)/)
  assert.match(assetPanel, /:root\.canvas-theme-light \.asset-panel \.tag-chip\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.72\)/)
  assert.match(assetPanel, /:root\.canvas-theme-light \.asset-panel \.tag-manage-btn\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/)
})

test('AssetPreviewModal constrains cached preview images without cropping', () => {
  const previewModal = readFileSync(new URL('./AssetPreviewModal.vue', import.meta.url), 'utf8')
  assert.match(previewModal, /class="preview-back-btn"[\s\S]*?>[\s\S]*返回/)
  assert.match(previewModal, /\.preview-content :deep\(img\.preview-image\)\s*\{[\s\S]*?max-width:\s*100%/)
  assert.match(previewModal, /\.preview-content :deep\(img\.preview-image\)\s*\{[\s\S]*?max-height:\s*85vh/)
  assert.match(previewModal, /\.preview-content :deep\(img\.preview-image\)\s*\{[\s\S]*?object-fit:\s*contain/)
})

test('AssetPanel closes hover preview on scroll and keeps preview hoverable', () => {
  assert.match(assetPanel, /function handleAssetScroll\([\s\S]*?closeHoverPreview\(\)/)
  assert.match(assetPanel, /@mouseenter="handleHoverPreviewEnter"/)
  assert.match(assetPanel, /@mouseleave="handleHoverPreviewLeave"/)
})

test('AssetPanel uses an in-app confirmation modal for asset deletion', () => {
  assert.doesNotMatch(assetPanel, /\bconfirm\(/)
  assert.match(assetPanel, /const deleteAssetConfirm = ref\(/)
  assert.match(assetPanel, /function requestDeleteAsset\(/)
  assert.match(assetPanel, /function confirmDeleteAsset\(/)
  assert.match(assetPanel, /v-if="deleteAssetConfirm\.visible"/)
  assert.match(assetPanel, /class="delete-asset-modal"/)
})

test('canvas preset managers use in-app confirmation modals for deletion', () => {
  const presetManager = readFileSync(new URL('./dialogs/PresetManager.vue', import.meta.url), 'utf8')
  const imagePresetManager = readFileSync(new URL('./dialogs/ImagePresetManager.vue', import.meta.url), 'utf8')

  for (const source of [presetManager, imagePresetManager]) {
    assert.doesNotMatch(source, /\bconfirm\(/)
    assert.match(source, /const deleteConfirm = ref\(/)
    assert.match(source, /function requestDelete\(/)
    assert.match(source, /function confirmDelete\(/)
    assert.match(source, /v-if="deleteConfirm\.visible"/)
    assert.match(source, /class="preset-delete-modal"/)
  }
})
