<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { getAssets } from '@/api/canvas/assets'
import { getHistory } from '@/api/canvas/history'
import {
  PANORAMA_RATIO_OPTIONS,
  PROJECTION_OPTIONS,
  getPanoramaRatioOption,
  getPresetPanoramaViews,
  getProjectionCameraSettings
} from '@/utils/canvasPanoramaExport'
import {
  clampOverlayPosition,
  createPanoramaOverlayPresets,
  createDefaultOverlay,
  getOverlayExportRect,
  mapHistoryToOverlaySources,
  moveOverlayInStack,
  normalizeOverlayStack,
  sortVisibleOverlays
} from '@/utils/canvasPanoramaOverlay'

const props = defineProps({
  imageUrl: {
    type: String,
    required: true
  },
  loadImageUrl: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['close', 'export'])

const viewportRef = ref(null)
const frameRef = ref(null)
const localFileInputRef = ref(null)
const selectedProjection = ref('rectilinear')
const selectedRatio = ref('16:9')
const fov = ref(90)
const isLoading = ref(true)
const isExporting = ref(false)
const errorMessage = ref('')
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
const rowDragId = ref(null)
const editingOverlayId = ref(null)
const editingLabelDraft = ref('')

const yaw = ref(0)
const pitch = ref(0)
const isDragging = ref(false)
const isAutoRotating = ref(true)
const lastPointer = { x: 0, y: 0 }
const localObjectUrls = new Set()

let renderer = null
let scene = null
let camera = null
let sphere = null
let texture = null
let animationFrame = 0
let mounted = true

const ratioOption = computed(() => getPanoramaRatioOption(selectedRatio.value) || PANORAMA_RATIO_OPTIONS[0])
const selectedProjectionLabel = computed(() => {
  return PROJECTION_OPTIONS.find(option => option.id === selectedProjection.value)?.label || '直线投影'
})
const selectedOverlay = computed(() => overlays.value.find(item => item.id === selectedOverlayId.value) || null)
const visibleSortedOverlays = computed(() => sortVisibleOverlays(overlays.value))
const overlayPresets = createPanoramaOverlayPresets()
const currentPickerItems = computed(() => {
  if (overlayPickerTab.value === 'asset') return assetImages.value
  if (overlayPickerTab.value === 'history') return historyImages.value
  if (overlayPickerTab.value === 'local') return []
  if (overlayPickerTab.value === 'object') return overlayPresets.objects
  return overlayPresets.people
})
const outputFrameStyle = computed(() => {
  const ratio = ratioOption.value.width / ratioOption.value.height
  const maxWidth = 'min(72vw, 1120px)'
  const maxHeight = 'min(68vh, 720px)'
  return {
    aspectRatio: `${ratioOption.value.width} / ${ratioOption.value.height}`,
    width: ratio >= 1 ? maxWidth : `min(42vw, ${Math.round(720 * ratio)}px)`,
    maxWidth,
    maxHeight
  }
})

watch(selectedProjection, () => {
  const settings = getProjectionCameraSettings(selectedProjection.value)
  fov.value = settings.fov
  pitch.value = clampPitch(pitch.value + settings.pitchOffset)
  updateCamera()
})

onMounted(async () => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('resize', resizeRenderer)
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  await nextTick()
  await initScene()
})

onBeforeUnmount(() => {
  mounted = false
  document.body.style.overflow = ''
  window.removeEventListener('resize', resizeRenderer)
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  localObjectUrls.forEach(url => URL.revokeObjectURL(url))
  localObjectUrls.clear()
  cleanupScene()
})

async function initScene() {
  try {
    if (!viewportRef.value) return
    if (!isWebGLAvailable()) {
      throw new Error('当前浏览器不支持全景预览')
    }

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(fov.value, 1, 0.1, 1200)
    camera.position.set(0, 0, 0.1)

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x050505, 1)
    viewportRef.value.appendChild(renderer.domElement)

    const image = await loadImageElement(props.imageUrl)
    if (!mounted) return
    texture = new THREE.Texture(image)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true

    const geometry = new THREE.SphereGeometry(500, 96, 64)
    geometry.scale(-1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ map: texture })
    sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    isLoading.value = false
    resizeRenderer()
    animate()
  } catch (error) {
    console.error('[PanoramaPreviewModal] 初始化失败:', error)
    errorMessage.value = error.message || '全景图片加载失败，请重试'
    isLoading.value = false
  }
}

