# Panorama VR 2D Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2D person/object overlays to the existing panorama VR modal and include those overlays in current-view exports.

**Architecture:** Keep editing state local to `PanoramaPreviewModal.vue`. Extract pure overlay helpers into `src/utils/canvasPanoramaOverlay.js` for testable label generation, coordinate conversion, and canvas drawing. Use the existing asset/history APIs directly from the modal, and keep `ImageNode.vue` export handling unchanged because the modal emits the final composited PNG blob.

**Tech Stack:** Vue 3 Composition API, Three.js, browser Canvas 2D API, existing Node `.test.mjs` utility tests, existing canvas upload/export flow.

---

### Task 1: Overlay Helper Tests And Utilities

**Files:**
- Create: `src/utils/canvasPanoramaOverlay.js`
- Create: `src/utils/canvasPanoramaOverlay.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/canvasPanoramaOverlay.test.mjs`:

```js
import assert from 'node:assert/strict'
import {
  clampOverlayPosition,
  createDefaultOverlay,
  getNextOverlayLabel,
  getOverlayExportRect,
  sortVisibleOverlays
} from './canvasPanoramaOverlay.js'

const overlays = [
  { label: '人物1', type: 'person' },
  { label: '物品1', type: 'object' },
  { label: '人物2', type: 'person' }
]

assert.equal(getNextOverlayLabel(overlays, 'person'), '人物3')
assert.equal(getNextOverlayLabel(overlays, 'object'), '物品2')
assert.equal(getNextOverlayLabel([], 'person'), '人物1')

const overlay = createDefaultOverlay({
  source: 'local',
  type: 'person',
  url: 'blob:demo',
  originalName: 'demo.png',
  existingOverlays: overlays,
  naturalWidth: 512,
  naturalHeight: 1024
})

assert.equal(overlay.label, '人物3')
assert.equal(overlay.x, 0.5)
assert.equal(overlay.y, 0.5)
assert.equal(overlay.scale, 1)
assert.equal(overlay.visible, true)
assert.equal(overlay.flipped, false)
assert.equal(overlay.naturalWidth, 512)
assert.equal(overlay.naturalHeight, 1024)

assert.deepEqual(clampOverlayPosition({ x: -1, y: 2 }), { x: 0, y: 1 })
assert.deepEqual(clampOverlayPosition({ x: 0.45, y: 0.72 }), { x: 0.45, y: 0.72 })

assert.deepEqual(
  sortVisibleOverlays([
    { id: 'hidden', visible: false, zIndex: 99 },
    { id: 'top', visible: true, zIndex: 2 },
    { id: 'bottom', visible: true, zIndex: 1 }
  ]).map(item => item.id),
  ['bottom', 'top']
)

assert.deepEqual(
  getOverlayExportRect({
    overlay: {
      x: 0.5,
      y: 0.75,
      scale: 1,
      naturalWidth: 400,
      naturalHeight: 800
    },
    outputWidth: 1000,
    outputHeight: 500,
    baseHeightRatio: 0.42
  }),
  {
    width: 105,
    height: 210,
    left: 448,
    top: 270
  }
)

console.log('canvasPanoramaOverlay tests passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /opt/banana/bananaapiboard
node src/utils/canvasPanoramaOverlay.test.mjs
```

Expected: FAIL with an import error because `canvasPanoramaOverlay.js` does not exist.

- [ ] **Step 3: Implement the minimal utility module**

Create `src/utils/canvasPanoramaOverlay.js`:

