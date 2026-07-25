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

test('Seedance asset updates refresh both group metadata and the My Assets list', () => {
  assert.match(assetPanel, /async function handleSeedanceAssetsUpdated\(\)/)
  assert.match(assetPanel, /handleSeedanceAssetsUpdated[\s\S]*?await loadSeedanceGroups\(\)[\s\S]*?await loadAssets\(true\)/)
  assert.match(assetPanel, /@groups-updated="handleSeedanceAssetsUpdated"/)
})

test('AssetPanel uses extracted asset card and preview components', () => {
  assert.match(assetPanel, /import AssetCard from '\.\/AssetCard\.vue'/)
  assert.match(assetPanel, /import AssetHoverPreview from '\.\/AssetHoverPreview\.vue'/)
  assert.match(assetPanel, /import AssetPreviewModal from '\.\/AssetPreviewModal\.vue'/)
  assert.match(assetPanel, /<AssetCard\b/)
  assert.match(assetPanel, /<AssetHoverPreview\b/)
  assert.match(assetPanel, /<AssetPreviewModal\b/)
})

test('AssetPanel keeps the asset library while adding a Canvas-first directory view', () => {
  assert.match(assetPanel, /import CanvasDirectoryPanel from '\.\/CanvasDirectoryPanel\.vue'/)
  assert.match(assetPanel, /const activePanelView = ref\('canvas'\)/)
  assert.match(assetPanel, /activePanelView\.value = 'canvas'/)
  assert.match(assetPanel, /class="asset-panel-tabs"/)
  assert.match(assetPanel, /<CanvasDirectoryPanel\b/)
  assert.match(assetPanel, /v-show="activePanelView === 'assets'"/)
  assert.match(assetPanel, /@select-locate="emit\('select-locate', \$event\)"/)
  assert.match(assetPanel, /@move-to-group="emit\('move-to-group', \$event\)"/)
  assert.match(assetPanel, /\.asset-library-view\s*\{[\s\S]*?min-height:\s*0/)
})

test('AssetPanel media cards preserve original media ratio and bottom tag filter bar', () => {
  const assetCard = readFileSync(new URL('./AssetCard.vue', import.meta.url), 'utf8')
  assert.match(assetCard, /const measuredAspectRatio = ref\(''\)/)
  assert.match(assetCard, /function handleMediaImageLoad\(/)
  assert.match(assetCard, /metadata\.videoWidth/)
  assert.match(assetCard, /video-placeholder/)
  assert.doesNotMatch(assetCard, /<video\b/)
  assert.match(assetCard, /--asset-thumb-ratio/)
  assert.match(assetCard, /\.asset-card-thumb\s*\{[\s\S]*?aspect-ratio:\s*var\(--asset-thumb-ratio,\s*1\s*\/\s*1\)/)
  assert.match(assetCard, /\.asset-card-media-wrap :deep\(img\)\s*\{[\s\S]*?object-fit:\s*contain/)
  assert.match(assetCard, /\.asset-card-media\s*\{[\s\S]*?object-fit:\s*contain/)
  assert.match(assetCard, /\.favorite-overlay\s*\{[\s\S]*?opacity:\s*0/)
  assert.match(assetCard, /\.asset-card\.asset-card-v2:hover \.favorite-overlay/)
  assert.doesNotMatch(assetPanel, /ASSET_ROW_HEIGHT/)
  assert.doesNotMatch(assetPanel, /class="asset-grid-window"/)
  assert.doesNotMatch(assetPanel, /class="asset-grid-track"/)
  assert.match(assetPanel, /const assetColumnCount = computed\(\(\) => isFullscreen\.value \? 6 : 3\)/)
  assert.match(assetPanel, /class="asset-waterfall-grid"/)
  assert.match(assetPanel, /class="asset-waterfall-column"/)
  assert.doesNotMatch(assetPanel, /\?\s*\{ display:\s*'contents' \}/)
  assert.match(assetPanel, /class="asset-tag-bar-bottom"/)
  assert.doesNotMatch(assetPanel, /class="tag-filter"/)
})

test('AssetPanel progressively loads every asset page in an infinite waterfall', () => {
  assert.match(assetPanel, /const ASSET_PAGE_SIZE = 100/)
  assert.match(assetPanel, /const INITIAL_DISPLAY_COUNT = 30/)
  assert.match(assetPanel, /const hasMoreAssets = ref\(true\)/)
  assert.match(assetPanel, /async function loadMoreAssets\(/)
  assert.match(assetPanel, /_fetchAssetsFromServer\(spaceParams, spaceType, teamId, nextPage\)/)
  assert.match(assetPanel, /getAssets\(\{ \.\.\.spaceParams, page, pageSize: ASSET_PAGE_SIZE \}\)/)
  assert.match(assetPanel, /pageSize:\s*ASSET_PAGE_SIZE/)
  assert.match(assetPanel, /function maybeLoadMoreAssets\(/)
  assert.match(assetPanel, /@scroll="handleAssetScroll"/)
  assert.match(assetPanel, /v-for="\(columnAssets, columnIndex\) in assetColumns"/)
})

test('AssetPanel has the same fullscreen collection control pattern as HistoryPanel', () => {
  assert.match(assetPanel, /const isFullscreen = ref\(false\)/)
  assert.match(assetPanel, /function toggleFullscreen\(/)
  assert.match(assetPanel, /:class="\{ fullscreen: isFullscreen \}"/)
  assert.match(assetPanel, /:title="isFullscreen \? '退出全屏' : '全屏显示'"/)
  assert.match(assetPanel, /class="header-actions"/)
  assert.match(assetPanel, /\.asset-panel-container\.fullscreen\s*\{[\s\S]*?position:\s*fixed/)
  assert.match(assetPanel, /\.asset-panel\.fullscreen\s*\{[\s\S]*?width:\s*90vw/)
})

test('AssetCard reveals its metadata inside the thumbnail with theme-aware glass styling', () => {
  const assetCard = readFileSync(new URL('./AssetCard.vue', import.meta.url), 'utf8')
  const thumbStart = assetCard.indexOf('<div class="asset-card-thumb"')
  const infoStart = assetCard.indexOf('<div class="asset-card-info">')
  const thumbEnd = assetCard.indexOf('</div>', infoStart)

  assert.ok(thumbStart >= 0 && infoStart > thumbStart && thumbEnd > infoStart)
  assert.match(assetCard, /\.asset-card-info\s*\{[\s\S]*?position:\s*absolute[\s\S]*?left:\s*0[\s\S]*?bottom:\s*0/)
  assert.match(assetCard, /\.asset-card-info\s*\{[\s\S]*?backdrop-filter:\s*blur\(/)
  assert.match(assetCard, /\.asset-card-info\s*\{[\s\S]*?opacity:\s*0/)
  assert.match(assetCard, /\.asset-card\.asset-card-v2:hover \.asset-card-info/)
  assert.match(assetCard, /:global\(:root\.canvas-theme-light\) \.asset-card-info/)
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
  assert.match(assetPanel, /function handleCardMouseEnter\([\s\S]*?const anchorRect = e\.currentTarget\?\.getBoundingClientRect\(\)[\s\S]*?setTimeout/)
  assert.match(assetPanel, /hoverAnchorRect\.value = anchorRect/)
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

test('image node preset dropdown keeps an error state when presets fail to load', () => {
  const imageNode = readFileSync(new URL('./nodes/ImageNode.vue', import.meta.url), 'utf8')

  assert.match(imageNode, /const presetLoadError = ref\(''\)/)
  assert.match(imageNode, /presetLoadError\.value = error\.message \|\| '图像预设加载失败'/)
  assert.match(imageNode, /id: 'preset-load-error'/)
  assert.match(imageNode, /type: 'error'/)
  assert.match(imageNode, /'preset-dropdown-error': preset\.type === 'error'/)
})