async function loadImageElement(url) {
  const shouldResolve = props.loadImageUrl && !String(url).startsWith('blob:') && !String(url).startsWith('data:')
  const imageUrl = shouldResolve ? await props.loadImageUrl(url) : url
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('全景图片加载失败，请重试'))
    image.src = imageUrl
  })
  return image
}

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch (_) {
    return false
  }
}

function animate() {
  if (!mounted || !renderer || !scene || !camera) return
  animationFrame = requestAnimationFrame(animate)
  if (isAutoRotating.value && !isDragging.value && !isExporting.value) {
    yaw.value = (yaw.value + 0.035) % 360
  }
  updateCamera()
  renderer.render(scene, camera)
}

function updateCamera(customCamera = camera, customYaw = yaw.value, customPitch = pitch.value, customFov = fov.value) {
  if (!customCamera) return
  customCamera.fov = customFov
  customCamera.aspect = customCamera.aspect || 1
  customCamera.updateProjectionMatrix()

  const phi = THREE.MathUtils.degToRad(90 - customPitch)
  const theta = THREE.MathUtils.degToRad(customYaw)
  const target = new THREE.Vector3(
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.cos(theta)
  )
  customCamera.lookAt(target)
}

function resizeRenderer() {
  if (!renderer || !camera || !viewportRef.value) return
  const rect = viewportRef.value.getBoundingClientRect()
  renderer.setSize(rect.width, rect.height)
  camera.aspect = rect.width / Math.max(rect.height, 1)
  camera.updateProjectionMatrix()
}

function cleanupScene() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }
  if (sphere) {
    sphere.geometry?.dispose()
    sphere.material?.dispose()
    sphere = null
  }
  texture?.dispose()
  texture = null
  renderer?.dispose()
  renderer?.domElement?.remove()
  renderer = null
  scene = null
  camera = null
}

function handlePointerDown(event) {
  isDragging.value = true
  isAutoRotating.value = false
  lastPointer.x = event.clientX
  lastPointer.y = event.clientY
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handlePointerMove(event) {
  if (!isDragging.value) return
  const dx = event.clientX - lastPointer.x
  const dy = event.clientY - lastPointer.y
  lastPointer.x = event.clientX
  lastPointer.y = event.clientY
  yaw.value = (yaw.value - dx * 0.12 + 360) % 360
  pitch.value = clampPitch(pitch.value + dy * 0.1)
}

function handlePointerUp(event) {
  isDragging.value = false
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}

function handleWheel(event) {
  fov.value = Math.max(35, Math.min(130, fov.value + Math.sign(event.deltaY) * 4))
  updateCamera()
}

function handleKeydown(event) {
  if (event.code === 'Escape') {
    closeModal()
    return
  }
  if (event.code !== 'Space') return
  const tagName = event.target?.tagName?.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tagName)) return
  event.preventDefault()
  isAutoRotating.value = !isAutoRotating.value
}

function clampPitch(value) {
  return Math.max(-82, Math.min(82, value))
}

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
    overlays.value = normalizeOverlayStack([...overlays.value, overlay])
    selectedOverlayId.value = overlay.id
    overlayPickerOpen.value = false
    isAutoRotating.value = false
  } catch (error) {
    console.error('[PanoramaPreviewModal] 添加贴片失败:', error)
    errorMessage.value = '图片加载失败，请重试'
  }
}

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
      const result = await getHistory({ type: 'image', limit: 60 })
      historyImages.value = mapHistoryToOverlaySources(result)
    }
    loadedOverlayTabs.value = new Set([...loadedOverlayTabs.value, tab])
  } catch (error) {
    console.error('[PanoramaPreviewModal] 加载贴片来源失败:', error)
    overlayPickerError.value = '图片列表加载失败，请重试'
  } finally {
    overlayPickerLoading.value = false
  }
}

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
  updateOverlayById(selectedOverlayId.value, updates)
}

function updateOverlayById(id, updates) {
  overlays.value = overlays.value.map(item => item.id === id ? { ...item, ...updates } : item)
}