```js
export const OVERLAY_TYPE_LABELS = {
  person: '人物',
  object: '物品'
}

export function getNextOverlayLabel(overlays = [], type = 'person') {
  const prefix = OVERLAY_TYPE_LABELS[type] || OVERLAY_TYPE_LABELS.person
  const usedNumbers = new Set(
    overlays
      .map(item => String(item.label || '').match(new RegExp(`^${prefix}(\\d+)$`))?.[1])
      .filter(Boolean)
      .map(Number)
  )
  let next = 1
  while (usedNumbers.has(next)) next += 1
  return `${prefix}${next}`
}

export function clampOverlayPosition(position) {
  return {
    x: Math.max(0, Math.min(1, Number(position?.x) || 0)),
    y: Math.max(0, Math.min(1, Number(position?.y) || 0))
  }
}

export function createDefaultOverlay({
  source,
  type = 'person',
  url,
  originalName = '',
  existingOverlays = [],
  naturalWidth = 512,
  naturalHeight = 512
}) {
  return {
    id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    type,
    label: getNextOverlayLabel(existingOverlays, type),
    url,
    originalName,
    x: 0.5,
    y: 0.5,
    scale: 1,
    flipped: false,
    visible: true,
    zIndex: existingOverlays.length + 1,
    naturalWidth,
    naturalHeight
  }
}

export function sortVisibleOverlays(overlays = []) {
  return overlays
    .filter(item => item.visible !== false && item.url)
    .slice()
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
}

export function getOverlayExportRect({
  overlay,
  outputWidth,
  outputHeight,
  baseHeightRatio = 0.42
}) {
  const naturalWidth = Math.max(1, Number(overlay.naturalWidth) || 1)
  const naturalHeight = Math.max(1, Number(overlay.naturalHeight) || 1)
  const scale = Math.max(0.05, Number(overlay.scale) || 1)
  const height = Math.round(outputHeight * baseHeightRatio * scale)
  const width = Math.round(height * (naturalWidth / naturalHeight))
  const left = Math.round(outputWidth * overlay.x - width / 2)
  const top = Math.round(outputHeight * overlay.y - height / 2)
  return { width, height, left, top }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd /opt/banana/bananaapiboard
node src/utils/canvasPanoramaOverlay.test.mjs
```

Expected: PASS and prints `canvasPanoramaOverlay tests passed`.

- [ ] **Step 5: Commit**

```bash
cd /opt/banana/bananaapiboard
git add src/utils/canvasPanoramaOverlay.js src/utils/canvasPanoramaOverlay.test.mjs
git commit -m "test: add panorama overlay helpers"
```

### Task 2: Modal Overlay State, Source Loading, And Editing UI

**Files:**
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`

- [ ] **Step 1: Add imports and overlay state**

Modify the top of `src/components/canvas/PanoramaPreviewModal.vue` to import APIs and helpers:

```js
import { getAssets } from '@/api/canvas/assets'
import { getHistory } from '@/api/canvas/history'
import {
  clampOverlayPosition,
  createDefaultOverlay,
  getOverlayExportRect,
  sortVisibleOverlays
} from '@/utils/canvasPanoramaOverlay'
```

Add refs near the existing modal state:

```js
const frameRef = ref(null)
const localFileInputRef = ref(null)
const overlays = ref([])
const selectedOverlayId = ref(null)
const showOverlayLabels = ref(true)
const overlayPickerOpen = ref(false)
const overlayPickerTab = ref('preset')
const overlayPickerLoading = ref(false)
const overlayPickerError = ref('')
const assetImages = ref([])
const historyImages = ref([])
const loadedOverlayTabs = ref(new Set())
const overlayDrag = ref(null)
const localObjectUrls = new Set()
```

- [ ] **Step 2: Add source loading and overlay mutation functions**

Add functions inside the `<script setup>` block before `closeModal()`:

```js
const selectedOverlay = computed(() => overlays.value.find(item => item.id === selectedOverlayId.value) || null)
const visibleSortedOverlays = computed(() => sortVisibleOverlays(overlays.value))

