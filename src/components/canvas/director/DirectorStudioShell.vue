<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import DirectorStudioScene from './DirectorStudioScene.vue'
import DirectorStudioToolbar from './DirectorStudioToolbar.vue'
import DirectorStudioProjectPanel from './DirectorStudioProjectPanel.vue'
import DirectorStudioItemList from './DirectorStudioItemList.vue'
import DirectorStudioModelLibrary from './DirectorStudioModelLibrary.vue'
import DirectorStudioSnapshotPanel from './DirectorStudioSnapshotPanel.vue'
import DirectorStudioInspector from './DirectorStudioInspector.vue'
import DirectorStudioShortcutDialog from './DirectorStudioShortcutDialog.vue'
import { useDirectorStudioI18n } from './useDirectorStudioI18n.js'
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
import { persistDirectorStudioImageSource } from '@/utils/directorStudioMedia.js'
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
const snapshotPanelRef = ref(null)
const panoramaFileInput = ref(null)
const sceneErrorMessage = ref('')
const transformMode = ref('move')
const leftPanel = ref(null)
const inspectorActiveSection = ref('camera')
const shortcutsOpen = ref(false)
const itemClipboard = ref(null)
const selectedSnapshotUrl = ref(null)
const screenshotBusy = ref(false)
const panoramaBusy = ref(false)
const undoStack = ref([])
const redoStack = ref([])
const { dt } = useDirectorStudioI18n()

const SHORTCUT_ACTIONS = [
  ['transformMove', 'transformMove'],
  ['transformRotate', 'transformRotate'],
  ['transformScale', 'transformScale'],
  ['focus', 'focus'],
  ['fit', 'fit'],
  ['reset', 'reset'],
  ['screenshot', 'screenshot'],
  ['model', 'model'],
  ['lighting', 'lighting'],
  ['grid', 'grid'],
  ['prompt', 'prompt'],
  ['shortcuts', 'shortcuts'],
  ['save', 'save'],
  ['delete', 'delete'],
  ['copy', 'copy'],
  ['paste', 'paste'],
  ['undo', 'undo'],
  ['redo', 'redo']
]

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
const projectName = computed(() => props.data.title || props.data.label || dt('title', '3D导演台'))
const projects = computed(() => (
  Array.isArray(props.data.directorStudioProjects)
    ? props.data.directorStudioProjects.map(normalizeDirectorProjectRecord).filter(Boolean)
    : []
))
const snapshotUrl = computed(() => typeof props.data.snapshotUrl === 'string' && props.data.snapshotUrl.trim() ? props.data.snapshotUrl.trim() : null)
const snapshotHistory = computed(() => appendDirectorSnapshotHistory(props.data.snapshotHistory, snapshotUrl.value))
const snapshotHistoryNewestFirst = computed(() => [...snapshotHistory.value].reverse())
const hasSelection = computed(() => Boolean(selectedItem.value))
const canPaste = computed(() => Boolean(itemClipboard.value))
const itemCount = computed(() => items.value.length)
const referenceCount = computed(() => referenceAssets.value.length)
const peopleModels = computed(() => DIRECTOR_STUDIO_MODEL_CATALOG.filter(model => model.categoryId === 'people'))
const referenceAssets = computed(() => normalizeReferenceAssets([
  ...props.referenceImages,
  ...props.imageAssets
]))
const panoramaImportAssets = computed(() => normalizeReferenceAssets([
  ...props.panoramaAssets,
  ...referenceAssets.value
]))

