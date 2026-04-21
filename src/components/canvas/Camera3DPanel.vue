<script setup>
/**
 * Camera3DPanel.vue - 多角度编辑器
 * 用于图像节点工具栏的角度切换功能
 * 基于 Three.js 实现交互式相机控制
 * 输出格式: <sks> {azimuth} {elevation} {distance}
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as THREE from 'three'
import { getTenantHeaders, getApiUrl } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'

const props = defineProps({
  imageUrl: {
    type: String,
    default: ''
  },
  initialAngles: {
    type: Object,
    default: () => ({ horizontal: 0, vertical: 0, zoom: 5 })
  },
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  pointsCost: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close', 'update', 'apply', 'generate-start', 'generate-success', 'generate-error'])

const teamStore = useTeamStore()
const generating = ref(false)
const generateProgress = ref('')
const generateError = ref('')
const containerRef = ref(null)
const panelRef = ref(null)

let scene = null
let camera = null
let renderer = null
let imagePlane = null
let cameraIndicator = null
let animationFrameId = null
let connectionLine = null
let wireframeSphere = null

// 动画状态
const animState = {
  active: false,
  startTime: 0,
  duration: 600,
  startH: 0, startV: 0, startZ: 0,
  targetH: 0, targetV: 0, targetZ: 0
}
// 观察者相机目标位置（平滑跟随）
let observerTarget = { x: 10, y: 8, z: 10 }

const horizontalAngle = ref(props.initialAngles.horizontal || 0)
const verticalAngle = ref(props.initialAngles.vertical || 0)
const zoomLevel = ref(props.initialAngles.zoom || 5)

// 预设 & 提示词状态
const activePreset = ref('custom')
const showCustomPrompt = ref(false)
const customPromptText = ref('')

// 场景预设定义（参数来自设计稿）
const scenePresets = [
  { id: 'custom', label: '自定义', azimuth: 0, elevation: 0, zoom: 5, prompt: '' },
  { id: 'fisheye', label: '鱼眼视角', azimuth: 0, elevation: 30, zoom: 9, prompt: '极度特写镜头，广角镜头，边缘带有鱼眼畸变效果' },
  { id: 'dutch', label: '倾斜视角', azimuth: 45, elevation: -30, zoom: 5, prompt: 'dutch angle，tilted frame' },
  { id: 'frontTop', label: '正面俯拍', azimuth: 0, elevation: 60, zoom: 5, prompt: '' },
  { id: 'frontLow', label: '正面仰拍', azimuth: 0, elevation: -30, zoom: 5, prompt: '' },
  { id: 'panoramaTop', label: '全景俯拍', azimuth: 45, elevation: 30, zoom: 1, prompt: '' },
  { id: 'rear', label: '背面视角', azimuth: 180, elevation: 0, zoom: 5, prompt: '' }
]

// 方位角映射表
const AZIMUTH_MAP = [
  { min: 337.5, max: 360, label: 'front view' },
  { min: 0, max: 22.5, label: 'front view' },
  { min: 22.5, max: 67.5, label: 'front-left quarter view' },
  { min: 67.5, max: 112.5, label: 'left side view' },
  { min: 112.5, max: 157.5, label: 'back-left quarter view' },
  { min: 157.5, max: 202.5, label: 'back view' },
  { min: 202.5, max: 247.5, label: 'back-right quarter view' },
  { min: 247.5, max: 292.5, label: 'right side view' },
  { min: 292.5, max: 337.5, label: 'front-right quarter view' }
]

const ELEVATION_MAP = [
  { min: -30, max: -15, label: 'low-angle shot' },
  { min: -15, max: 15, label: 'eye-level shot' },
  { min: 15, max: 45, label: 'elevated shot' },
  { min: 45, max: 61, label: 'high-angle shot' }
]

// 距离映射（反转：高 zoomLevel = 近/特写，低 zoomLevel = 远/全景）
const DISTANCE_MAP = [
  { min: 0, max: 3.33, label: 'wide shot' },
  { min: 3.33, max: 6.66, label: 'medium shot' },
  { min: 6.66, max: 11, label: 'close-up' }
]

function getAzimuthLabel(angle) {
  const normalized = ((angle % 360) + 360) % 360
  for (const mapping of AZIMUTH_MAP) {
    if (normalized >= mapping.min && normalized < mapping.max) {
      return mapping.label
    }
  }
  return 'front view'
}

function getElevationLabel(angle) {
  for (const mapping of ELEVATION_MAP) {
    if (angle >= mapping.min && angle < mapping.max) {
      return mapping.label
    }
  }
  return 'eye-level shot'
}

function getDistanceLabel(zoom) {
  for (const mapping of DISTANCE_MAP) {
    if (zoom >= mapping.min && zoom < mapping.max) {
      return mapping.label
    }
  }
  return 'medium shot'
}

// 输出提示词（隐藏的角度词 + 自定义提示词）
const outputPrompt = computed(() => {
  const azimuth = getAzimuthLabel(horizontalAngle.value)
  const elevation = getElevationLabel(verticalAngle.value)
  const distance = getDistanceLabel(zoomLevel.value)
  const coords = `(horizontal: ${horizontalAngle.value}, vertical: ${verticalAngle.value}, zoom: ${zoomLevel.value})`
  let prompt = `<sks> ${azimuth} ${elevation} ${distance} ${coords}`
  const extra = showCustomPrompt.value ? customPromptText.value.trim() : ''
  if (extra) {
    prompt += `, ${extra}`
  }
  return prompt
})

const angleDescription = computed(() => {
  const azimuthMap = {
    'front view': '正面', 'front-right quarter view': '右前方',
    'right side view': '右侧', 'back-right quarter view': '右后方',
    'back view': '背面', 'back-left quarter view': '左后方',
    'left side view': '左侧', 'front-left quarter view': '左前方'
  }
  const elevationMap = {
    'low-angle shot': '仰拍', 'eye-level shot': '平视',
    'elevated shot': '俯拍', 'high-angle shot': '高角度'
  }
  const distanceMap = {
    'close-up': '特写', 'medium shot': '中景', 'wide shot': '全景'
  }
  const a = azimuthMap[getAzimuthLabel(horizontalAngle.value)] || '正面'
  const e = elevationMap[getElevationLabel(verticalAngle.value)] || '平视'
  const d = distanceMap[getDistanceLabel(zoomLevel.value)] || '中景'
  return `${a} · ${e} · ${d}`
})

const zoomLabel = computed(() => {
  if (zoomLevel.value < 3.33) return '全景'
  if (zoomLevel.value < 6.66) return '中景'
  return '特写'
})

// 滑块填充百分比
const hFill = computed(() => (horizontalAngle.value / 359) * 100)
const vFill = computed(() => ((verticalAngle.value + 30) / 90) * 100)
const zFill = computed(() => (zoomLevel.value / 10) * 100)

// Three.js 初始化
function initThreeJS() {
  if (!containerRef.value) return
  const width = containerRef.value.clientWidth || 380
  const height = containerRef.value.clientHeight || 300

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1e)

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  containerRef.value.appendChild(renderer.domElement)

  // 线框球体
  const sphereGeo = new THREE.SphereGeometry(5, 20, 14)
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0x555555, wireframe: true, transparent: true, opacity: 0.12
  })
  wireframeSphere = new THREE.Mesh(sphereGeo, sphereMat)
  wireframeSphere.position.set(0, 2, 0)
  scene.add(wireframeSphere)

  // 初始化观察者相机目标
  updateObserverTarget()
  camera.position.set(observerTarget.x, observerTarget.y, observerTarget.z)
  camera.lookAt(0, 2, 0)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 5)
  scene.add(directionalLight)

  if (props.imageUrl) {
    loadImagePlane(props.imageUrl)
  } else {
    createPlaceholderPlane()
  }

  createCameraIndicator()
  animate()
  addMouseInteraction()
}

function createPlaceholderPlane() {
  const geometry = new THREE.PlaneGeometry(3, 4)
  const material = new THREE.MeshBasicMaterial({ color: 0x333340, side: THREE.DoubleSide })
  imagePlane = new THREE.Mesh(geometry, material)
  imagePlane.position.set(0, 2, 0)
  imagePlane.rotation.y = Math.PI / 2
  scene.add(imagePlane)
  const edges = new THREE.EdgesGeometry(geometry)
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x666666 })
  const wireframe = new THREE.LineSegments(edges, lineMaterial)
  imagePlane.add(wireframe)
}

function loadImagePlane(imageUrl) {
  const loader = new THREE.TextureLoader()
  loader.crossOrigin = 'anonymous'
  loader.load(imageUrl, (texture) => {
    if (imagePlane) scene.remove(imagePlane)
    const aspect = texture.image.width / texture.image.height
    const h = 4
    const w = h * aspect
    const geometry = new THREE.PlaneGeometry(Math.min(w, 5), h)
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    imagePlane = new THREE.Mesh(geometry, material)
    imagePlane.position.set(0, h / 2, 0)
    imagePlane.rotation.y = Math.PI / 2
    scene.add(imagePlane)
  }, undefined, () => {
    console.warn('[Camera3D] 图片加载失败，使用占位符')
    createPlaceholderPlane()
  })
}

function createCameraIndicator() {
  const cameraGroup = new THREE.Group()
  const coneGeometry = new THREE.ConeGeometry(0.3, 0.6, 8)
  const coneMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
  const cone = new THREE.Mesh(coneGeometry, coneMaterial)
  cone.rotation.x = Math.PI / 2
  cameraGroup.add(cone)
  const ringGeometry = new THREE.RingGeometry(0.4, 0.5, 16)
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x60a5fa, side: THREE.DoubleSide, transparent: true, opacity: 0.6
  })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  cameraGroup.add(ring)
  cameraIndicator = cameraGroup
  scene.add(cameraIndicator)

  const lineGeometry = new THREE.BufferGeometry()
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 })
  connectionLine = new THREE.Line(lineGeometry, lineMaterial)
  scene.add(connectionLine)
  updateCameraIndicator()
}

function updateCameraIndicator() {
  if (!cameraIndicator) return
  const phi = THREE.MathUtils.degToRad(90 - verticalAngle.value)
  const theta = THREE.MathUtils.degToRad(horizontalAngle.value)
  // 指示器保持在固定轨道半径上（仅表示方位和仰角）
  const orbitRadius = 6

  const x = orbitRadius * Math.sin(phi) * Math.cos(theta)
  const y = orbitRadius * Math.cos(phi) + 2
  const z = orbitRadius * Math.sin(phi) * Math.sin(theta)

  cameraIndicator.position.set(x, y, z)
  cameraIndicator.lookAt(0, 2, 0)

  if (connectionLine) {
    const positions = new Float32Array([x, y, z, 0, 2, 0])
    connectionLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  }

  // 景别缩放：缩放图片平面模拟镜头拉近/拉远
  if (imagePlane) {
    const scale = 0.5 + zoomLevel.value * 0.1
    imagePlane.scale.set(scale, scale, 1)
  }
}

// 最短角度差（处理 350°→10° 这类跨 0° 情况）
function shortestAngleDist(from, to) {
  return ((to - from + 540) % 360) - 180
}

// 启动动画过渡
function animateTo(targetH, targetV, targetZ, duration = 600) {
  animState.startTime = performance.now()
  animState.duration = duration
  animState.startH = horizontalAngle.value
  animState.startV = verticalAngle.value
  animState.startZ = zoomLevel.value
  animState.targetH = targetH
  animState.targetV = targetV
  animState.targetZ = targetZ
  animState.active = true
}

// 观察者相机固定在稳定的 3/4 俯视位置，不随水平角度旋转
// 这样蓝色指示器才能在视野中真正环绕图片运动
function updateObserverTarget() {
  observerTarget.x = 10
  observerTarget.z = 10
  observerTarget.y = 8 + verticalAngle.value * 0.03
}

// 鼠标交互
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let startHorizontal = 0
let startVertical = 0

function addMouseInteraction() {
  const canvas = renderer.domElement
  const handleMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    startHorizontal = horizontalAngle.value
    startVertical = verticalAngle.value
    canvas.style.cursor = 'grabbing'
  }
  const handleMouseMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    const deltaX = e.clientX - dragStartX
    const deltaY = e.clientY - dragStartY
    let newH = startHorizontal - deltaX * 0.5
    newH = ((newH % 360) + 360) % 360
    horizontalAngle.value = Math.round(newH)
    let newV = startVertical - deltaY * 0.3
    verticalAngle.value = Math.round(Math.max(-30, Math.min(60, newV)))
    updateCameraIndicator()
    emitUpdate()
  }
  const handleMouseUp = () => {
    isDragging = false
    if (canvas) canvas.style.cursor = 'grab'
  }
  const handleWheel = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -0.5 : 0.5
    zoomLevel.value = Math.round(Math.max(0, Math.min(10, zoomLevel.value + delta)) * 10) / 10
    updateCameraIndicator()
    emitUpdate()
  }
  canvas.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('wheel', handleWheel, { passive: false })
  canvas.style.cursor = 'grab'
  const cleanup = () => {
    canvas.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    canvas.removeEventListener('wheel', handleWheel)
  }
  if (containerRef.value) containerRef.value._cleanup = cleanup
}

function animate() {
  animationFrameId = requestAnimationFrame(animate)

  // 缓动动画：预设/箭头/重置切换时平滑过渡
  if (animState.active) {
    const elapsed = performance.now() - animState.startTime
    const t = Math.min(elapsed / animState.duration, 1)
    const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic

    const hDiff = shortestAngleDist(animState.startH, animState.targetH)
    const newH = animState.startH + hDiff * eased
    horizontalAngle.value = Math.round(((newH % 360) + 360) % 360)
    verticalAngle.value = Math.round(animState.startV + (animState.targetV - animState.startV) * eased)
    zoomLevel.value = Math.round((animState.startZ + (animState.targetZ - animState.startZ) * eased) * 10) / 10

    if (t >= 1) {
      animState.active = false
      horizontalAngle.value = Math.round(((animState.targetH % 360) + 360) % 360)
      verticalAngle.value = animState.targetV
      zoomLevel.value = animState.targetZ
    }
  }

  // 线框球体缓慢旋转（呼吸感）
  if (wireframeSphere) {
    wireframeSphere.rotation.y += 0.0015
  }

  // 观察者相机平滑跟随
  if (camera) {
    updateObserverTarget()
    camera.position.x += (observerTarget.x - camera.position.x) * 0.04
    camera.position.y += (observerTarget.y - camera.position.y) * 0.04
    camera.position.z += (observerTarget.z - camera.position.z) * 0.04
    camera.lookAt(0, 2, 0)
  }

  if (renderer && scene && camera) renderer.render(scene, camera)
}

function emitUpdate() {
  emit('update', {
    horizontal: horizontalAngle.value,
    vertical: verticalAngle.value,
    zoom: zoomLevel.value,
    prompt: outputPrompt.value
  })
}

// 应用预设（带动画过渡）
function applyPreset(preset) {
  activePreset.value = preset.id
  if (preset.id === 'custom') return
  animateTo(preset.azimuth, preset.elevation, preset.zoom, 600)
  if (preset.prompt) {
    showCustomPrompt.value = true
    customPromptText.value = preset.prompt
  } else {
    showCustomPrompt.value = false
    customPromptText.value = ''
  }
}

// 重置参数（带动画过渡）
function resetParams() {
  activePreset.value = 'custom'
  animateTo(0, 0, 5, 400)
  showCustomPrompt.value = false
  customPromptText.value = ''
}

// 导航箭头调整角度（带短动画）
function adjustAngle(axis, delta) {
  if (axis === 'horizontal') {
    const target = ((horizontalAngle.value + delta) % 360 + 360) % 360
    animateTo(target, verticalAngle.value, zoomLevel.value, 300)
  } else {
    const target = Math.max(-30, Math.min(60, verticalAngle.value + delta))
    animateTo(horizontalAngle.value, target, zoomLevel.value, 300)
  }
}

function handleApply() {
  emit('apply', {
    horizontal: horizontalAngle.value,
    vertical: verticalAngle.value,
    zoom: zoomLevel.value,
    prompt: outputPrompt.value
  })
}

async function uploadImageToQiniu(imageUrl) {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('请先登录')

  let blob
  if (imageUrl.startsWith('blob:')) {
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error('无法读取图片')
    blob = await response.blob()
  } else if (imageUrl.startsWith('data:')) {
    const base64Match = imageUrl.match(/^data:(.+?);base64,(.+)$/)
    if (!base64Match) throw new Error('无效的图片格式')
    const binaryData = atob(base64Match[2])
    const uint8Array = new Uint8Array(binaryData.length)
    for (let i = 0; i < binaryData.length; i++) uint8Array[i] = binaryData.charCodeAt(i)
    blob = new Blob([uint8Array], { type: base64Match[1] })
  } else {
    throw new Error('不支持的图片URL格式')
  }

  const formData = new FormData()
  formData.append('image', blob, 'camera3d-source.jpg')
  const uploadResponse = await fetch(getApiUrl('/api/canvas/upload-temp-image'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, ...getTenantHeaders() },
    body: formData
  })
  if (!uploadResponse.ok) {
    const errorData = await uploadResponse.json()
    throw new Error(errorData.message || '图片上传失败')
  }
  const uploadResult = await uploadResponse.json()
  if (!uploadResult.url) throw new Error('未获取到图片URL')
  return uploadResult.url
}

async function handleGenerate() {
  if (generating.value) return
  if (!props.imageUrl) {
    generateError.value = '请先选择一张图片'
    return
  }

  generating.value = true
  generateProgress.value = '准备中...'
  generateError.value = ''

  try {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('请先登录')

    let finalImageUrl = props.imageUrl
    if (props.imageUrl.startsWith('blob:') || props.imageUrl.startsWith('data:')) {
      generateProgress.value = '上传图片到云端...'
      try {
        finalImageUrl = await uploadImageToQiniu(props.imageUrl)
      } catch (uploadError) {
        throw new Error(`图片上传失败: ${uploadError.message}`)
      }
    }

    generateProgress.value = '提交任务中...'
    const spaceParams = teamStore.getSpaceParams('current')
    const response = await fetch(getApiUrl('/api/images/multiangle'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...getTenantHeaders()
      },
      body: JSON.stringify({
        imageUrl: finalImageUrl,
        prompt: outputPrompt.value,
        spaceType: spaceParams.spaceType,
        ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || '生成失败')
    }

    const result = await response.json()
    const taskId = result.taskId
    if (!taskId) throw new Error('未获取到任务ID')

    emit('generate-start', {
      taskId,
      prompt: outputPrompt.value,
      pointsCost: props.pointsCost,
      angles: {
        horizontal: horizontalAngle.value,
        vertical: verticalAngle.value,
        zoom: zoomLevel.value
      }
    })

    generating.value = false
    handleClose()
  } catch (error) {
    console.error('[Camera3D] 生成失败:', error)
    generateError.value = error.message || '生成失败'
    generating.value = false
    emit('generate-error', { error: error.message })
  }
}

function handleClose() {
  emit('close')
}

function handleClickOutside(e) {
  if (panelRef.value && !panelRef.value.contains(e.target)) {
    handleClose()
  }
}

watch(() => props.imageUrl, (newUrl) => {
  if (newUrl && scene) loadImagePlane(newUrl)
})

watch([horizontalAngle, verticalAngle, zoomLevel], () => {
  updateCameraIndicator()
  emitUpdate()
})

onMounted(() => {
  nextTick(() => { initThreeJS() })
  setTimeout(() => { document.addEventListener('mousedown', handleClickOutside) }, 100)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (containerRef.value?._cleanup) containerRef.value._cleanup()
  if (renderer) renderer.dispose()
  wireframeSphere = null
})
</script>

<template>
  <div class="camera-3d-overlay">
    <div ref="panelRef" class="camera-3d-panel" @click.stop @mousedown.stop>
      <!-- 标题栏 -->
      <div class="panel-header">
        <span class="panel-title">多角度编辑器</span>
        <button class="panel-close" @click="handleClose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- 预设标签 -->
      <div class="preset-tabs">
        <button
          v-for="p in scenePresets"
          :key="p.id"
          class="preset-tab"
          :class="{ active: activePreset === p.id }"
          @click="applyPreset(p)"
        >{{ p.label }}</button>
      </div>

      <!-- 主体：双栏 -->
      <div class="panel-body">
        <!-- 左：3D 视口 -->
        <div class="viewport-section">
          <button class="nav-arrow nav-up" @click="adjustAngle('vertical', 10)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="viewport-row">
            <button class="nav-arrow nav-left" @click="adjustAngle('horizontal', -15)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="viewport-container" ref="containerRef"></div>
            <button class="nav-arrow nav-right" @click="adjustAngle('horizontal', 15)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <button class="nav-arrow nav-down" @click="adjustAngle('vertical', -10)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>

        <!-- 右：控制面板 -->
        <div class="controls-section">
          <!-- 水平环绕 -->
          <div class="control-group">
            <div class="control-label">
              <span>水平环绕</span>
              <span class="control-value">{{ horizontalAngle }}°</span>
            </div>
            <input
              type="range" v-model.number="horizontalAngle"
              min="0" max="359" step="1" class="control-slider"
              :style="{ background: `linear-gradient(to right, #3b82f6 ${hFill}%, #333 ${hFill}%)` }"
            />
          </div>

          <!-- 垂直俯仰 -->
          <div class="control-group">
            <div class="control-label">
              <span>垂直俯仰</span>
              <span class="control-value">{{ verticalAngle }}°</span>
            </div>
            <input
              type="range" v-model.number="verticalAngle"
              min="-30" max="60" step="1" class="control-slider"
              :style="{ background: `linear-gradient(to right, #3b82f6 ${vFill}%, #333 ${vFill}%)` }"
            />
          </div>

          <!-- 景别缩放 -->
          <div class="control-group">
            <div class="control-label">
              <span>景别缩放</span>
              <span class="control-value zoom-text">{{ zoomLabel }}</span>
            </div>
            <input
              type="range" v-model.number="zoomLevel"
              min="0" max="10" step="0.5" class="control-slider"
              :style="{ background: `linear-gradient(to right, #3b82f6 ${zFill}%, #333 ${zFill}%)` }"
            />
          </div>

          <!-- 提示词 -->
          <div class="prompt-section">
            <div class="prompt-toggle-row">
              <span class="prompt-label">提示词</span>
              <label class="toggle-switch">
                <input type="checkbox" v-model="showCustomPrompt" />
                <span class="toggle-slider-ui"></span>
              </label>
            </div>
            <textarea
              v-if="showCustomPrompt"
              v-model="customPromptText"
              class="prompt-textarea"
              placeholder="输入自定义提示词，将拼接在角度描述后..."
              rows="3"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- 生成状态 -->
      <div v-if="generating || generateError" class="generate-status">
        <div v-if="generating" class="status-progress">
          <svg class="spinner" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" />
          </svg>
          <span>{{ generateProgress }}</span>
        </div>
        <div v-if="generateError" class="status-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{{ generateError }}</span>
        </div>
      </div>

      <!-- 底部 -->
      <div class="panel-footer">
        <button class="reset-btn" @click="resetParams">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M1 4v6h6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.51 15a9 9 0 105.64-12.36L1 10" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          重置参数
        </button>
        <div class="footer-right">
          <span v-if="pointsCost > 0" class="points-info">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            {{ pointsCost }}
          </span>
          <button
            class="generate-btn"
            @click="handleGenerate"
            :disabled="generating || !imageUrl"
            :title="generating ? '生成中...' : '生成多角度图片'"
          >
            <svg v-if="generating" class="spinner" viewBox="0 0 24 24" fill="none" width="20" height="20">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
              <path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.camera-3d-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.camera-3d-panel {
  position: relative;
  width: 880px;
  max-width: 95vw;
  background: #1a1a1c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

/* 标题栏 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: #e5e5e5;
  letter-spacing: 0.5px;
}

.panel-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}
.panel-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.panel-close svg {
  width: 20px;
  height: 20px;
}

/* 预设标签 */
.preset-tabs {
  display: flex;
  gap: 8px;
  padding: 0 20px 16px;
  overflow-x: auto;
  scrollbar-width: none;
}
.preset-tabs::-webkit-scrollbar { display: none; }

