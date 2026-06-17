<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  createDirectorMeshForItem,
  createDirectorPanoramaSphere,
  createDirectorSelectionRing,
  disposeDirectorObject3D,
  updateDirectorObjectBoneControls,
  updateDirectorObjectTransform
} from '@/utils/directorStudioMeshFactory.js'
import { ensureDirectorPos3d, pos3dToDirectorLegacy } from '@/utils/directorStudioCoordinates.js'
import {
  normalizeDirectorCamera,
  normalizeDirectorGrid,
  normalizeDirectorLighting,
  normalizeDirectorMode,
  normalizeDirectorViewSettings
} from '@/utils/directorStudioState.js'
import { normalizeDirectorStudioBoneControls } from '@/config/canvas/directorStudioPresetCatalog.js'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedItemId: { type: String, default: null },
  mode: { type: String, default: 'flat' },
  backgroundPanoramaUrl: { type: String, default: null },
  cameraSettings: { type: Object, default: () => ({}) },
  lighting: { type: Object, default: () => ({}) },
  grid: { type: Object, default: () => ({}) },
  viewSettings: { type: Object, default: () => ({}) },
  transformMode: { type: String, default: null },
  aspectFrame: { type: String, default: '16:9' }
})

const emit = defineEmits(['select-item', 'update-item', 'hover-item', 'scene-ready', 'scene-error'])

const rootEl = ref(null)
const canvasHost = ref(null)

const CAMERA_DEFAULTS = {
  yaw: Math.PI * 0.75,
  pitch: Math.PI * 0.24,
  distance: 8,
  targetY: 0.7
}
const SCENE_CLEAR = 0x071012
const GRID_HEIGHT_EPSILON = 0.006
const CAMERA_MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e'])
const BONE_DRAG_DEGREES_PER_PIXEL = 0.45
const LABEL_TEXTURE_WIDTH = 512
const LABEL_TEXTURE_HEIGHT = 128
const LABEL_FONT_SIZE = 44
const LABEL_MAX_CHARS = 30
const LABEL_WORLD_HEIGHT = 0.52
const LABEL_FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

let renderer = null
let scene = null
let camera = null
let itemsGroup = null
let labelGroup = null
let gridGroup = null
let floorMesh = null
let axesHelper = null
let ambientLight = null
let directionalLight = null
let transformControls = null
let transformHelper = null
let selectionRing = null
let panoramaSphere = null
let panoramaTexture = null
let panoramaLoadToken = 0
let resizeObserver = null
let renderFrame = 0
let hoverItemId = null
let mounted = false
let lastCameraFov = null
let lastCameraLensDistance = null

const meshById = new Map()
const labelById = new Map()
const pointerState = {
  active: false,
  pointerId: null,
  mode: 'idle',
  lastX: 0,
  lastY: 0,
  moved: false
}
const boneDragState = {
  active: false,
  itemId: null,
  boneKey: null,
  startX: 0,
  startY: 0,
  startControls: null,
  axisLock: null
}
const cameraState = {
  yaw: CAMERA_DEFAULTS.yaw,
  pitch: CAMERA_DEFAULTS.pitch,
  distance: CAMERA_DEFAULTS.distance,
  target: new THREE.Vector3(0, CAMERA_DEFAULTS.targetY, 0)
}

const aspectStyle = computed(() => ({
  '--director-aspect-ratio': String(getAspectRatioNumber(props.aspectFrame)),
  aspectRatio: getAspectRatioCss(props.aspectFrame)
}))

function getAspectRatioNumber(frame) {
  switch (frame) {
    case '1:1': return 1
    case '4:3': return 4 / 3
    case '3:4': return 3 / 4
    case '9:16': return 9 / 16
    case '3:2': return 3 / 2
    case '2:3': return 2 / 3
    case '21:9': return 21 / 9
    case 'panorama': return 2
    case '16:9':
    default:
      return 16 / 9
  }
}

function getAspectRatioCss(frame) {
  switch (frame) {
    case '1:1': return '1 / 1'
    case '4:3': return '4 / 3'
    case '3:4': return '3 / 4'
    case '9:16': return '9 / 16'
    case '3:2': return '3 / 2'
    case '2:3': return '2 / 3'
    case '21:9': return '21 / 9'
    case 'panorama': return '2 / 1'
    case '16:9':
    default:
      return '16 / 9'
  }
}

function getRendererSize() {
  const host = canvasHost.value
  return {
    width: Math.max(1, Math.round(host?.clientWidth || 720)),
    height: Math.max(1, Math.round(host?.clientHeight || 405))
  }
}

