<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DirectorStudioScene from './DirectorStudioScene.vue'
import DirectorStudioToolbar from './DirectorStudioToolbar.vue'
import DirectorStudioProjectPanel from './DirectorStudioProjectPanel.vue'
import DirectorStudioItemList from './DirectorStudioItemList.vue'
import DirectorStudioModelLibrary from './DirectorStudioModelLibrary.vue'
import DirectorStudioSnapshotPanel from './DirectorStudioSnapshotPanel.vue'
import DirectorStudioInspector from './DirectorStudioInspector.vue'
import DirectorStudioShortcutDialog from './DirectorStudioShortcutDialog.vue'
import {
  DIRECTOR_ASPECT_FRAMES,
  DIRECTOR_CAMERA_PRESETS,
  DIRECTOR_SCREENSHOT_RESOLUTIONS,
  appendDirectorSnapshotHistory,
  captureDirectorSnapshot,
  normalizeDirectorAspectFrame,
  normalizeDirectorCamera,
  normalizeDirectorGrid,
  normalizeDirectorLighting,
  normalizeDirectorProjectRecord,
  normalizeDirectorScreenshotResolution,
  normalizeDirectorStudioShortcuts,
  normalizeDirectorViewSettings
} from '@/utils/directorStudioState.js'
import { ensureDirectorPos3d, pos3dToDirectorLegacy, readDirectorUiAxis } from '@/utils/directorStudioCoordinates.js'
import { computeDirectorScreenshotSize } from '@/utils/directorStudioSceneExport.js'
import {
  DIRECTOR_STUDIO_MODEL_CATALOG,
  DIRECTOR_STUDIO_MODEL_CATEGORIES
} from '@/config/canvas/directorStudioModelCatalog.js'

const props = defineProps({
  sourceNodeId: { type: String, required: true },
  data: { type: Object, required: true },
  referenceImages: { type: Array, default: () => [] },
  imageAssets: { type: Array, default: () => [] },
  panoramaAssets: { type: Array, default: () => [] },
  selectedItemId: { type: String, default: null }
})

const emit = defineEmits([
  'update:selectedItemId',
  'items-change',
  'update-node-data',
  'add-snapshot-to-canvas',
  'close'
])

const rootEl = ref(null)
const sceneRef = ref(null)
const sceneErrorMessage = ref('')
const transformMode = ref('move')
const leftPanel = ref(null)
const inspectorActiveSection = ref('camera')
const shortcutsOpen = ref(false)
const itemClipboard = ref(null)
const undoStack = ref([])
const redoStack = ref([])

const items = computed(() => Array.isArray(props.data.items) ? props.data.items : [])
const selectedSceneItemId = computed(() => props.selectedItemId == null ? null : String(props.selectedItemId))
const selectedItem = computed(() => items.value.find(item => String(item?.id) === selectedSceneItemId.value) || null)
const camera = computed(() => normalizeDirectorCamera(props.data.camera))
const lighting = computed(() => normalizeDirectorLighting(props.data.lighting))
const grid = computed(() => normalizeDirectorGrid(props.data.grid))
const viewSettings = computed(() => normalizeDirectorViewSettings(props.data.viewSettings))
const aspectFrame = computed(() => normalizeDirectorAspectFrame(props.data.aspectFrame || props.data.aspectRatio))
const screenshotResolution = computed(() => normalizeDirectorScreenshotResolution(props.data.screenshotResolution))
const shortcuts = computed(() => normalizeDirectorStudioShortcuts(props.data.directorStudioShortcuts))
const projectName = computed(() => props.data.title || props.data.label || 'Director Studio')
const projects = computed(() => (
  Array.isArray(props.data.directorStudioProjects)
    ? props.data.directorStudioProjects.map(normalizeDirectorProjectRecord).filter(Boolean)
    : []
))
const snapshotUrl = computed(() => typeof props.data.snapshotUrl === 'string' && props.data.snapshotUrl.trim() ? props.data.snapshotUrl.trim() : null)
const snapshotHistory = computed(() => appendDirectorSnapshotHistory(props.data.snapshotHistory, snapshotUrl.value))
const hasSelection = computed(() => Boolean(selectedItem.value))
const canPaste = computed(() => Boolean(itemClipboard.value))
const itemCount = computed(() => items.value.length)
const referenceCount = computed(() => referenceAssets.value.length)
const peopleModels = computed(() => DIRECTOR_STUDIO_MODEL_CATALOG.filter(model => model.categoryId === 'people'))
const referenceAssets = computed(() => normalizeReferenceAssets([
  ...props.referenceImages,
  ...props.imageAssets
]))