const selectedStatusText = computed(() => {
  if (!selectedItem.value) return dt('status.noSelection', '未选择')
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
      label: source.label || source.title || source.name || dt('assetFallbackName', '参考图{count}', { count: normalized.length + 1 }),
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
  const labelBase = model.labelBase || model.displayName || model.presetId || dt('items.fallbackName', '元素')
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
    label: dt('items.copyName', '{name} 副本', { name: source.label || source.id || dt('items.fallbackName', '元素') }),
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
    label: dt('items.pasteName', '{name} 粘贴', { name: source.label || source.id || dt('items.fallbackName', '元素') }),
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
  sceneErrorMessage.value = error?.message || dt('errors.sceneLoadFailed', '3D 场景加载失败')
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

function buildOutputPatch(url, baseOutput = props.data.output) {
  const currentUrls = Array.isArray(baseOutput?.urls)
    ? baseOutput.urls.filter(item => typeof item === 'string' && item.trim())
    : []
  return {
    ...(baseOutput || {}),
    url,
    urls: [url, ...currentUrls.filter(item => item !== url)].slice(0, 12)
  }
}

function getDirectorOperationErrorMessage(error, fallback) {
  return error?.message || fallback
}

async function captureScreenshot() {
  if (screenshotBusy.value) return null
  screenshotBusy.value = true
  try {
    const size = computeDirectorScreenshotSize(aspectFrame.value, screenshotResolution.value)
    const dataUrl = sceneRef.value?.exportPng?.(size)
    if (!dataUrl) return null
    const snapshotUrl = await persistDirectorStudioImageSource(dataUrl)
    patchNodeData({
      snapshotUrl,
      snapshotHistory: appendDirectorSnapshotHistory(props.data.snapshotHistory, snapshotUrl),
      sourceImages: [snapshotUrl],
      output: { url: snapshotUrl, urls: [snapshotUrl] },
      status: 'success'
    })
    sceneErrorMessage.value = ''
    selectedSnapshotUrl.value = snapshotUrl
    leftPanel.value = 'snapshots'
    await nextTick()
    snapshotPanelRef.value?.focus?.()
    return snapshotUrl
  } catch (error) {
    sceneErrorMessage.value = getDirectorOperationErrorMessage(error, dt('errors.snapshotUploadFailed', '截图上传失败'))
    patchNodeData({ status: 'error' })
    return null
  } finally {
    screenshotBusy.value = false
  }
}

async function addSnapshotToCanvas() {
  const url = selectedSnapshotUrl.value || snapshotUrl.value || await captureScreenshot()
  if (!url) return
  emit('add-snapshot-to-canvas', { snapshotUrl: url })
}

function addSelectedSnapshotToCanvas() {
  const url = selectedSnapshotUrl.value || snapshotUrl.value
  if (!url) return
  emit('add-snapshot-to-canvas', { snapshotUrl: url })
}

function selectCurrentSnapshot() {
  if (!snapshotUrl.value) return
  selectedSnapshotUrl.value = snapshotUrl.value
  leftPanel.value = 'snapshots'
}

function selectSnapshot(url) {
  if (!url) return
  selectedSnapshotUrl.value = url
  patchNodeData({
    snapshotUrl: url,
    snapshotHistory: appendDirectorSnapshotHistory(props.data.snapshotHistory, url),
    sourceImages: [url],
    output: { url, urls: [url] },
    status: 'success'
  })
}

function deleteSelectedSnapshot() {
  const url = selectedSnapshotUrl.value
  if (!url) return
  const nextHistory = snapshotHistory.value.filter(item => item !== url)
  const nextSnapshotUrl = snapshotUrl.value === url ? nextHistory.at(-1) || null : snapshotUrl.value
  selectedSnapshotUrl.value = nextSnapshotUrl
  patchNodeData({
    snapshotHistory: nextHistory,
    snapshotUrl: nextSnapshotUrl,
    sourceImages: nextSnapshotUrl ? [nextSnapshotUrl] : [],
    output: nextSnapshotUrl ? { url: nextSnapshotUrl, urls: [nextSnapshotUrl] } : { url: null, urls: [] },
    status: nextSnapshotUrl ? 'success' : 'idle'
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

function buildProjectRecord(id, existing = null, name = projectName.value) {
  const now = Date.now()
  return normalizeDirectorProjectRecord({
    id,
    name,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    coverUrl: snapshotUrl.value || existing?.coverUrl || null,
    snapshot: captureDirectorSnapshot({
      ...props.data,
      items: items.value,
      directorStudioProjects: props.data.directorStudioProjects
    }, snapshotUrl.value)
  })
}

function writeProjectRecord(record) {
  if (!record) return
  const nextProjects = [
    ...projects.value.filter(project => project.id !== record.id),
    record
  ].filter(Boolean)
  patchNodeData({
    directorStudioProjects: nextProjects,
    activeDirectorStudioProjectId: record.id
  })
}

function saveProjectAsNew() {
  const projectSeed = {
    id: `director-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  writeProjectRecord(buildProjectRecord(projectSeed.id, null, projectName.value))
}

function saveActiveProject() {
  const activeId = typeof props.data.activeDirectorStudioProjectId === 'string' ? props.data.activeDirectorStudioProjectId : null
  const existing = projects.value.find(project => project.id === activeId)
  if (!existing) {
    saveProjectAsNew()
    return
  }
  writeProjectRecord(buildProjectRecord(existing.id, existing, existing.name))
}

function saveProject() {
  saveActiveProject()
}

function renameProject(projectId) {
  const record = normalizeDirectorProjectRecord(projects.value.find(project => project.id === projectId))
  if (!record || typeof window === 'undefined') return
  const nextName = window.prompt(dt('projects.namePrompt', '项目名称'), record.name)
  if (typeof nextName !== 'string' || !nextName.trim()) return
  patchNodeData({
    directorStudioProjects: projects.value.map(project => project.id === record.id
      ? normalizeDirectorProjectRecord({ ...project, name: nextName.trim(), updatedAt: Date.now() })
      : project
    ).filter(Boolean)
  })
}

function selectProject(projectId) {
  const record = normalizeDirectorProjectRecord(projects.value.find(project => project.id === projectId))
  if (!record) return
  const projectSnapshotUrl = typeof record.snapshot.snapshotUrl === 'string' && record.snapshot.snapshotUrl.trim()
    ? record.snapshot.snapshotUrl.trim()
    : null
  patchNodeData({
    ...record.snapshot,
    output: projectSnapshotUrl ? buildOutputPatch(projectSnapshotUrl, record.snapshot.output) : { url: null, urls: [] },
    title: record.name,
    activeDirectorStudioProjectId: record.id
  })
  emit('update:selectedItemId', null)
}

function restoreProject(projectId) {
  const record = normalizeDirectorProjectRecord(projects.value.find(project => project.id === projectId))
  if (!record) return
  const projectSnapshotUrl = typeof record.snapshot.snapshotUrl === 'string' && record.snapshot.snapshotUrl.trim()
    ? record.snapshot.snapshotUrl.trim()
    : null
  selectedSnapshotUrl.value = projectSnapshotUrl
  patchNodeData({
    ...record.snapshot,
    output: projectSnapshotUrl ? buildOutputPatch(projectSnapshotUrl, record.snapshot.output) : { url: null, urls: [] },
    title: record.name,
    activeDirectorStudioProjectId: record.id
  })
  emit('update:selectedItemId', null)
}

function deleteProject(projectId) {
  const nextProjects = projects.value.filter(project => project.id !== projectId)
  const nextActiveId = props.data.activeDirectorStudioProjectId === projectId ? null : props.data.activeDirectorStudioProjectId
  patchNodeData({
    directorStudioProjects: nextProjects,
    activeDirectorStudioProjectId: nextActiveId
  })
}

function updateProjectCoverFromSnapshot(projectId) {
  if (!snapshotUrl.value) return
  patchNodeData({
    directorStudioProjects: projects.value.map(project => project.id === projectId
      ? normalizeDirectorProjectRecord({ ...project, coverUrl: snapshotUrl.value, updatedAt: Date.now() })
      : project
    ).filter(Boolean)
  })
}

function readDirectorFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''))
    reader.addEventListener('error', () => reject(reader.error || new Error(dt('errors.fileReadFailed', '读取图片失败'))))
    reader.readAsDataURL(file)
  })
}

async function selectPanoramaSource(source) {
  if (panoramaBusy.value) return
  const url = typeof source === 'string'
    ? source.trim()
    : typeof source?.url === 'string'
      ? source.url.trim()
      : ''
  if (!url) return
  panoramaBusy.value = true
  try {
    const persistentUrl = await persistDirectorStudioImageSource(url)
    patchNodeData({
      mode: 'panorama',
      backgroundPanoramaUrl: persistentUrl,
      backgroundImageUrl: persistentUrl
    })
    sceneErrorMessage.value = ''
  } catch (error) {
    sceneErrorMessage.value = getDirectorOperationErrorMessage(error, dt('errors.panoramaImportFailed', '全景图导入失败'))
  } finally {
    panoramaBusy.value = false
  }
}

async function handlePanoramaFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const dataUrl = await readDirectorFileAsDataUrl(file)
  await selectPanoramaSource(dataUrl)
}

function clearPanoramaSource() {
  patchNodeData({ mode: 'flat', backgroundPanoramaUrl: null })
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

function isShellShortcutTarget(event) {
  if (shortcutsOpen.value || isEditableTarget(event.target)) return false
  const root = rootEl.value
  if (!root || typeof document === 'undefined' || typeof Element === 'undefined') return false
  const target = event.target instanceof Element ? event.target : null
  if (!target || !root.contains(target)) return false
  if (target.closest('.director-studio-scene')) return false
  const active = document.activeElement instanceof Element ? document.activeElement : null
  return active === root || (active != null && root.contains(active))
}

function normalizeShortcutKey(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === ' ' || key === 'spacebar') return 'space'
  if (key === 'del') return 'delete'
  if (key === 'esc') return 'escape'
  if (key === 'return') return 'enter'
  return key
}

function parseShortcutBinding(shortcut) {
  const parts = String(shortcut || '').split('+').map(part => part.trim().toLowerCase()).filter(Boolean)
  if (parts.length === 0) return null
  const binding = {
    commandEither: false,
    meta: false,
    ctrl: false,
    shift: false,
    alt: false,
    key: ''
  }

  parts.forEach(part => {
    if (part === 'cmd/ctrl' || part === 'ctrl/cmd') binding.commandEither = true
    else if (part === 'cmd' || part === 'command' || part === 'meta') binding.meta = true
    else if (part === 'ctrl' || part === 'control') binding.ctrl = true
    else if (part === 'shift') binding.shift = true
    else if (part === 'alt' || part === 'option') binding.alt = true
    else binding.key = normalizeShortcutKey(part)
  })

  return binding.key ? binding : null
}

function matchesShortcut(event, shortcut) {
  const binding = parseShortcutBinding(shortcut)
  if (!binding) return false
  if (binding.commandEither) {
    if (!event.metaKey && !event.ctrlKey) return false
  } else {
    if (event.metaKey !== binding.meta || event.ctrlKey !== binding.ctrl) return false
  }
  if (event.shiftKey !== binding.shift || event.altKey !== binding.alt) return false
  return normalizeShortcutKey(event.key) === binding.key
}

function resolveShortcutAction(event) {
  const bindings = shortcuts.value
  const match = SHORTCUT_ACTIONS.find(([key]) => matchesShortcut(event, bindings[key]))
  return match?.[1] || null
}

function handleShellKeydown(event) {
  if (!isShellShortcutTarget(event)) return
  const action = resolveShortcutAction(event)
  if (!action) return

  event.preventDefault()
  event.stopPropagation()

  if (action === 'transformMove') transformMode.value = 'move'
  else if (action === 'transformRotate') transformMode.value = 'rotate'
  else if (action === 'transformScale') transformMode.value = 'scale'
  else if (action === 'focus') focusSelected()
  else if (action === 'fit') sceneRef.value?.fitCamera?.()
  else if (action === 'reset') sceneRef.value?.resetCamera?.()
  else if (action === 'screenshot') void captureScreenshot()
  else if (action === 'model') leftPanel.value = 'models'
  else if (action === 'lighting') inspectorActiveSection.value = 'lighting'
  else if (action === 'grid') inspectorActiveSection.value = 'grid'
  else if (action === 'prompt') inspectorActiveSection.value = 'prompt'
  else if (action === 'shortcuts') shortcutsOpen.value = true
  else if (action === 'save') saveProject()
  else if (action === 'delete') deleteSelectedItem()
  else if (action === 'copy') copySelectedItem()
  else if (action === 'paste') pasteItem()
  else if (action === 'undo') undoItems()
  else if (action === 'redo') redoItems()
}

watch(items, nextItems => {
  if (!selectedSceneItemId.value) return
  const stillExists = nextItems.some(item => String(item?.id) === selectedSceneItemId.value)
  if (!stillExists) emit('update:selectedItemId', null)
})

watch(snapshotHistory, nextHistory => {
  if (selectedSnapshotUrl.value && nextHistory.includes(selectedSnapshotUrl.value)) return
  selectedSnapshotUrl.value = snapshotUrl.value || nextHistory.at(-1) || null
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  rootEl.value?.focus?.()
})
</script>

<template>
  <div class="director-shell-backdrop nodrag nopan" @click.self="emit('close')">
    <section ref="rootEl" class="director-shell" tabindex="-1" @click.stop @keydown="handleShellKeydown">
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
          <section class="director-panorama-panel">
            <div class="director-panel-heading">
              <div>
                <span>{{ dt('panorama.title', '全景') }}</span>
                <strong>{{ props.data.mode === 'panorama' ? dt('panorama.active', '已启用') : dt('panorama.flat', '平面') }}</strong>
              </div>
              <div class="director-panorama-actions">
                <button
                  type="button"
                  class="director-mini-button"
                  :title="dt('panorama.uploadTitle', '上传全景图')"
                  :disabled="panoramaBusy"
                  @click="panoramaFileInput?.click?.()"
                >{{ dt('panorama.upload', '上传') }}</button>
                <button
                  type="button"
                  class="director-mini-button"
                  :title="dt('panorama.clearTitle', '清除全景图')"
                  :disabled="panoramaBusy"
                  @click="clearPanoramaSource"
                >{{ dt('panorama.clear', '清除') }}</button>
              </div>
            </div>
            <input
              ref="panoramaFileInput"
              class="director-hidden-input"
              type="file"
              accept="image/*"
              @change="handlePanoramaFileChange"
            >
            <div class="director-panorama-assets">
              <button
                v-for="asset in panoramaImportAssets"
                :key="asset.id || asset.url"
                type="button"
                class="director-panorama-asset"
                :class="{ active: asset.url === props.data.backgroundPanoramaUrl }"
                :disabled="panoramaBusy"
                @click="selectPanoramaSource(asset)"
              >
                <img :src="asset.url" alt="">
                <span>{{ asset.label || asset.url }}</span>
              </button>
              <div v-if="panoramaImportAssets.length === 0" class="director-empty-row">{{ dt('panorama.noAssets', '暂无图片素材') }}</div>
            </div>
          </section>
          <DirectorStudioProjectPanel
            :projects="projects"
            :active-project-id="props.data.activeDirectorStudioProjectId"
            :title="projectName"
            @save-project="saveProject"
            @save-new-project="saveProjectAsNew"
            @save-active-project="saveActiveProject"
            @select-project="selectProject"
            @rename-project="renameProject"
            @restore-project="restoreProject"
            @delete-project="deleteProject"
            @update-project-cover="updateProjectCoverFromSnapshot"
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
          <div ref="snapshotPanelRef" class="director-snapshot-panel-focus" tabindex="-1">
            <DirectorStudioSnapshotPanel
              :snapshot-url="snapshotUrl"
              :snapshot-history="snapshotHistoryNewestFirst"
              :selected-snapshot-url="selectedSnapshotUrl"
              :busy="screenshotBusy"
              @capture-screenshot="captureScreenshot"
              @add-to-canvas="addSelectedSnapshotToCanvas"
              @select-current="selectCurrentSnapshot"
              @select-snapshot="selectSnapshot"
              @delete-snapshot="deleteSelectedSnapshot"
              @download-snapshot="downloadSnapshot"
            />
          </div>
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
            <strong>{{ dt('errors.sceneUnavailable', '3D 场景不可用') }}</strong>
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
        <span>{{ dt('status.items', '{count} 个元素', { count: itemCount }) }}</span>
        <span>{{ dt('status.references', '{count} 张参考', { count: referenceCount }) }}</span>
        <span>{{ dt('status.panoramas', '{count} 张全景', { count: props.panoramaAssets.length }) }}</span>
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
  --director-control-height: 34px;
  --director-control-line-height: 1.35;
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

.director-panorama-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.director-panel-heading div:first-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.director-panel-heading span {
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  text-transform: uppercase;
}

.director-panel-heading strong {
  overflow: hidden;
  color: #f4f4f5;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-panorama-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: flex-end;
}

.director-mini-button {
  display: inline-flex;
  min-width: var(--director-control-height, 34px);
  min-height: var(--director-control-height, 34px);
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #24272d;
  color: #d4d4d8;
  font-size: 11px;
  line-height: var(--director-control-line-height, 1.35);
  cursor: pointer;
}

.director-mini-button:hover:not(:disabled) {
  background: #30343b;
  color: #f8fafc;
}

.director-hidden-input {
  display: none;
}

.director-panorama-assets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.director-panorama-asset {
  display: grid;
  min-width: 0;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #0b0d10;
  color: #cbd5e1;
  overflow: hidden;
  cursor: pointer;
}

.director-panorama-asset:hover {
  border-color: rgba(34, 211, 238, 0.28);
}

.director-panorama-asset.active {
  border-color: rgba(34, 211, 238, 0.58);
}

.director-panorama-asset img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.director-panorama-asset span {
  overflow: hidden;
  padding: 5px 6px;
  font-size: 11px;
  line-height: 1.2;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-empty-row {
  grid-column: 1 / -1;
  padding: 8px;
  color: #8b949e;
  font-size: 11px;
}

.director-snapshot-panel-focus {
  outline: none;
}

.director-shell-stage {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 18px;
  background: #071012;
}

.director-shell-stage :deep(.director-studio-scene) {
  width: min(100%, calc((100vh - 112px) * var(--director-aspect-ratio, 1.7777778)));
  height: auto;
  max-height: 100%;
  min-height: 0;
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

@media (max-width: 860px) {
  .director-shell {
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
  }

  .director-shell-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(320px, 52vh) auto auto;
    overflow: auto;
  }

  .director-shell-stage {
    order: 1;
    min-height: 320px;
    padding: 12px;
  }

  .director-shell-stage :deep(.director-studio-scene) {
    width: min(100%, calc((52vh - 40px) * var(--director-aspect-ratio, 1.7777778)));
  }

  .director-shell-left {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    order: 2;
    min-height: 180px;
    max-height: none;
    overflow: visible;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-right: 0;
  }

  .director-shell-left > * {
    min-width: 0;
  }

  :deep(.director-inspector) {
    order: 3;
    width: 100%;
    min-width: 0;
    max-width: none;
    height: auto;
    max-height: 44vh;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 0;
  }

  .director-shell-status {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 28px;
  }

  .director-shell-status span:nth-child(n + 3) {
    display: none;
  }
}

@media (max-width: 640px) {
  .director-shell-left {
    grid-template-columns: minmax(0, 1fr);
  }

  .director-panorama-assets {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