function requestRender() {
  if (renderFrame || !mounted) return
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0
    renderNow()
  })
}

function renderNow() {
  if (!renderer || !scene || !camera) return
  renderer.render(scene, camera)
}

function getItemLabelText(item) {
  const raw = item?.label || item?.title || item?.name || item?.id || ''
  const text = String(raw).trim()
  if (!text) return ''
  if (text.length <= LABEL_MAX_CHARS) return text
  return `${text.slice(0, LABEL_MAX_CHARS - 3)}...`
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function createLabelTexture(text, color) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_TEXTURE_WIDTH
  canvas.height = LABEL_TEXTURE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = `700 ${LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const textWidth = Math.min(context.measureText(text).width, LABEL_TEXTURE_WIDTH - 72)
  const boxWidth = Math.max(168, Math.min(LABEL_TEXTURE_WIDTH - 24, textWidth + 64))
  const boxHeight = 74
  const boxX = (LABEL_TEXTURE_WIDTH - boxWidth) / 2
  const boxY = (LABEL_TEXTURE_HEIGHT - boxHeight) / 2

  drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, 18)
  context.fillStyle = 'rgba(7, 16, 18, 0.82)'
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = color || '#38bdf8'
  context.stroke()

  context.shadowColor = 'rgba(0, 0, 0, 0.72)'
  context.shadowBlur = 8
  context.shadowOffsetY = 2
  context.fillStyle = '#f8fafc'
  context.fillText(text, LABEL_TEXTURE_WIDTH / 2, LABEL_TEXTURE_HEIGHT / 2 + 1, LABEL_TEXTURE_WIDTH - 96)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function disposeLabelSprite(sprite) {
  if (!sprite) return
  sprite.material?.map?.dispose?.()
  sprite.material?.dispose?.()
}

function removeLabelForItem(itemId) {
  const id = itemId != null ? String(itemId) : ''
  const sprite = labelById.get(id)
  if (!sprite) return
  labelGroup?.remove(sprite)
  labelById.delete(id)
  disposeLabelSprite(sprite)
}

function updateLabelTexture(sprite, item, text) {
  const color = typeof item?.color === 'string' && item.color.trim() ? item.color.trim() : '#38bdf8'
  const textureKey = `${text}|${color}`
  if (sprite.userData.textureKey === textureKey) return
  const texture = createLabelTexture(text, color)
  if (!texture) {
    sprite.visible = false
    return
  }
  const previousTexture = sprite.material.map
  sprite.material.map = texture
  sprite.material.needsUpdate = true
  previousTexture?.dispose?.()
  sprite.userData.textureKey = textureKey
  sprite.visible = true
}

function syncLabelPosition(sprite, mesh) {
  if (!sprite || !mesh) return
  const box = new THREE.Box3().setFromObject(mesh)
  if (box.isEmpty()) {
    sprite.visible = false
    return
  }
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  const offset = THREE.MathUtils.clamp(size.y * 0.12, 0.18, 0.5)
  sprite.position.set(center.x, box.max.y + offset, center.z)
  sprite.scale.set(LABEL_WORLD_HEIGHT * (LABEL_TEXTURE_WIDTH / LABEL_TEXTURE_HEIGHT), LABEL_WORLD_HEIGHT, 1)
}

function syncLabelForItem(item, mesh) {
  if (!labelGroup || item?.id == null || !mesh) return
  const id = String(item.id)
  const text = getItemLabelText(item)
  const shouldShowLabel = item?.showLabel !== false && Boolean(text)
  if (!shouldShowLabel) {
    removeLabelForItem(id)
    return
  }

  let sprite = labelById.get(id)
  if (!sprite) {
    sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false
    }))
    sprite.renderOrder = 1200
    sprite.userData.itemId = id
    labelById.set(id, sprite)
    labelGroup.add(sprite)
  } else if (sprite.parent !== labelGroup) {
    labelGroup.add(sprite)
  }

  updateLabelTexture(sprite, item, text)
  syncLabelPosition(sprite, mesh)
}

function applyCamera() {
  if (!camera) return
  cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch, 0.08, Math.PI / 2 - 0.03)
  cameraState.distance = THREE.MathUtils.clamp(cameraState.distance, 1.8, 90)
  const { yaw, pitch, distance, target } = cameraState
  camera.position.set(
    target.x + distance * Math.cos(pitch) * Math.sin(yaw),
    target.y + distance * Math.sin(pitch),
    target.z + distance * Math.cos(pitch) * Math.cos(yaw)
  )
  camera.lookAt(target)
  camera.updateMatrixWorld()
}

function resetCamera() {
  const settings = normalizeDirectorCamera(props.cameraSettings)
  cameraState.yaw = CAMERA_DEFAULTS.yaw
  cameraState.pitch = CAMERA_DEFAULTS.pitch
  cameraState.distance = settings.lensDistance
  cameraState.target.set(0, CAMERA_DEFAULTS.targetY, 0)
  applyCamera()
  requestRender()
}

function fitCamera() {
  const itemList = Array.isArray(props.items) ? props.items.filter(item => item && item.id != null) : []
  if (itemList.length === 0) {
    resetCamera()
    return
  }

  const box = new THREE.Box3()
  itemList.forEach(item => {
    const mesh = meshById.get(String(item.id))
    if (mesh) {
      const meshBox = new THREE.Box3().setFromObject(mesh)
      if (!meshBox.isEmpty()) {
        box.union(meshBox)
        return
      }
    }
    const pos = ensureDirectorPos3d(item)
    box.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z))
  })

  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 2)
  const fov = THREE.MathUtils.degToRad(camera?.fov || 45)
  cameraState.target.copy(center)
  cameraState.target.y = Math.max(center.y, 0.8)
  cameraState.distance = THREE.MathUtils.clamp((maxDim / Math.tan(fov / 2)) * 0.9, 3.2, 60)
  applyCamera()
  requestRender()
}

function focusItem(itemId) {
  const id = itemId != null ? String(itemId) : ''
  const item = props.items.find(entry => String(entry?.id) === id)
  if (!item) return
  const pos = ensureDirectorPos3d(item)
  cameraState.target.set(pos.x, Math.max(pos.y + 0.8, 0.8), pos.z)
  cameraState.distance = Math.max(2.5, Math.min(cameraState.distance, 12))
  applyCamera()
  requestRender()
}

function getSuggestedInsertPosition() {
  if (!camera) return { x: 0, y: normalizeDirectorGrid(props.grid).height, z: 0 }
  const grid = normalizeDirectorGrid(props.grid)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  const target = new THREE.Vector3()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -grid.height)
  if (raycaster.ray.intersectPlane(plane, target)) {
    return { x: target.x, y: target.y, z: target.z }
  }
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  target.copy(cameraState.target).add(forward.multiplyScalar(2))
  target.y = grid.height
  return { x: target.x, y: target.y, z: target.z }
}

function exportPng({ width, height, mimeType = 'image/png' } = {}) {
  if (!renderer || !camera || !scene) return null
  const activeRenderer = renderer
  const activeCamera = camera
  const activeScene = scene
  const currentSize = new THREE.Vector2()
  activeRenderer.getSize(currentSize)
  const currentPixelRatio = activeRenderer.getPixelRatio()
  const currentAspect = activeCamera.aspect
  const targetWidth = Math.max(1, Math.round(width || currentSize.x || 1))
  const targetHeight = Math.max(1, Math.round(height || currentSize.y || 1))

  try {
    activeRenderer.setPixelRatio(1)
    activeRenderer.setSize(targetWidth, targetHeight, false)
    activeCamera.aspect = targetWidth / targetHeight
    activeCamera.updateProjectionMatrix()
    activeRenderer.render(activeScene, activeCamera)
    return activeRenderer.domElement.toDataURL(mimeType)
  } finally {
    activeRenderer.setPixelRatio(currentPixelRatio)
    activeRenderer.setSize(currentSize.x, currentSize.y, false)
    activeCamera.aspect = currentAspect
    activeCamera.updateProjectionMatrix()
    activeRenderer.render(activeScene, activeCamera)
  }
}

defineExpose({
  exportPng,
  resetCamera,
  fitCamera,
  focusItem,
  getSuggestedInsertPosition
})

function createFloorGrid(size = 120, step = 1, majorStep = 5) {
  const group = new THREE.Group()
  const half = size / 2
  const minor = []
  const major = []
  const axisX = []
  const axisZ = []
  const pushLine = (target, x1, z1, x2, z2) => target.push(x1, 0, z1, x2, 0, z2)

  for (let i = -half; i <= half; i += step) {
    const rounded = Math.round(i)
    if (rounded === 0) {
      pushLine(axisX, -half, 0, half, 0)
      pushLine(axisZ, 0, -half, 0, half)
    } else if (Math.abs(rounded % majorStep) === 0) {
      pushLine(major, -half, i, half, i)
      pushLine(major, i, -half, i, half)
    } else {
      pushLine(minor, -half, i, half, i)
      pushLine(minor, i, -half, i, half)
    }
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      color: 0x071012,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -GRID_HEIGHT_EPSILON
  floor.renderOrder = -10
  group.add(floor)

  const addLines = (positions, color, opacity) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    })
    const lines = new THREE.LineSegments(geometry, material)
    lines.frustumCulled = false
    group.add(lines)
  }
  addLines(minor, 0x335058, 0.42)
  addLines(major, 0x70848c, 0.6)
  addLines(axisX, 0xb96a61, 0.85)
  addLines(axisZ, 0x4aa391, 0.85)
  return group
}

function initScene() {
  try {
    const host = canvasHost.value
    if (!host) return
    const size = getRendererSize()
    mounted = true
    scene = new THREE.Scene()
    scene.background = new THREE.Color(SCENE_CLEAR)
    scene.fog = new THREE.FogExp2(SCENE_CLEAR, 0.01)

    const cameraSettings = normalizeDirectorCamera(props.cameraSettings)
    camera = new THREE.PerspectiveCamera(cameraSettings.fov, size.width / size.height, 0.1, 500)
    cameraState.distance = cameraSettings.lensDistance
    lastCameraFov = cameraSettings.fov
    lastCameraLensDistance = cameraSettings.lensDistance

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.04
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(SCENE_CLEAR, 1)
    renderer.setSize(size.width, size.height, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    ambientLight = new THREE.AmbientLight(0xffffff, 0.55)
    directionalLight = new THREE.DirectionalLight(0xffffff, 0.65)
    scene.add(ambientLight)
    scene.add(directionalLight)

    gridGroup = createFloorGrid()
    scene.add(gridGroup)
    floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshBasicMaterial({ color: 0x071012, transparent: true, opacity: 0.001, side: THREE.DoubleSide })
    )
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.name = '__directorFloorRaycast'
    scene.add(floorMesh)

    axesHelper = new THREE.AxesHelper(2)
    axesHelper.position.y = 0.02
    scene.add(axesHelper)

    selectionRing = createDirectorSelectionRing({ id: '__selection', color: '#fbbf24' })
    selectionRing.visible = false
    scene.add(selectionRing)

    panoramaSphere = createDirectorPanoramaSphere(null)
    panoramaSphere.visible = false
    scene.add(panoramaSphere)

    itemsGroup = new THREE.Group()
    itemsGroup.name = '__directorItems'
    scene.add(itemsGroup)

    labelGroup = new THREE.Group()
    labelGroup.name = '__directorLabels'
    scene.add(labelGroup)

    transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.enabled = false
    transformControls.setSize(0.85)
    transformHelper = transformControls.getHelper()
    transformHelper.visible = false
    scene.add(transformHelper)
    bindTransformControls()

    applyCamera()
    syncLighting()
    syncGrid()
    syncPanorama()
    syncMeshes()
    syncSelection()
    syncTransformControls()
    syncSize()
    renderNow()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncSize)
      resizeObserver.observe(host)
    }
    window.addEventListener('resize', syncSize)
    emit('scene-ready')
  } catch (error) {
    cleanupSceneResources()
    handleSceneError(error)
  }
}

function bindTransformControls() {
  if (!transformControls) return
  transformControls.addEventListener('change', requestRender)
  transformControls.addEventListener('objectChange', () => {
    if (props.selectedItemId) emitPatchFromObject(String(props.selectedItemId))
    requestRender()
  })
  transformControls.addEventListener('dragging-changed', event => {
    pointerState.mode = event.value ? 'transform' : 'idle'
    if (!event.value && props.selectedItemId) emitPatchFromObject(String(props.selectedItemId))
    requestRender()
  })
}

function syncSize() {
  if (!renderer || !camera) return
  const size = getRendererSize()
  renderer.setSize(size.width, size.height, false)
  camera.aspect = size.width / size.height
  camera.updateProjectionMatrix()
  applyCamera()
  requestRender()
}

function syncCameraSettings() {
  if (!camera) return
  const settings = normalizeDirectorCamera(props.cameraSettings)
  const fovChanged = lastCameraFov == null || Math.abs(settings.fov - lastCameraFov) > 0.001
  const lensChanged = lastCameraLensDistance == null || Math.abs(settings.lensDistance - lastCameraLensDistance) > 0.001
  if (fovChanged) {
    camera.fov = settings.fov
    camera.updateProjectionMatrix()
    lastCameraFov = settings.fov
  }
  if (lensChanged) {
    cameraState.distance = THREE.MathUtils.clamp(settings.lensDistance, 1.8, 90)
    lastCameraLensDistance = settings.lensDistance
  }
  applyCamera()
  requestRender()
}

function syncLighting() {
  if (!ambientLight || !directionalLight) return
  const lighting = normalizeDirectorLighting(props.lighting)
  ambientLight.intensity = lighting.enabled ? lighting.ambientIntensity : 0
  ambientLight.color.set(lighting.ambientColor)
  directionalLight.intensity = lighting.enabled ? lighting.mainIntensity : 0
  directionalLight.color.set(lighting.mainColor)
  const yaw = THREE.MathUtils.degToRad(lighting.mainYaw)
  const pitch = THREE.MathUtils.degToRad(lighting.mainPitch)
  const distance = 12
  directionalLight.position.set(
    distance * Math.cos(pitch) * Math.sin(yaw),
    Math.max(0.5, distance * Math.sin(pitch)),
    distance * Math.cos(pitch) * Math.cos(yaw)
  )
  requestRender()
}

function syncGrid() {
  const grid = normalizeDirectorGrid(props.grid)
  if (gridGroup) {
    gridGroup.visible = grid.visible
    gridGroup.position.y = grid.height
  }
  if (floorMesh) {
    floorMesh.position.y = grid.height
    floorMesh.visible = grid.visible
  }
  if (axesHelper) {
    axesHelper.visible = grid.visible
    axesHelper.position.y = grid.height + 0.02
  }
  if (selectionRing) selectionRing.position.y = grid.height + 0.02
  requestRender()
}

function disposePanoramaTexture() {
  const texture = panoramaTexture
  if (panoramaSphere?.material?.map === texture) {
    panoramaSphere.material.map = null
    panoramaSphere.material.needsUpdate = true
  }
  panoramaTexture = null
  texture?.dispose()
}

function syncPanorama() {
  if (!panoramaSphere) return
  const loadToken = ++panoramaLoadToken
  const mode = normalizeDirectorMode(props.mode)
  panoramaSphere.visible = mode === 'panorama'
  disposePanoramaTexture()

  const url = typeof props.backgroundPanoramaUrl === 'string' ? props.backgroundPanoramaUrl.trim() : ''
  if (mode !== 'panorama' || !url) {
    requestRender()
    return
  }

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  loader.load(
    url,
    texture => {
      if (!panoramaSphere || loadToken !== panoramaLoadToken) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      panoramaTexture = texture
      panoramaSphere.material.map = texture
      panoramaSphere.material.needsUpdate = true
      panoramaSphere.visible = normalizeDirectorMode(props.mode) === 'panorama'
      requestRender()
    },
    undefined,
    error => {
      if (loadToken !== panoramaLoadToken) return
      handleSceneError(error || new Error('全景图加载失败'))
      if (panoramaSphere) panoramaSphere.visible = normalizeDirectorMode(props.mode) === 'panorama'
      requestRender()
    }
  )
}

function meshCacheKey(item) {
  return [
    item?.category || '',
    item?.presetId || '',
    item?.visualId || '',
    item?.action || '',
    item?.color || '',
    JSON.stringify(item?.bodyControls || {})
  ].join('|')
}

function syncMeshes() {
  if (!itemsGroup) return
  const items = Array.isArray(props.items) ? props.items.filter(item => item && item.id != null) : []
  const ids = new Set(items.map(item => String(item.id)))

  for (const [id, mesh] of Array.from(meshById.entries())) {
    if (!ids.has(id)) {
      itemsGroup.remove(mesh)
      meshById.delete(id)
      removeLabelForItem(id)
      disposeDirectorObject3D(mesh)
    }
  }

  items.forEach(item => {
    const id = String(item.id)
    const key = meshCacheKey(item)
    let mesh = meshById.get(id)
    if (mesh && mesh.userData.cacheKey !== key) {
      itemsGroup.remove(mesh)
      meshById.delete(id)
      disposeDirectorObject3D(mesh)
      mesh = null
    }
    if (!mesh) {
      mesh = createDirectorMeshForItem(item)
      mesh.userData.cacheKey = key
      itemsGroup.add(mesh)
      meshById.set(id, mesh)
    } else {
      updateDirectorObjectTransform(mesh, item)
      updateDirectorObjectBoneControls(mesh, item?.boneControls)
      if (mesh.parent !== itemsGroup) itemsGroup.add(mesh)
    }
    syncLabelForItem(item, mesh)
  })

  syncSelection()
  syncTransformControls()
  requestRender()
}

function syncSelection() {
  if (!selectionRing) return
  const item = props.items.find(entry => String(entry?.id) === String(props.selectedItemId))
  if (!item) {
    selectionRing.visible = false
    requestRender()
    return
  }
  const pos = ensureDirectorPos3d(item)
  const scale = item?.scale3d && typeof item.scale3d === 'object'
    ? Math.max(Number(item.scale3d.x) || 1, Number(item.scale3d.z) || 1)
    : 1
  selectionRing.position.x = pos.x
  selectionRing.position.z = pos.z
  selectionRing.scale.setScalar(THREE.MathUtils.clamp(scale, 0.75, 3))
  selectionRing.visible = true
  requestRender()
}

function toThreeTransformMode(mode) {
  if (mode === 'move') return 'translate'
  if (mode === 'rotate') return 'rotate'
  if (mode === 'scale') return 'scale'
  return null
}

function syncTransformControls() {
  if (!transformControls || !transformHelper) return
  if (pointerState.mode === 'bone') {
    transformControls.detach()
    transformControls.enabled = false
    transformHelper.visible = false
    requestRender()
    return
  }
  const mode = toThreeTransformMode(props.transformMode)
  const selectedId = props.selectedItemId != null ? String(props.selectedItemId) : null
  const mesh = selectedId ? meshById.get(selectedId) : null
  if (!mode || !mesh) {
    transformControls.detach()
    transformControls.enabled = false
    transformHelper.visible = false
    requestRender()
    return
  }
  transformControls.enabled = true
  if (!transformControls.dragging) {
    transformControls.setMode(mode)
    transformControls.setSpace(mode === 'translate' ? 'world' : 'local')
    transformControls.setSize(mode === 'rotate' ? 0.95 : 0.85)
  }
  if (transformControls.object !== mesh) transformControls.attach(mesh)
  transformHelper.visible = true
  requestRender()
}

function emitPatchFromObject(itemId) {
  const mesh = meshById.get(itemId)
  const item = props.items.find(entry => String(entry?.id) === itemId)
  if (!mesh || !item) return
  const pos3d = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
  const legacy = pos3dToDirectorLegacy(pos3d)
  const rotation3d = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z }
  const scale3d = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
  syncLabelForItem(item, mesh)
  emit('update-item', {
    ...item,
    x: legacy.x,
    y: legacy.y,
    pos3d,
    rotation3d,
    scale3d
  })
}

function handleSceneError(error) {
  emit('scene-error', error)
}

function resetBoneDragState() {
  boneDragState.active = false
  boneDragState.itemId = null
  boneDragState.boneKey = null
  boneDragState.startX = 0
  boneDragState.startY = 0
  boneDragState.startControls = null
  boneDragState.axisLock = null
}

function resetPointerState() {
  pointerState.active = false
  pointerState.pointerId = null
  pointerState.mode = 'idle'
  pointerState.lastX = 0
  pointerState.lastY = 0
  pointerState.moved = false
  hoverItemId = null
  resetBoneDragState()
}

function cleanupSceneResources({ forceContextLoss = false } = {}) {
  mounted = false
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame)
    renderFrame = 0
  }
  window.removeEventListener('resize', syncSize)
  resizeObserver?.disconnect()
  resizeObserver = null
  transformControls?.detach()
  transformControls?.dispose()
  transformControls = null
  transformHelper = null
  panoramaLoadToken += 1
  disposePanoramaTexture()
  if (scene) disposeDirectorObject3D(scene)
  meshById.clear()
  labelById.clear()
  if (renderer) {
    renderer.dispose()
    if (forceContextLoss) renderer.forceContextLoss?.()
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
  renderer = null
  scene = null
  camera = null
  itemsGroup = null
  labelGroup = null
  gridGroup = null
  floorMesh = null
  axesHelper = null
  ambientLight = null
  directionalLight = null
  selectionRing = null
  panoramaSphere = null
  resetPointerState()
}

function localPointer(event) {
  const rect = renderer?.domElement.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0, width: 1, height: 1 }
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  }
}

function toNdc(local) {
  return new THREE.Vector2(
    (local.x / local.width) * 2 - 1,
    -((local.y / local.height) * 2 - 1)
  )
}

function raycastItem(local) {
  if (!camera || !itemsGroup) return null
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(toNdc(local), camera)
  const hits = raycaster.intersectObjects(itemsGroup.children, true)
  if (hits.length > 0) {
    let object = hits[0].object
    while (object) {
      if (object.userData?.itemId) return String(object.userData.itemId)
      if (typeof object.name === 'string' && object.name.startsWith('item:')) return object.name.slice(5)
      object = object.parent
    }
  }
  return null
}

function findItemById(itemId) {
  return props.items.find(entry => String(entry?.id) === String(itemId)) || null
}

function resolveHitItemId(object) {
  let current = object
  while (current) {
    if (current.userData?.itemId != null) return String(current.userData.itemId)
    if (typeof current.name === 'string' && current.name.startsWith('item:')) return current.name.slice(5)
    current = current.parent
  }
  return null
}

function resolveHitBoneKey(object) {
  let current = object
  while (current) {
    if (current.userData?.directorStudioBoneHandle && current.userData?.boneKey) {
      return String(current.userData.boneKey)
    }
    if (current.userData?.directorStudioBoneKey) return String(current.userData.directorStudioBoneKey)
    current = current.parent
  }
  return null
}

function raycastBoneHandle(local) {
  if (!camera || !itemsGroup) return null
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(toNdc(local), camera)
  const hits = raycaster.intersectObjects(itemsGroup.children, true)
  for (const hit of hits) {
    const boneKey = resolveHitBoneKey(hit.object)
    const itemId = resolveHitItemId(hit.object)
    if (boneKey && itemId) return { itemId, boneKey, object: hit.object }
  }
  return null
}

function emitBoneControlPatch(itemId, boneKey, nextBoneControls) {
  const item = findItemById(itemId)
  if (!item || !nextBoneControls?.[boneKey]) return
  emit('update-item', {
    ...item,
    boneControls: normalizeDirectorStudioBoneControls(nextBoneControls)
  })
}

function startBoneDrag(event, hit) {
  const item = findItemById(hit?.itemId)
  if (!item || !hit?.boneKey) return false
  pointerState.active = true
  pointerState.pointerId = event.pointerId
  pointerState.lastX = event.clientX
  pointerState.lastY = event.clientY
  pointerState.moved = false
  pointerState.mode = 'bone'
  boneDragState.active = true
  boneDragState.itemId = String(hit.itemId)
  boneDragState.boneKey = String(hit.boneKey)
  boneDragState.startX = event.clientX
  boneDragState.startY = event.clientY
  boneDragState.startControls = normalizeDirectorStudioBoneControls(item.boneControls)
  boneDragState.axisLock = event.shiftKey ? 'zDeg' : null
  emit('select-item', boneDragState.itemId)
  syncTransformControls()
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best effort.
  }
  event.preventDefault()
  return true
}

function updateBoneDrag(event) {
  if (!boneDragState.active || !boneDragState.itemId || !boneDragState.boneKey || !boneDragState.startControls) return
  const boneKey = boneDragState.boneKey
  const startBone = boneDragState.startControls[boneKey]
  if (!startBone) return
  const dx = event.clientX - boneDragState.startX
  const dy = event.clientY - boneDragState.startY
  const nextControls = normalizeDirectorStudioBoneControls({
    ...boneDragState.startControls,
    [boneKey]: boneDragState.axisLock === 'zDeg'
      ? {
          ...startBone,
          zDeg: startBone.zDeg + dx * BONE_DRAG_DEGREES_PER_PIXEL
        }
      : {
          ...startBone,
          xDeg: startBone.xDeg + dy * BONE_DRAG_DEGREES_PER_PIXEL,
          yDeg: startBone.yDeg + dx * BONE_DRAG_DEGREES_PER_PIXEL
        }
  })
  const mesh = meshById.get(boneDragState.itemId)
  updateDirectorObjectBoneControls(mesh, nextControls)
  emitBoneControlPatch(boneDragState.itemId, boneKey, nextControls)
  requestRender()
}

function pointerOverTransform(local, button = 0) {
  if (!transformControls?.enabled || !props.transformMode || !props.selectedItemId) return false
  if (transformControls.dragging) return true
  const ndc = toNdc(local)
  transformControls.pointerHover({ x: ndc.x, y: ndc.y, button })
  return Boolean(transformControls.axis)
}

function handlePointerDown(event) {
  if (!renderer || event.button > 2) return
  rootEl.value?.focus?.()
  const local = localPointer(event)
  const boneHit = event.button === 0 ? raycastBoneHandle(local) : null
  if (boneHit && startBoneDrag(event, boneHit)) return
  if (pointerOverTransform(local, event.button)) {
    pointerState.mode = 'transform'
    return
  }
  pointerState.active = true
  pointerState.pointerId = event.pointerId
  pointerState.lastX = event.clientX
  pointerState.lastY = event.clientY
  pointerState.moved = false
  pointerState.mode = event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'orbit'
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best effort.
  }
}

function handlePointerMove(event) {
  if (!renderer || transformControls?.dragging) return
  const local = localPointer(event)
  if (!pointerState.active) {
    const hovered = raycastItem(local)
    if (hovered !== hoverItemId) {
      hoverItemId = hovered
      emit('hover-item', hovered)
    }
    return
  }

  const dx = event.clientX - pointerState.lastX
  const dy = event.clientY - pointerState.lastY
  if (Math.hypot(dx, dy) > 2) pointerState.moved = true
  pointerState.lastX = event.clientX
  pointerState.lastY = event.clientY

  if (pointerState.mode === 'bone') {
    updateBoneDrag(event)
    return
  }

  if (pointerState.mode === 'orbit') {
    const settings = normalizeDirectorViewSettings(props.viewSettings)
    const verticalDirection = settings.reverseVerticalOrbit ? 1 : -1
    cameraState.yaw -= dx * 0.006
    cameraState.pitch += dy * 0.005 * verticalDirection
  } else if (pointerState.mode === 'pan') {
    const panScale = cameraState.distance * 0.0018
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
    cameraState.target.addScaledVector(right, dx * panScale)
    cameraState.target.addScaledVector(forward, dy * panScale)
  }
  applyCamera()
  requestRender()
}

function handlePointerUp(event) {
  if (!pointerState.active) return
  const wasClick = !pointerState.moved
  const wasBoneDrag = pointerState.mode === 'bone'
  pointerState.active = false
  pointerState.pointerId = null
  pointerState.mode = 'idle'
  resetBoneDragState()
  syncTransformControls()
  try {
    event.currentTarget.releasePointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best effort.
  }
  if (wasClick && !wasBoneDrag) {
    const id = raycastItem(localPointer(event))
    emit('select-item', id)
  }
}

function handleWheel(event) {
  const settings = normalizeDirectorViewSettings(props.viewSettings)
  if (!settings.wheelZoomEnabled || !camera) return
  event.preventDefault()
  const direction = settings.reverseWheelZoom ? -1 : 1
  const factor = Math.exp(event.deltaY * direction * 0.0012)
  cameraState.distance = THREE.MathUtils.clamp(cameraState.distance * factor, 1.8, 90)
  applyCamera()
  requestRender()
}

function isEditableTarget(target) {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.matches('input, textarea, select')
}

function isSceneFocused() {
  const root = rootEl.value
  if (!root || typeof document === 'undefined') return false
  return root === document.activeElement || root.contains(document.activeElement)
}

function handleKeydown(event) {
  if (!isSceneFocused() || isEditableTarget(event.target)) return
  const key = event.key.toLowerCase()
  if (key === 'f') {
    if (props.selectedItemId) focusItem(props.selectedItemId)
    event.preventDefault()
    return
  }
  if (key === 'z') {
    fitCamera()
    event.preventDefault()
    return
  }
  if (key === 'r') {
    resetCamera()
    event.preventDefault()
    return
  }

  if (!CAMERA_MOVE_KEYS.has(key) || !camera) return
  const step = event.shiftKey ? 0.85 : 0.28
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  forward.y = 0
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
  if (key === 'w') cameraState.target.addScaledVector(forward, step)
  if (key === 's') cameraState.target.addScaledVector(forward, -step)
  if (key === 'a') cameraState.target.addScaledVector(right, -step)
  if (key === 'd') cameraState.target.addScaledVector(right, step)
  if (key === 'q') cameraState.target.y -= step
  if (key === 'e') cameraState.target.y += step
  applyCamera()
  requestRender()
  event.preventDefault()
}

watch(() => props.items, syncMeshes, { deep: true })
watch(() => props.selectedItemId, () => {
  syncSelection()
  syncTransformControls()
})
watch(() => props.transformMode, syncTransformControls)
watch(() => props.cameraSettings, syncCameraSettings, { deep: true })
watch(() => props.lighting, syncLighting, { deep: true })
watch(() => props.grid, syncGrid, { deep: true })
watch(() => [props.mode, props.backgroundPanoramaUrl], syncPanorama)
watch(() => props.aspectFrame, () => {
  nextTick(() => syncSize())
})

onMounted(async () => {
  await nextTick()
  initScene()
})

onBeforeUnmount(() => cleanupSceneResources({ forceContextLoss: true }))
</script>

<template>
  <div
    ref="rootEl"
    class="director-studio-scene nodrag nopan nowheel"
    :style="aspectStyle"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <div
      class="director-aspect-frame"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @wheel="handleWheel"
      @contextmenu.prevent
    >
      <div ref="canvasHost" class="director-studio-scene-canvas" />
    </div>
  </div>
</template>

<style scoped>
.director-studio-scene {
  position: relative;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: #071012;
  outline: none;
  user-select: none;
  touch-action: none;
}

.director-studio-scene:focus-visible {
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.58);
}

.director-aspect-frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid rgba(125, 211, 252, 0.58);
  background: #071012;
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.28),
    0 18px 50px rgba(0, 0, 0, 0.24);
}

.director-studio-scene-canvas {
  position: absolute;
  inset: 0;
}
</style>