const presetMannequins = [
  {
    id: 'person-silhouette-1',
    name: '人物假人1',
    type: 'person',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="720" viewBox="0 0 320 720"><g fill="%23ffffff" stroke="%23111827" stroke-width="10"><circle cx="160" cy="76" r="48"/><path d="M116 142h88l32 196h-58v320h-36V338H84z"/></g></svg>'
  },
  {
    id: 'person-silhouette-2',
    name: '人物假人2',
    type: 'person',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="720" viewBox="0 0 320 720"><g fill="%23dbeafe" stroke="%231e3a8a" stroke-width="10"><circle cx="160" cy="72" r="44"/><path d="M130 132h60l70 200-46 16-28-76v386h-38V272l-28 76-46-16z"/></g></svg>'
  },
  {
    id: 'object-block-1',
    name: '物品占位',
    type: 'object',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="520" height="420" viewBox="0 0 520 420"><rect x="48" y="72" width="424" height="276" rx="28" fill="%23f8fafc" stroke="%230f172a" stroke-width="12"/><path d="M96 292l96-96 72 72 64-64 96 88" fill="none" stroke="%230f172a" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
]

async function getImageNaturalSize(url) {
  const image = await loadImageElement(url)
  return {
    naturalWidth: image.naturalWidth || image.width || 512,
    naturalHeight: image.naturalHeight || image.height || 512
  }
}

async function addOverlayFromSource(source) {
  try {
    const size = await getImageNaturalSize(source.url)
    const overlay = createDefaultOverlay({
      source: source.source,
      type: source.type || 'person',
      url: source.url,
      originalName: source.name || '',
      existingOverlays: overlays.value,
      naturalWidth: size.naturalWidth,
      naturalHeight: size.naturalHeight
    })
    overlays.value.push(overlay)
    selectedOverlayId.value = overlay.id
    overlayPickerOpen.value = false
    isAutoRotating.value = false
  } catch (error) {
    console.error('[PanoramaPreviewModal] 添加贴片失败:', error)
    errorMessage.value = '图片加载失败，请重试'
  }
}
```

Add asset/history picker functions:

```js
async function openOverlayPicker(tab = 'preset') {
  overlayPickerOpen.value = true
  overlayPickerTab.value = tab
  await loadOverlayPickerTab(tab)
}

async function loadOverlayPickerTab(tab) {
  if (tab === 'local' || tab === 'preset' || loadedOverlayTabs.value.has(tab)) return
  overlayPickerLoading.value = true
  overlayPickerError.value = ''
  try {
    if (tab === 'asset') {
      const result = await getAssets({ type: 'image', pageSize: 60 })
      const items = result.assets || result.data || []
      assetImages.value = items.map(item => ({
        id: item.id,
        name: item.name || '资产图片',
        url: item.url || item.content || item.thumbnail_url,
        thumbnailUrl: item.thumbnail_url || item.url || item.content,
        type: 'object',
        source: 'asset'
      })).filter(item => item.url)
    } else if (tab === 'history') {
      const items = await getHistory({ type: 'image', limit: 60 })
      historyImages.value = items.map(item => ({
        id: item.id,
        name: item.name || item.prompt || '历史图片',
        url: item.url,
        thumbnailUrl: item.thumbnail_url || item.url,
        type: 'object',
        source: 'history'
      })).filter(item => item.url)
    }
    loadedOverlayTabs.value = new Set([...loadedOverlayTabs.value, tab])
  } catch (error) {
    console.error('[PanoramaPreviewModal] 加载贴片来源失败:', error)
    overlayPickerError.value = '图片列表加载失败，请重试'
  } finally {
    overlayPickerLoading.value = false
  }
}
```

Add local file and editing functions:

```js
function triggerLocalOverlayUpload() {
  localFileInputRef.value?.click()
}

async function handleLocalOverlayFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorMessage.value = '请选择图片文件'
    return
  }
  const url = URL.createObjectURL(file)
  localObjectUrls.add(url)
  await addOverlayFromSource({
    source: 'local',
    type: 'person',
    name: file.name,
    url
  })
}

function updateSelectedOverlay(updates) {
  if (!selectedOverlayId.value) return
  overlays.value = overlays.value.map(item => item.id === selectedOverlayId.value ? { ...item, ...updates } : item)
}

function deleteOverlay(id) {
  const target = overlays.value.find(item => item.id === id)
  if (target?.source === 'local' && target.url?.startsWith('blob:')) {
    URL.revokeObjectURL(target.url)
    localObjectUrls.delete(target.url)
  }
  overlays.value = overlays.value.filter(item => item.id !== id)
  if (selectedOverlayId.value === id) {
    selectedOverlayId.value = overlays.value.at(-1)?.id || null
  }
}