function deleteOverlay(id) {
  const target = overlays.value.find(item => item.id === id)
  if (target?.source === 'local' && target.url?.startsWith('blob:')) {
    URL.revokeObjectURL(target.url)
    localObjectUrls.delete(target.url)
  }
  overlays.value = normalizeOverlayStack(overlays.value.filter(item => item.id !== id))
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

function moveOverlay(id, direction) {
  overlays.value = moveOverlayInStack(overlays.value, id, direction)
}

function getFrameRect() {
  return frameRef.value?.getBoundingClientRect() || null
}

function beginInlineRename(overlay) {
  editingOverlayId.value = overlay.id
  editingLabelDraft.value = overlay.label || ''
  nextTick(() => {
    document.querySelector(`[data-overlay-label-input="${overlay.id}"]`)?.focus()
  })
}

function commitInlineRename() {
  if (!editingOverlayId.value) return
  const label = editingLabelDraft.value.trim()
  if (label) updateOverlayById(editingOverlayId.value, { label })
  editingOverlayId.value = null
  editingLabelDraft.value = ''
}

function cancelInlineRename() {
  editingOverlayId.value = null
  editingLabelDraft.value = ''
}

function handleDocumentPointerDown(event) {
  if (!editingOverlayId.value) return
  const input = document.querySelector(`[data-overlay-label-input="${editingOverlayId.value}"]`)
  if (input && input.contains(event.target)) return
  commitInlineRename()
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
    mode: 'move',
    rect
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handleOverlayResizePointerDown(event, overlay) {
  event.preventDefault()
  event.stopPropagation()
  selectedOverlayId.value = overlay.id
  isAutoRotating.value = false
  overlayDrag.value = {
    id: overlay.id,
    startX: event.clientX,
    startY: event.clientY,
    originalScale: Number(overlay.scale) || 1,
    mode: 'resize'
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handleOverlayPointerMove(event) {
  if (!overlayDrag.value) return
  event.preventDefault()
  event.stopPropagation()
  const drag = overlayDrag.value
  if (drag.mode === 'resize') {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    const direction = (event.clientX - drag.startX) + (event.clientY - drag.startY) >= 0 ? 1 : -1
    const nextScale = Math.max(0.2, Math.min(3, drag.originalScale + direction * distance / 220))
    updateOverlayById(drag.id, { scale: Number(nextScale.toFixed(2)) })
    return
  }
  const next = clampOverlayPosition({
    x: drag.originalX + (event.clientX - drag.startX) / Math.max(1, drag.rect.width),
    y: drag.originalY + (event.clientY - drag.startY) / Math.max(1, drag.rect.height)
  })
  updateOverlayById(drag.id, next)
}

function handleOverlayPointerUp(event) {
  if (!overlayDrag.value) return
  event.preventDefault()
  event.stopPropagation()
  overlayDrag.value = null
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}

function handleRowDragStart(event, overlay) {
  rowDragId.value = overlay.id
  selectedOverlayId.value = overlay.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', overlay.id)
}

function handleRowDrop(event, targetOverlay) {
  const sourceId = rowDragId.value || event.dataTransfer.getData('text/plain')
  rowDragId.value = null
  if (!sourceId || sourceId === targetOverlay.id) return
  const targetIndex = overlays.value.findIndex(item => item.id === targetOverlay.id)
  overlays.value = moveOverlayInStack(overlays.value, sourceId, targetIndex)
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

async function loadOverlayImage(url) {
  const shouldResolve = props.loadImageUrl && !String(url).startsWith('blob:') && !String(url).startsWith('data:')
  const imageUrl = shouldResolve ? await props.loadImageUrl(url) : url
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
  ctx.fillText(label, centerX, y + height / 2)
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

function closeModal() {
  emit('close')
}

async function exportCurrentView() {
  await exportViews('current-view', [{ label: '当前视角', yaw: yaw.value, pitch: pitch.value }], null)
}

async function exportFourImages() {
  await exportViews('images', getPresetPanoramaViews(4), null)
}

async function exportStoryboard(count) {
  await exportViews('storyboard', getPresetPanoramaViews(count), count === 4 ? '2x2' : '3x4')
}

async function exportViews(mode, views, storyboardGridSize) {
  if (!scene || !texture || isExporting.value) return
  isExporting.value = true
  errorMessage.value = ''
  try {
    const frames = []
    for (const view of views) {
      let blob = await captureView(view)
      if (mode === 'current-view' && overlays.value.some(item => item.visible !== false && item.url)) {
        blob = await compositeOverlays(blob)
      }
      frames.push({
        blob,
        yaw: view.yaw,
        pitch: view.pitch,
        fov: fov.value,
        label: view.label
      })
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    emit('export', {
      mode,
      ratio: ratioOption.value.id,
      projection: selectedProjection.value,
      width: ratioOption.value.width,
      height: ratioOption.value.height,
      frames,
      storyboardGridSize
    })
    closeModal()
  } catch (error) {
    console.error('[PanoramaPreviewModal] 导出失败:', error)
    errorMessage.value = error.message || '视角提取失败，请重试'
  } finally {
    isExporting.value = false
  }
}

async function captureView(view) {
  const width = ratioOption.value.width
  const height = ratioOption.value.height
  const captureRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  captureRenderer.setPixelRatio(1)
  captureRenderer.setSize(width, height, false)
  captureRenderer.setClearColor(0x050505, 1)

  const captureCamera = new THREE.PerspectiveCamera(fov.value, width / height, 0.1, 1200)
  captureCamera.position.set(0, 0, 0.1)
  updateCamera(captureCamera, view.yaw, view.pitch, fov.value)
  captureRenderer.render(scene, captureCamera)

  const canvas = captureRenderer.domElement
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) resolve(result)
      else reject(new Error('视角提取失败，请重试'))
    }, 'image/png')
  })
  captureRenderer.dispose()
  canvas.remove()
  return blob
}
</script>

<template>
  <Teleport to="body">
    <div class="panorama-modal" @keydown.esc="closeModal" tabindex="-1">
      <header class="panorama-topbar">
        <div class="panorama-title">
          <span class="title-icon">◎</span>
          <span>全景VR预览</span>
        </div>
        <div class="panorama-controls">
          <label>
            <span>投影:</span>
            <select v-model="selectedProjection" :disabled="isExporting">
              <option v-for="option in PROJECTION_OPTIONS" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label>
            <span>比例:</span>
            <select v-model="selectedRatio" :disabled="isExporting">
              <option v-for="option in PANORAMA_RATIO_OPTIONS" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </label>
          <output class="output-size">输出: {{ ratioOption.width }}x{{ ratioOption.height }}</output>
          <button class="primary-action" :disabled="isLoading || isExporting || !!errorMessage" @click="exportCurrentView">
            {{ isExporting ? '提取中...' : '提取当前视角' }}
          </button>
          <input
            ref="localFileInputRef"
            class="sr-only-file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="handleLocalOverlayFile"
          />
          <button :disabled="isLoading || isExporting || !!errorMessage" @click="exportFourImages">4张图片</button>
          <button :disabled="isLoading || isExporting || !!errorMessage" @click="exportStoryboard(4)">4宫格</button>
          <button :disabled="isLoading || isExporting || !!errorMessage" @click="exportStoryboard(12)">12宫格</button>
          <button class="close-btn" title="关闭" @click="closeModal">×</button>
        </div>
      </header>

      <main
        ref="viewportRef"
        class="panorama-viewport"
        @pointerdown.prevent="handlePointerDown"
        @pointermove.prevent="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @wheel.prevent="handleWheel"
      >
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
            <input
              v-if="editingOverlayId === overlay.id"
              :data-overlay-label-input="overlay.id"
              class="overlay-label-input"
              v-model="editingLabelDraft"
              @pointerdown.stop
              @keydown.enter.prevent="commitInlineRename"
              @keydown.esc.prevent="cancelInlineRename"
              @blur="commitInlineRename"
            />
            <div
              v-else-if="showOverlayLabels"
              class="overlay-label"
              :style="{ transform: overlay.flipped ? 'translateX(-50%) scaleX(-1)' : 'translateX(-50%)' }"
              @pointerdown.stop
              @dblclick.stop="beginInlineRename(overlay)"
            >
              {{ overlay.label }}
            </div>
            <img :src="overlay.url" draggable="false" />
            <button
              v-if="overlay.id === selectedOverlayId"
              type="button"
              class="overlay-resize-handle"
              title="拖动缩放"
              @pointerdown="handleOverlayResizePointerDown($event, overlay)"
              @pointermove="handleOverlayPointerMove"
              @pointerup="handleOverlayPointerUp"
              @pointercancel="handleOverlayPointerUp"
            ></button>
          </div>
        </div>
        <div v-if="isLoading" class="panorama-state">全景加载中...</div>
        <div v-else-if="errorMessage" class="panorama-state is-error">{{ errorMessage }}</div>
        <div v-else-if="isExporting" class="panorama-state">正在提取视角...</div>
      </main>

      <aside class="overlay-inspector">
        <div class="inspector-header">
          <strong>贴片管理</strong>
          <span>{{ overlays.length }}</span>
        </div>
        <div class="inspector-actions">
          <button type="button" :disabled="isLoading || isExporting || !!errorMessage" @click="openOverlayPicker('preset')">添加图片</button>
          <button type="button" :class="{ active: showOverlayLabels }" @click="showOverlayLabels = !showOverlayLabels">标签</button>
          <button type="button" :disabled="overlays.length === 0" @click="clearOverlays">清空</button>
        </div>
        <div v-if="overlays.length === 0" class="inspector-empty">暂无贴片</div>
        <div
          v-for="overlay in overlays"
          :key="overlay.id"
          class="overlay-row"
          :class="{ active: overlay.id === selectedOverlayId }"
          draggable="true"
          @click="selectedOverlayId = overlay.id"
          @dragstart="handleRowDragStart($event, overlay)"
          @dragover.prevent
          @drop.prevent="handleRowDrop($event, overlay)"
          @dragend="rowDragId = null"
        >
          <span class="drag-handle">⋮⋮</span>
          <img :src="overlay.url" alt="" />
          <span>{{ overlay.label }}</span>
          <button type="button" @click.stop="updateOverlayById(overlay.id, { visible: overlay.visible === false })">{{ overlay.visible === false ? '隐' : '显' }}</button>
          <button type="button" @click.stop="deleteOverlay(overlay.id)">删</button>
        </div>
        <div v-if="selectedOverlay" class="overlay-editor">
          <label>
            <span>名称</span>
            <input :value="selectedOverlay.label" @input="updateSelectedOverlay({ label: $event.target.value })" />
          </label>
          <label>
            <span>类型</span>
            <select :value="selectedOverlay.type" @change="updateSelectedOverlay({ type: $event.target.value })">
              <option value="person">人物</option>
              <option value="object">物品</option>
            </select>
          </label>
          <label>
            <span>缩放</span>
            <input type="range" min="0.2" max="3" step="0.05" :value="selectedOverlay.scale" @input="updateSelectedOverlay({ scale: Number($event.target.value) })" />
          </label>
          <button type="button" @click="updateSelectedOverlay({ flipped: !selectedOverlay.flipped })">左右反转</button>
          <div class="overlay-order-actions">
            <button type="button" @click="moveOverlay(selectedOverlay.id, 'up')">上移</button>
            <button type="button" @click="moveOverlay(selectedOverlay.id, 'down')">下移</button>
          </div>
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
            <button type="button" :class="{ active: overlayPickerTab === 'object' }" @click="overlayPickerTab = 'object'">物品</button>
            <button type="button" :class="{ active: overlayPickerTab === 'local' }" @click="overlayPickerTab = 'local'; triggerLocalOverlayUpload()">本地上传</button>
            <button type="button" :class="{ active: overlayPickerTab === 'asset' }" @click="overlayPickerTab = 'asset'; loadOverlayPickerTab('asset')">资产库</button>
            <button type="button" :class="{ active: overlayPickerTab === 'history' }" @click="overlayPickerTab = 'history'; loadOverlayPickerTab('history')">历史图片</button>
          </nav>
          <div v-if="overlayPickerLoading" class="picker-state">加载中...</div>
          <div v-else-if="overlayPickerError" class="picker-state is-error">{{ overlayPickerError }}</div>
          <div v-else class="picker-grid">
            <button
              v-for="item in currentPickerItems"
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

      <footer class="panorama-footer">
        <span>{{ ratioOption.width }}×{{ ratioOption.height }}</span>
        <span>FOV: {{ Math.round(fov) }}°</span>
        <span>{{ selectedProjectionLabel }}</span>
        <span>{{ isAutoRotating ? '自动旋转中' : '已暂停旋转' }}</span>
        <span class="hint">鼠标拖拽旋转并停止自动旋转 · 空格暂停/恢复 · 滚轮缩放</span>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.panorama-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: #050505;
  color: #f5f5f5;
  font-size: 13px;
}

.panorama-topbar,
.panorama-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 10px 16px;
  background: rgba(24, 24, 27, 0.94);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
}