const selectedStatusText = computed(() => {
  if (!selectedItem.value) return 'No selection'
  const label = selectedItem.value.label || selectedItem.value.title || selectedItem.value.id
  const pos = ensureDirectorPos3d(selectedItem.value)
  return `${label} | X ${readDirectorUiAxis(pos, 'x').toFixed(1)} Y ${readDirectorUiAxis(pos, 'y').toFixed(1)} Z ${readDirectorUiAxis(pos, 'z').toFixed(1)}`
})

function patchNodeData(patch) {
  emit('update-node-data', patch)
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function cloneItems(value) {
  return Array.isArray(value) ? cloneJson(value) : []
}

function normalizeReferenceAssets(entries) {
  const seen = new Set()
  const normalized = []

  entries.forEach((entry, index) => {
    const source = entry && typeof entry === 'object' ? entry : { url: entry }
    const url = typeof source.url === 'string' && source.url.trim()
      ? source.url.trim()
      : typeof source.imageUrl === 'string' && source.imageUrl.trim()
        ? source.imageUrl.trim()
        : ''
    if (!url || seen.has(url)) return
    seen.add(url)
    normalized.push({
      id: source.id || `asset-${index + 1}`,
      url,
      label: source.label || source.title || source.name || `Image ${normalized.length + 1}`,
      color: source.color || '#38bdf8'
    })
  })

  return normalized
}

function emitItemsChange(nextItems, options = {}) {
  const trackHistory = options.trackHistory !== false
  if (trackHistory) {
    undoStack.value = [...undoStack.value.slice(-24), cloneItems(items.value)]
    redoStack.value = []
  }
  emit('items-change', cloneItems(nextItems))
  if (Object.prototype.hasOwnProperty.call(options, 'selectId')) {
    emit('update:selectedItemId', options.selectId == null ? null : String(options.selectId))
  }
}

function updateSelectedItem(patch, options = {}) {
  if (!selectedItem.value) return
  const id = String(selectedItem.value.id)
  const nextItems = items.value.map(item => String(item?.id) === id ? { ...cloneJson(item), ...cloneJson(patch) } : cloneJson(item))
  emitItemsChange(nextItems, options)
}

function replaceItem(nextItem, options = {}) {
  const id = String(nextItem?.id)
  if (!id) return
  const nextItems = items.value.map(item => String(item?.id) === id ? cloneJson(nextItem) : cloneJson(item))
  emitItemsChange(nextItems, options)
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getSuggestedPosition(offset = {}) {
  const base = sceneRef.value?.getSuggestedInsertPosition?.() || { x: 0, y: grid.value.height, z: 0 }
  return {
    x: base.x + (Number(offset.x) || 0),
    y: Number.isFinite(base.y) ? base.y : grid.value.height,
    z: base.z + (Number(offset.z) || 0)
  }
}

function createItemFromModel(model, pos3d, index = 0) {
  const position = pos3d || getSuggestedPosition()
  const legacy = pos3dToDirectorLegacy(position)
  const labelBase = model.labelBase || model.displayName || model.presetId || 'Item'
  const label = index > 0 ? `${labelBase} ${index + 1}` : `${labelBase} ${items.value.length + 1}`

  return {
    id: createId('director-item'),
    label,
    category: model.itemCategory || 'object',
    presetId: model.presetId || model.visualId || 'cube',
    visualId: model.visualId || model.presetId || 'cube',
    color: model.color || '#38bdf8',
    showLabel: true,
    x: legacy.x,
    y: legacy.y,
    pos3d: position,
    rotation3d: { x: 0, y: 0, z: 0 },
    scale3d: { x: 1, y: 1, z: 1 },
    action: '',
    relation: '',
    note: '',
    bodyControls: cloneJson(model.bodyControls || {})
  }
}

function addModel(model) {
  if (!model) return
  const item = createItemFromModel(model)
  emitItemsChange([...cloneItems(items.value), item], { selectId: item.id })
}

function addPedestrians(options = {}) {
  const models = peopleModels.value.length > 0 ? peopleModels.value : DIRECTOR_STUDIO_MODEL_CATALOG.filter(model => model.itemCategory === 'person')
  if (models.length === 0) return
  const count = Math.max(1, Math.min(80, Number.parseInt(options.count, 10) || 1))
  const base = getSuggestedPosition()
  const columns = Math.max(1, Math.min(20, Number.parseInt(options.columns, 10) || 1))
  const spacingX = Math.max(0.2, Math.min(10, Number(options.spacingX) || 1.2))
  const spacingZ = Math.max(0.2, Math.min(10, Number(options.spacingZ) || 1.2))
  const radius = Math.max(0.2, Math.min(30, Number(options.radius) || 3))
  const created = []

  for (let index = 0; index < count; index += 1) {
    let offset = { x: 0, z: 0 }
    if (options.mode === 'array') {
      const row = Math.floor(index / columns)
      const col = index % columns
      const rowCount = Math.ceil(count / columns)
      offset = {
        x: (col - (Math.min(columns, count) - 1) / 2) * spacingX,
        z: (row - (rowCount - 1) / 2) * spacingZ
      }
    } else if (options.mode === 'random') {
      const angle = Math.random() * Math.PI * 2
      const distance = Math.sqrt(Math.random()) * radius
      offset = {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance
      }
    }
    const model = models[index % models.length]
    created.push(createItemFromModel(model, { x: base.x + offset.x, y: base.y, z: base.z + offset.z }, index))
  }

  emitItemsChange([...cloneItems(items.value), ...created], { selectId: created[0]?.id || null })
}

function duplicateSelectedItem() {
  if (!selectedItem.value) return
  const source = cloneJson(selectedItem.value)
  const pos = ensureDirectorPos3d(source)
  const nextPos = { x: pos.x + 0.7, y: pos.y, z: pos.z + 0.35 }
  const legacy = pos3dToDirectorLegacy(nextPos)
  const copy = {
    ...source,
    id: createId('director-item'),
    label: `${source.label || source.id || 'Item'} copy`,
    x: legacy.x,
    y: legacy.y,
    pos3d: nextPos
  }
  emitItemsChange([...cloneItems(items.value), copy], { selectId: copy.id })
}

function copySelectedItem() {
  if (!selectedItem.value) return
  itemClipboard.value = cloneJson(selectedItem.value)
}

function pasteItem() {
  if (!itemClipboard.value) return
  const source = cloneJson(itemClipboard.value)
  const pos = ensureDirectorPos3d(source)
  const nextPos = { x: pos.x + 0.9, y: pos.y, z: pos.z + 0.45 }
  const legacy = pos3dToDirectorLegacy(nextPos)
  const item = {
    ...source,
    id: createId('director-item'),
    label: `${source.label || source.id || 'Item'} paste`,
    x: legacy.x,
    y: legacy.y,
    pos3d: nextPos
  }
  emitItemsChange([...cloneItems(items.value), item], { selectId: item.id })
}

function deleteSelectedItem() {
  if (!selectedItem.value) return
  const id = String(selectedItem.value.id)
  emitItemsChange(items.value.filter(item => String(item?.id) !== id), { selectId: null })
}

function undoItems() {
  const previous = undoStack.value.at(-1)
  if (!previous) return
  undoStack.value = undoStack.value.slice(0, -1)
  redoStack.value = [...redoStack.value.slice(-24), cloneItems(items.value)]
  emit('items-change', cloneItems(previous))
}

function redoItems() {
  const next = redoStack.value.at(-1)
  if (!next) return
  redoStack.value = redoStack.value.slice(0, -1)
  undoStack.value = [...undoStack.value.slice(-24), cloneItems(items.value)]
  emit('items-change', cloneItems(next))
}

function handleSceneSelectItem(itemId) {
  emit('update:selectedItemId', itemId == null ? null : String(itemId))
}

function handleItemListSelect(id) {
  emit('update:selectedItemId', id == null ? null : String(id))
}

function handleSceneUpdateItem(nextItem) {
  replaceItem(nextItem, { trackHistory: false })
}

function handleSceneReady() {
  sceneErrorMessage.value = ''
}

function handleSceneError(error) {
  sceneErrorMessage.value = error?.message || '3D scene failed to load.'
}

function applyNodePatch(patch) {
  patchNodeData(patch)
}

function patchCameraPreset(presetPatch) {
  patchNodeData({
    camera: {
      ...camera.value,
      ...presetPatch
    }
  })
}

function patchLighting(patch) {
  patchNodeData({ lighting: { ...lighting.value, ...patch } })
}

function patchGrid(patch) {
  patchNodeData({ grid: { ...grid.value, ...patch } })
}

function buildOutputPatch(url) {
  const currentUrls = Array.isArray(props.data.output?.urls)
    ? props.data.output.urls.filter(item => typeof item === 'string' && item.trim())
    : []
  return {
    ...(props.data.output || {}),
    url,
    urls: [url, ...currentUrls.filter(item => item !== url)].slice(0, 12)
  }
}

function captureScreenshot() {
  const size = computeDirectorScreenshotSize(aspectFrame.value, screenshotResolution.value)
  const url = sceneRef.value?.exportPng?.(size)
  if (!url) return null
  patchNodeData({
    snapshotUrl: url,
    snapshotHistory: appendDirectorSnapshotHistory(props.data.snapshotHistory, url),
    output: buildOutputPatch(url)
  })
  return url
}

function addSnapshotToCanvas() {
  const url = snapshotUrl.value || captureScreenshot()
  if (!url) return
  emit('add-snapshot-to-canvas', { snapshotUrl: url })
}

function selectSnapshot(url) {
  if (!url) return
  patchNodeData({
    snapshotUrl: url,
    snapshotHistory: appendDirectorSnapshotHistory(props.data.snapshotHistory, url),
    output: buildOutputPatch(url)
  })
}

function downloadSnapshot(url) {
  if (!url || typeof document === 'undefined') return
  const link = document.createElement('a')
  link.href = url
  link.download = `director-studio-${Date.now()}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function saveProject() {
  const now = Date.now()
  const activeId = typeof props.data.activeDirectorStudioProjectId === 'string' ? props.data.activeDirectorStudioProjectId : null
  const existing = projects.value.find(project => project.id === activeId)
  const id = existing?.id || `director-project-${props.sourceNodeId}-${now}`
  const snapshot = captureDirectorSnapshot({ ...props.data, items: items.value }, snapshotUrl.value)
  const record = normalizeDirectorProjectRecord({
    id,
    name: projectName.value,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    snapshot
  })
  const nextProjects = [
    ...projects.value.filter(project => project.id !== id),
    record
  ].filter(Boolean)
  patchNodeData({
    directorStudioProjects: nextProjects,
    activeDirectorStudioProjectId: id
  })
}

function selectProject(projectId) {
  const record = normalizeDirectorProjectRecord(projects.value.find(project => project.id === projectId))
  if (!record) return
  patchNodeData({
    ...record.snapshot,
    title: record.name,
    activeDirectorStudioProjectId: record.id
  })
  emit('update:selectedItemId', null)
}

function saveCustomPose(payload) {
  const key = payload?.key || createId('pose')
  const nextPoses = {
    ...(props.data.customActionPoses || {}),
    [key]: {
      name: payload?.name || key,
      action: payload?.action || '',
      bodyControls: cloneJson(payload?.bodyControls || {}),
      note: payload?.note || '',
      updatedAt: Date.now()
    }
  }
  patchNodeData({ customActionPoses: nextPoses })
}

function applyCustomPose(key) {
  const pose = props.data.customActionPoses?.[key]
  if (!pose || !selectedItem.value) return
  updateSelectedItem({
    action: pose.action || selectedItem.value.action || '',
    bodyControls: cloneJson(pose.bodyControls || selectedItem.value.bodyControls || {})
  })
}

function focusSelected() {
  if (!selectedSceneItemId.value) return
  sceneRef.value?.focusItem?.(selectedSceneItemId.value)
}

function isEditableTarget(target) {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.matches('input, textarea, select')
}

function handleShellKeydown(event) {
  if (isEditableTarget(event.target)) return
  const key = event.key.toLowerCase()
  const commandKey = event.metaKey || event.ctrlKey

  if (commandKey && key === 's') {
    event.preventDefault()
    saveProject()
    return
  }
  if (commandKey && key === 'c') {
    event.preventDefault()
    copySelectedItem()
    return
  }
  if (commandKey && key === 'v') {
    event.preventDefault()
    pasteItem()
    return
  }
  if (commandKey && key === 'z' && event.shiftKey) {
    event.preventDefault()
    redoItems()
    return
  }
  if (commandKey && key === 'z') {
    event.preventDefault()
    undoItems()
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelectedItem()
    return
  }
  if (key === '1') transformMode.value = 'move'
  else if (key === '2') transformMode.value = 'rotate'
  else if (key === '3') transformMode.value = 'scale'
  else if (key === 'f') focusSelected()
  else if (key === 'z') sceneRef.value?.fitCamera?.()
  else if (key === 'r') sceneRef.value?.resetCamera?.()
  else if (key === 'c') captureScreenshot()
  else if (key === 'm') leftPanel.value = 'models'
  else if (key === 'l') inspectorActiveSection.value = 'lighting'
  else if (key === 'g') inspectorActiveSection.value = 'grid'
  else if (key === 'p') inspectorActiveSection.value = 'prompt'
  else if (key === 'h') shortcutsOpen.value = true
  else return
  event.preventDefault()
}

watch(items, nextItems => {
  if (!selectedSceneItemId.value) return
  const stillExists = nextItems.some(item => String(item?.id) === selectedSceneItemId.value)
  if (!stillExists) emit('update:selectedItemId', null)
})

onMounted(async () => {
  window.addEventListener('keydown', handleShellKeydown)
  await nextTick()
  rootEl.value?.focus?.()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShellKeydown)
})
</script>

<template>
  <div class="director-shell-backdrop nodrag nopan" @click.self="emit('close')">
    <section ref="rootEl" class="director-shell" tabindex="-1" @click.stop>
      <DirectorStudioToolbar
        :project-name="projectName"
        :transform-mode="transformMode"
        :camera="camera"
        :lighting="lighting"
        :grid="grid"
        :camera-presets="DIRECTOR_CAMERA_PRESETS"
        :has-selection="hasSelection"
        :can-paste="canPaste"
        :has-snapshot="Boolean(snapshotUrl)"
        @close="emit('close')"
        @save-project="saveProject"
        @capture-screenshot="captureScreenshot"
        @add-to-canvas="addSnapshotToCanvas"
        @update:transform-mode="transformMode = $event"
        @camera-preset-change="patchCameraPreset"
        @lighting-patch="patchLighting"
        @grid-patch="patchGrid"
        @focus-selected="focusSelected"
        @fit-scene="sceneRef?.fitCamera?.()"
        @reset-camera="sceneRef?.resetCamera?.()"
        @copy-selected="copySelectedItem"
        @paste-item="pasteItem"
        @delete-selected="deleteSelectedItem"
      />

      <div class="director-shell-workspace">
        <aside class="director-shell-left">
          <DirectorStudioProjectPanel
            :projects="projects"
            :active-project-id="props.data.activeDirectorStudioProjectId"
            :title="projectName"
            @save-project="saveProject"
            @select-project="selectProject"
          />
          <DirectorStudioItemList
            :items="items"
            :selected-item-id="selectedSceneItemId"
            @select-item="handleItemListSelect"
          />
          <DirectorStudioModelLibrary
            :categories="DIRECTOR_STUDIO_MODEL_CATEGORIES"
            :models="DIRECTOR_STUDIO_MODEL_CATALOG"
            :highlighted="leftPanel === 'models'"
            @add-model="addModel"
            @add-pedestrian="addPedestrians"
          />
          <DirectorStudioSnapshotPanel
            :snapshot-url="snapshotUrl"
            :snapshot-history="snapshotHistory"
            @capture-screenshot="captureScreenshot"
            @add-to-canvas="addSnapshotToCanvas"
            @select-snapshot="selectSnapshot"
            @download-snapshot="downloadSnapshot"
          />
        </aside>

        <main class="director-shell-stage">
          <DirectorStudioScene
            ref="sceneRef"
            :items="items"
            :selected-item-id="selectedSceneItemId"
            :mode="props.data.mode || 'flat'"
            :background-panorama-url="props.data.backgroundPanoramaUrl"
            :camera-settings="camera"
            :lighting="lighting"
            :grid="grid"
            :view-settings="viewSettings"
            :transform-mode="transformMode"
            :aspect-frame="aspectFrame"
            @select-item="handleSceneSelectItem"
            @update-item="handleSceneUpdateItem"
            @scene-ready="handleSceneReady"
            @scene-error="handleSceneError"
          />
          <div v-if="sceneErrorMessage" class="director-shell-scene-error" role="alert">
            <strong>3D scene unavailable</strong>
            <span>{{ sceneErrorMessage }}</span>
          </div>
        </main>

        <DirectorStudioInspector
          :selected-item="selectedItem"
          :reference-assets="referenceAssets"
          :camera="camera"
          :lighting="lighting"
          :grid="grid"
          :view-settings="viewSettings"
          :aspect-frame="aspectFrame"
          :aspect-frames="DIRECTOR_ASPECT_FRAMES"
          :screenshot-resolution="screenshotResolution"
          :screenshot-resolutions="DIRECTOR_SCREENSHOT_RESOLUTIONS"
          :base-prompt="props.data.basePrompt || ''"
          :transform-mode="transformMode"
          :custom-action-poses="props.data.customActionPoses || {}"
          :active-section="inspectorActiveSection"
          :can-paste="canPaste"
          @item-patch="updateSelectedItem"
          @duplicate-item="duplicateSelectedItem"
          @delete-item="deleteSelectedItem"
          @copy-item="copySelectedItem"
          @paste-item="pasteItem"
          @patch-node-data="applyNodePatch"
          @save-custom-pose="saveCustomPose"
          @apply-custom-pose="applyCustomPose"
          @focus-selected="focusSelected"
          @update:transform-mode="transformMode = $event"
          @open-shortcuts="shortcutsOpen = true"
        />
      </div>

      <footer class="director-shell-status">
        <span>{{ selectedStatusText }}</span>
        <span>{{ itemCount }} items</span>
        <span>{{ referenceCount }} references</span>
        <span>{{ props.panoramaAssets.length }} panoramas</span>
      </footer>

      <DirectorStudioShortcutDialog
        :open="shortcutsOpen"
        :shortcuts="shortcuts"
        @close="shortcutsOpen = false"
      />
    </section>
  </div>
</template>

<style scoped>
.director-shell-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  background: rgba(0, 0, 0, 0.72);
  cursor: default;
}

.director-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 28px;
  width: 100vw;
  height: 100vh;
  min-width: 980px;
  background: #0b0d10;
  color: #f4f4f5;
  outline: none;
}

.director-shell-workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) auto;
  min-height: 0;
}

.director-shell-left {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: #111317;
}

.director-shell-stage {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
  background: #071012;
}

.director-shell-stage :deep(.director-studio-scene) {
  width: 100%;
  height: 100%;
  min-height: 0;
  aspect-ratio: auto !important;
}

.director-shell-scene-error {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: grid;
  gap: 3px;
  max-width: 520px;
  padding: 9px 10px;
  border: 1px solid rgba(248, 113, 113, 0.32);
  border-radius: 7px;
  background: rgba(69, 10, 10, 0.72);
  color: #fecaca;
}

.director-shell-scene-error strong {
  color: #fee2e2;
  font-size: 12px;
  line-height: 1.2;
}

.director-shell-scene-error span {
  font-size: 11px;
  line-height: 1.35;
}

.director-shell-status {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 14px;
  align-items: center;
  padding: 0 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #15171a;
  color: #9ca3af;
  font-size: 11px;
}

.director-shell-status span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1120px) {
  .director-shell {
    min-width: 0;
  }

  .director-shell-workspace {
    grid-template-columns: 260px minmax(0, 1fr) 320px;
  }
}
</style>