function clearOverlays() {
  overlays.value.forEach(item => {
    if (item.source === 'local' && item.url?.startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
      localObjectUrls.delete(item.url)
    }
  })
  overlays.value = []
  selectedOverlayId.value = null
}
```

- [ ] **Step 3: Add overlay pointer controls**

Add these functions:

```js
function getFrameRect() {
  return frameRef.value?.getBoundingClientRect() || null
}

function handleOverlayPointerDown(event, overlay) {
  event.preventDefault()
  event.stopPropagation()
  selectedOverlayId.value = overlay.id
  isAutoRotating.value = false
  const rect = getFrameRect()
  if (!rect) return
  overlayDrag.value = {
    id: overlay.id,
    startX: event.clientX,
    startY: event.clientY,
    originalX: overlay.x,
    originalY: overlay.y,
    rect
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handleOverlayPointerMove(event) {
  if (!overlayDrag.value) return
  event.preventDefault()
  event.stopPropagation()
  const drag = overlayDrag.value
  const next = clampOverlayPosition({
    x: drag.originalX + (event.clientX - drag.startX) / Math.max(1, drag.rect.width),
    y: drag.originalY + (event.clientY - drag.startY) / Math.max(1, drag.rect.height)
  })
  overlays.value = overlays.value.map(item => item.id === drag.id ? { ...item, ...next } : item)
}

function handleOverlayPointerUp(event) {
  if (!overlayDrag.value) return
  event.preventDefault()
  event.stopPropagation()
  overlayDrag.value = null
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}

function getOverlayFrameStyle(overlay) {
  const rect = getOverlayExportRect({
    overlay,
    outputWidth: 1000,
    outputHeight: 1000,
    baseHeightRatio: 0.42
  })
  return {
    left: `${overlay.x * 100}%`,
    top: `${overlay.y * 100}%`,
    width: `${rect.width / 10}%`,
    transform: `translate(-50%, -50%) scaleX(${overlay.flipped ? -1 : 1})`,
    zIndex: overlay.zIndex
  }
}
```

- [ ] **Step 4: Revoke local URLs on cleanup**

Extend `onBeforeUnmount`:

```js
localObjectUrls.forEach(url => URL.revokeObjectURL(url))
localObjectUrls.clear()
```

- [ ] **Step 5: Add the template controls**

Inside `.panorama-controls`, add:

```vue
<div class="overlay-menu">
  <button type="button" :disabled="isLoading || isExporting || !!errorMessage" @click="openOverlayPicker('preset')">添加图片</button>
  <button type="button" :class="{ active: showOverlayLabels }" @click="showOverlayLabels = !showOverlayLabels">标签</button>
  <button type="button" :disabled="overlays.length === 0" @click="clearOverlays">清空贴片</button>
</div>
<input
  ref="localFileInputRef"
  class="sr-only-file"
  type="file"
  accept="image/png,image/jpeg,image/webp,image/gif"
  @change="handleLocalOverlayFile"
/>
```

Replace the existing preview frame div:

```vue
<div ref="frameRef" class="preview-frame" :style="outputFrameStyle">
  <div
    v-for="overlay in visibleSortedOverlays"
    :key="overlay.id"
    class="overlay-item"
    :class="{ selected: overlay.id === selectedOverlayId }"
    :style="getOverlayFrameStyle(overlay)"
    @pointerdown="handleOverlayPointerDown($event, overlay)"
    @pointermove="handleOverlayPointerMove"
    @pointerup="handleOverlayPointerUp"
    @pointercancel="handleOverlayPointerUp"
  >
    <div v-if="showOverlayLabels" class="overlay-label" :style="{ transform: overlay.flipped ? 'scaleX(-1)' : 'none' }">{{ overlay.label }}</div>
    <img :src="overlay.url" draggable="false" />
  </div>
</div>
```

Add the picker and inspector after `</main>` and before `<footer>`:

```vue
<aside class="overlay-inspector">
  <div class="inspector-header">
    <strong>贴片管理</strong>
    <span>{{ overlays.length }}</span>
  </div>
  <div v-if="overlays.length === 0" class="inspector-empty">暂无贴片</div>
  <button
    v-for="overlay in overlays"
    :key="overlay.id"
    class="overlay-row"
    :class="{ active: overlay.id === selectedOverlayId }"
    @click="selectedOverlayId = overlay.id"
  >
    <img :src="overlay.url" alt="" />
    <span>{{ overlay.label }}</span>
    <button type="button" @click.stop="updateOverlayById(overlay.id, { visible: overlay.visible === false })">{{ overlay.visible === false ? '隐' : '显' }}</button>
    <button type="button" @click.stop="deleteOverlay(overlay.id)">删</button>
  </button>
  <div v-if="selectedOverlay" class="overlay-editor">
    <label>名称<input :value="selectedOverlay.label" @input="updateSelectedOverlay({ label: $event.target.value })" /></label>
    <label>类型<select :value="selectedOverlay.type" @change="updateSelectedOverlay({ type: $event.target.value })"><option value="person">人物</option><option value="object">物品</option></select></label>
    <label>缩放<input type="range" min="0.2" max="3" step="0.05" :value="selectedOverlay.scale" @input="updateSelectedOverlay({ scale: Number($event.target.value) })" /></label>
    <button type="button" @click="updateSelectedOverlay({ flipped: !selectedOverlay.flipped })">左右反转</button>
  </div>
</aside>

<div v-if="overlayPickerOpen" class="overlay-picker" @click.self="overlayPickerOpen = false">
  <div class="overlay-picker-panel">
    <header>
      <strong>添加图片</strong>
      <button type="button" @click="overlayPickerOpen = false">×</button>
    </header>
    <nav>
      <button type="button" :class="{ active: overlayPickerTab === 'preset' }" @click="overlayPickerTab = 'preset'">预设假人</button>
      <button type="button" :class="{ active: overlayPickerTab === 'local' }" @click="overlayPickerTab = 'local'; triggerLocalOverlayUpload()">本地上传</button>
      <button type="button" :class="{ active: overlayPickerTab === 'asset' }" @click="overlayPickerTab = 'asset'; loadOverlayPickerTab('asset')">资产库</button>
      <button type="button" :class="{ active: overlayPickerTab === 'history' }" @click="overlayPickerTab = 'history'; loadOverlayPickerTab('history')">历史图片</button>
    </nav>
    <div v-if="overlayPickerLoading" class="picker-state">加载中...</div>
    <div v-else-if="overlayPickerError" class="picker-state is-error">{{ overlayPickerError }}</div>
    <div v-else class="picker-grid">
      <button
        v-for="item in overlayPickerTab === 'asset' ? assetImages : overlayPickerTab === 'history' ? historyImages : presetMannequins"
        :key="item.id"
        type="button"
        @click="addOverlayFromSource(item)"
      >
        <img :src="item.thumbnailUrl || item.url" alt="" />
        <span>{{ item.name }}</span>
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Add scoped styles**

Add styles at the end of `PanoramaPreviewModal.vue`:

```css
.sr-only-file {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.preview-frame {
  pointer-events: none;
}

.overlay-item {
  position: absolute;
  cursor: move;
  pointer-events: auto;
  transform-origin: center center;
}

.overlay-item img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  pointer-events: none;
}

.overlay-item.selected {
  outline: 1px solid rgba(45, 212, 191, 0.9);
}

.overlay-label {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
}

.overlay-inspector {
  position: absolute;
  z-index: 4;
  top: 66px;
  right: 14px;
  width: 236px;
  max-height: calc(100vh - 118px);
  overflow: auto;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(24, 24, 27, 0.9);
}

.inspector-header,
.overlay-row,
.overlay-editor label,
.overlay-picker-panel header,
.overlay-picker-panel nav {
  display: flex;
  align-items: center;
}

.inspector-header {
  justify-content: space-between;
  margin-bottom: 8px;
}

.inspector-empty,
.picker-state {
  color: #a1a1aa;
  padding: 12px;
  text-align: center;
}

.overlay-row {
  width: 100%;
  gap: 8px;
  margin-bottom: 6px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(39, 39, 42, 0.9);
  color: #f4f4f5;
}

.overlay-row.active {
  border-color: rgba(45, 212, 191, 0.65);
}

.overlay-row img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.overlay-row span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.overlay-editor {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.overlay-editor label {
  gap: 6px;
  justify-content: space-between;
  color: #a1a1aa;
}

.overlay-editor input,
.overlay-editor select,
.overlay-editor button {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #27272a;
  color: #f4f4f5;
}

.overlay-picker {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.overlay-picker-panel {
  width: min(720px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 32px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: #18181b;
}

.overlay-picker-panel header {
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.overlay-picker-panel nav {
  gap: 8px;
  padding: 10px 14px;
}

.overlay-picker-panel nav button.active,
.overlay-menu button.active {
  border-color: rgba(45, 212, 191, 0.65);
  color: #99f6e4;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 10px;
  overflow: auto;
  padding: 14px;
}

.picker-grid button {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: #27272a;
  color: #f4f4f5;
}

.picker-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.04);
}
```

- [ ] **Step 7: Run build and fix template errors**

Run:

```bash
cd /opt/banana/bananaapiboard
npm run build
```

Expected: build succeeds. If Vue template errors occur, fix them in `PanoramaPreviewModal.vue`.

- [ ] **Step 8: Commit**

```bash
cd /opt/banana/bananaapiboard
git add src/components/canvas/PanoramaPreviewModal.vue
git commit -m "feat: add panorama overlay editor"
```

### Task 3: Current-View Composite Export

**Files:**
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`
- Modify: `src/utils/canvasPanoramaOverlay.js`
- Modify: `src/utils/canvasPanoramaOverlay.test.mjs`

- [ ] **Step 1: Add a failing utility test for export rect scaling**

Append to `src/utils/canvasPanoramaOverlay.test.mjs`:

```js
assert.deepEqual(
  getOverlayExportRect({
    overlay: {
      x: 0.25,
      y: 0.25,
      scale: 2,
      naturalWidth: 100,
      naturalHeight: 100
    },
    outputWidth: 800,
    outputHeight: 600,
    baseHeightRatio: 0.25
  }),
  {
    width: 300,
    height: 300,
    left: 50,
    top: 0
  }
)
```

- [ ] **Step 2: Run the test**

Run:

```bash
cd /opt/banana/bananaapiboard
node src/utils/canvasPanoramaOverlay.test.mjs
```

Expected: PASS if Task 1 utility is already general enough. If it fails, update `getOverlayExportRect` to use `outputHeight * baseHeightRatio * scale` exactly as specified.

- [ ] **Step 3: Add compositing helpers to the modal**

In `PanoramaPreviewModal.vue`, add:

```js
async function loadOverlayImage(url) {
  const imageUrl = props.loadImageUrl && !url.startsWith('blob:') && !url.startsWith('data:')
    ? await props.loadImageUrl(url)
    : url
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('贴片图片加载失败，请重试'))
    image.src = imageUrl
  })
  return image
}