.preset-tab {
  flex-shrink: 0;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #999;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.preset-tab:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  border-color: rgba(255, 255, 255, 0.15);
}
.preset-tab.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

/* 主体双栏 */
.panel-body {
  display: flex;
  gap: 0;
  padding: 0 20px 16px;
}

/* 左：3D 视口 */
.viewport-section {
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.viewport-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.nav-arrow {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s ease;
}
.nav-arrow:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #aaa;
}
.nav-arrow svg {
  width: 16px;
  height: 16px;
}

.viewport-container {
  flex: 1;
  height: 300px;
  background: #222226;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

/* 右：控制区 */
.controls-section {
  flex: 1;
  padding: 8px 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #888;
}

.control-value {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  color: #ddd;
  font-size: 13px;
}
.control-value.zoom-text {
  font-family: inherit;
  font-weight: 600;
}

.control-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 2px;
  cursor: pointer;
  outline: none;
}
.control-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  transition: transform 0.1s ease;
}
.control-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}
.control-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.control-slider::-moz-range-track {
  height: 4px;
  border-radius: 2px;
}

/* 提示词区域 */
.prompt-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prompt-toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.prompt-label {
  font-size: 13px;
  color: #888;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  cursor: pointer;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.toggle-slider-ui {
  position: absolute;
  inset: 0;
  background: #333;
  border-radius: 11px;
  transition: background 0.25s ease;
}
.toggle-slider-ui::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 18px;
  height: 18px;
  background: #888;
  border-radius: 50%;
  transition: all 0.25s ease;
}
.toggle-switch input:checked + .toggle-slider-ui {
  background: #3b82f6;
}
.toggle-switch input:checked + .toggle-slider-ui::before {
  transform: translateX(18px);
  background: #fff;
}