.panorama-footer {
  min-height: 34px;
  justify-content: flex-start;
  gap: 18px;
  color: #a1a1aa;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 0;
}

.panorama-title,
.panorama-controls,
.panorama-controls label {
  display: flex;
  align-items: center;
}

.panorama-title {
  gap: 8px;
  font-weight: 700;
  color: #e5e7eb;
  white-space: nowrap;
}

.title-icon {
  color: #a78bfa;
}

.panorama-controls {
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.panorama-controls label {
  gap: 6px;
  color: #a1a1aa;
}

.panorama-controls select,
.panorama-controls button {
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #27272a;
  color: #f4f4f5;
  padding: 0 10px;
  font-size: 12px;
}

.panorama-controls button {
  cursor: pointer;
}

.panorama-controls button:hover:not(:disabled),
.panorama-controls select:hover:not(:disabled) {
  border-color: rgba(167, 139, 250, 0.55);
  background: #303036;
}

.panorama-controls button:disabled,
.panorama-controls select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panorama-controls .primary-action {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.16);
  color: #fde68a;
}

.sr-only-file {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.close-btn {
  width: 32px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.output-size {
  color: #71717a;
  white-space: nowrap;
}

.panorama-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.panorama-viewport:active {
  cursor: grabbing;
}

.panorama-viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.preview-frame {
  position: absolute;
  z-index: 2;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  border: 2px solid rgba(255, 255, 255, 0.72);
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.42);
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
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: auto;
}

.overlay-label-input {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  width: 96px;
  transform: translateX(-50%);
  padding: 3px 8px;
  border: 1px solid rgba(45, 212, 191, 0.8);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  font-size: 12px;
  text-align: center;
  pointer-events: auto;
}

.overlay-resize-handle {
  position: absolute;
  right: -7px;
  bottom: -7px;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid #0f172a;
  border-radius: 50%;
  background: #2dd4bf;
  cursor: nwse-resize;
  pointer-events: auto;
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

.inspector-actions {
  display: grid;
  grid-template-columns: 1fr 52px 52px;
  gap: 6px;
  margin-bottom: 8px;
}

.inspector-actions button {
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #27272a;
  color: #f4f4f5;
}

.inspector-actions button.active {
  border-color: rgba(45, 212, 191, 0.65);
  color: #99f6e4;
}

.inspector-empty,
.picker-state {
  color: #a1a1aa;
  padding: 12px;
  text-align: center;
}

.picker-state.is-error {
  color: #fecaca;
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
  cursor: pointer;
}

.overlay-row[draggable='true'] {
  cursor: grab;
}

.overlay-row.active {
  border-color: rgba(45, 212, 191, 0.65);
}

.overlay-row img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.drag-handle {
  flex: 0 0 auto;
  width: 14px;
  color: #71717a;
  font-size: 13px;
  letter-spacing: 0;
}

.overlay-row span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overlay-row button {
  flex: 0 0 auto;
  min-width: 28px;
  height: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: #27272a;
  color: #f4f4f5;
}

.overlay-editor {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.overlay-order-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
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
  min-height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #27272a;
  color: #f4f4f5;
}

.overlay-editor input:not([type='range']),
.overlay-editor select {
  width: 142px;
  padding: 0 8px;
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

.overlay-picker-panel header button,
.overlay-picker-panel nav button,
.picker-grid button {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #27272a;
  color: #f4f4f5;
}

.overlay-picker-panel nav {
  gap: 8px;
  padding: 10px 14px;
}

.overlay-picker-panel nav button {
  height: 30px;
  padding: 0 10px;
}

.overlay-picker-panel nav button.active {
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
}

.picker-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.04);
}

.picker-grid span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panorama-state {
  position: absolute;
  z-index: 3;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  padding: 12px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(17, 17, 19, 0.88);
  color: #e5e7eb;
}

.panorama-state.is-error {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.45);
}

.hint {
  margin-left: auto;
}

@media (max-width: 900px) {
  .panorama-topbar {
    align-items: flex-start;
    gap: 10px;
  }

  .panorama-controls {
    gap: 6px;
  }

  .output-size {
    display: none;
  }
}
</style>