function drawOverlayLabel(ctx, label, centerX, top) {
  if (!showOverlayLabels.value || !label) return
  ctx.save()
  ctx.font = '600 28px sans-serif'
  const paddingX = 16
  const paddingY = 9
  const metrics = ctx.measureText(label)
  const width = Math.ceil(metrics.width + paddingX * 2)
  const height = 44
  const left = Math.round(centerX - width / 2)
  const y = Math.max(8, Math.round(top - height - 12))
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)'
  ctx.fillRect(left, y, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, centerX, y + height / 2 + paddingY / 4)
  ctx.restore()
}

async function compositeOverlays(baseBlob) {
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = ratioOption.value.width
  outputCanvas.height = ratioOption.value.height
  const ctx = outputCanvas.getContext('2d')
  if (!ctx) throw new Error('当前画面合成失败，请重试')

  const baseUrl = URL.createObjectURL(baseBlob)
  try {
    const baseImage = await loadOverlayImage(baseUrl)
    ctx.drawImage(baseImage, 0, 0, outputCanvas.width, outputCanvas.height)
  } finally {
    URL.revokeObjectURL(baseUrl)
  }

  for (const overlay of sortVisibleOverlays(overlays.value)) {
    const image = await loadOverlayImage(overlay.url)
    const rect = getOverlayExportRect({
      overlay,
      outputWidth: outputCanvas.width,
      outputHeight: outputCanvas.height,
      baseHeightRatio: 0.42
    })
    ctx.save()
    if (overlay.flipped) {
      ctx.translate(rect.left + rect.width, rect.top)
      ctx.scale(-1, 1)
      ctx.drawImage(image, 0, 0, rect.width, rect.height)
    } else {
      ctx.drawImage(image, rect.left, rect.top, rect.width, rect.height)
    }
    ctx.restore()
    drawOverlayLabel(ctx, overlay.label, rect.left + rect.width / 2, rect.top)
  }

  return await new Promise((resolve, reject) => {
    outputCanvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('当前画面合成失败，请重试'))
    }, 'image/png')
  })
}
```

- [ ] **Step 4: Route current-view exports through compositing**

In `exportViews`, change the frame push loop:

```js
let blob = await captureView(view)
if (mode === 'current-view' && overlays.value.some(item => item.visible !== false)) {
  blob = await compositeOverlays(blob)
}
frames.push({
  blob,
  yaw: view.yaw,
  pitch: view.pitch,
  fov: fov.value,
  label: view.label
})
```

- [ ] **Step 5: Run utility test**

Run:

```bash
cd /opt/banana/bananaapiboard
node src/utils/canvasPanoramaOverlay.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
cd /opt/banana/bananaapiboard
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /opt/banana/bananaapiboard
git add src/components/canvas/PanoramaPreviewModal.vue src/utils/canvasPanoramaOverlay.js src/utils/canvasPanoramaOverlay.test.mjs
git commit -m "feat: composite panorama overlays on export"
```

### Task 4: Polish, Verification, And Regression Pass

**Files:**
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`
- Modify: `src/utils/canvasPanoramaOverlay.js`