.prompt-textarea {
  width: 100%;
  min-height: 70px;
  padding: 10px 12px;
  background: #222226;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #ccc;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s ease;
}
.prompt-textarea:focus {
  border-color: rgba(59, 130, 246, 0.4);
}
.prompt-textarea::placeholder {
  color: #555;
}

/* 生成状态 */
.generate-status {
  padding: 10px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.status-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #999;
  font-size: 13px;
}
.status-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ef4444;
  font-size: 13px;
}
.status-error svg, .status-progress svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* 底部 */
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.reset-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.reset-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #aaa;
}
.reset-btn svg {
  width: 14px;
  height: 14px;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.points-info {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 13px;
}
.points-info svg {
  width: 14px;
  height: 14px;
}

.generate-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: none;
  border-radius: 50%;
  color: #1a1a1c;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.generate-btn:hover:not(:disabled) {
  background: #e0e0e0;
  transform: scale(1.05);
}
.generate-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.generate-btn svg {
  width: 20px;
  height: 20px;
}

.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

<!-- 白昼模式样式 -->
<style>
:root.canvas-theme-light .camera-3d-overlay {
  background: rgba(255, 255, 255, 0.6);
}
:root.canvas-theme-light .camera-3d-panel {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.12);
}
:root.canvas-theme-light .panel-title {
  color: #333;
}
:root.canvas-theme-light .panel-close {
  color: #999;
}
:root.canvas-theme-light .panel-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #333;
}
:root.canvas-theme-light .preset-tab {
  border-color: rgba(0, 0, 0, 0.1);
  color: #666;
}
:root.canvas-theme-light .preset-tab:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #333;
  border-color: rgba(0, 0, 0, 0.15);
}
:root.canvas-theme-light .preset-tab.active {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.2);
  color: #111;
}
:root.canvas-theme-light .viewport-container {
  background: #f0f0f0;
  border-color: rgba(0, 0, 0, 0.08);
}
:root.canvas-theme-light .nav-arrow {
  color: #999;
}
:root.canvas-theme-light .nav-arrow:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #555;
}
:root.canvas-theme-light .control-label {
  color: #888;
}
:root.canvas-theme-light .control-value {
  color: #333;
}
:root.canvas-theme-light .control-slider {
  background: #ddd !important;
}
:root.canvas-theme-light .prompt-label {
  color: #888;
}
:root.canvas-theme-light .toggle-slider-ui {
  background: #ccc;
}
:root.canvas-theme-light .toggle-slider-ui::before {
  background: #fff;
}
:root.canvas-theme-light .prompt-textarea {
  background: #f5f5f5;
  border-color: rgba(0, 0, 0, 0.1);
  color: #333;
}
:root.canvas-theme-light .prompt-textarea::placeholder {
  color: #aaa;
}
:root.canvas-theme-light .panel-footer {
  border-top-color: rgba(0, 0, 0, 0.06);
}
:root.canvas-theme-light .reset-btn {
  color: #888;
}
:root.canvas-theme-light .reset-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #555;
}
:root.canvas-theme-light .points-info {
  color: #888;
}
:root.canvas-theme-light .generate-btn {
  background: #333;
  color: #fff;
}
:root.canvas-theme-light .generate-btn:hover:not(:disabled) {
  background: #444;
}
</style>