- [ ] **Step 1: Fix overlay visibility toggle**

Ensure the overlay row visibility button toggles the row item by ID, not only the currently selected item. Add:

```js
function updateOverlayById(id, updates) {
  overlays.value = overlays.value.map(item => item.id === id ? { ...item, ...updates } : item)
}
```

Use it in the template:

```vue
<button type="button" @click.stop="updateOverlayById(overlay.id, { visible: overlay.visible === false })">{{ overlay.visible === false ? '隐' : '显' }}</button>
```

- [ ] **Step 2: Add z-order controls**

Add functions:

```js
function moveOverlay(id, direction) {
  const current = overlays.value.find(item => item.id === id)
  if (!current) return
  const delta = direction === 'up' ? 1 : -1
  updateOverlayById(id, { zIndex: Math.max(1, (Number(current.zIndex) || 1) + delta) })
}
```

Add buttons inside `.overlay-editor`:

```vue
<div class="overlay-order-actions">
  <button type="button" @click="moveOverlay(selectedOverlay.id, 'up')">上移</button>
  <button type="button" @click="moveOverlay(selectedOverlay.id, 'down')">下移</button>
</div>
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd /opt/banana/bananaapiboard
node src/utils/canvasPanoramaOverlay.test.mjs
node src/utils/canvasPanoramaExport.test.mjs
```

Expected: both tests pass.

- [ ] **Step 4: Run production build**

Run:

```bash
cd /opt/banana/bananaapiboard
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Manual browser verification**

Start dev server:

```bash
cd /opt/banana/bananaapiboard
npm run dev -- --host 0.0.0.0
```

Manual checks:

- Open an image node with a panorama-capable image.
- Click `全景VR`.
- Add a preset mannequin.
- Add a local transparent PNG or WebP.
- Add one image from `资产库`.
- Add one image from `历史图片`.
- Drag, scale, rename, flip, hide, show, delete, and reorder overlays.
- Click `提取当前视角` and verify the created image node contains the panorama background, overlays, and labels.
- Click `4张图片`, `4宫格`, and `12宫格` and verify they still work without overlays.

- [ ] **Step 6: Commit final polish**

```bash
cd /opt/banana/bananaapiboard
git add src/components/canvas/PanoramaPreviewModal.vue src/utils/canvasPanoramaOverlay.js src/utils/canvasPanoramaOverlay.test.mjs
git commit -m "fix: polish panorama overlay controls"
```
