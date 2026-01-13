<script setup>
/**
 * Camera3DPanel.vue - 3D相机角度控制面板
 * 用于图像节点工具栏的角度切换功能
 * 基于 Three.js 实现交互式相机控制
 * 输出格式: <sks> {azimuth} {elevation} {distance}
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  // 源图片URL
  imageUrl: {
    type: String,
    default: ''
  },
  // 初始角度
  initialAngles: {
    type: Object,
    default: () => ({ horizontal: 0, vertical: 0, zoom: 5 })
  },
  // 面板位置
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  // 积分消耗
  pointsCost: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close', 'update', 'apply', 'generate-start', 'generate-success', 'generate-error'])

// 生成状态
const generating = ref(false)
const generateProgress = ref('')
const generateError = ref('')

// 3D 容器引用
const containerRef = ref(null)
const panelRef = ref(null)

// Three.js 实例
let scene = null
let camera = null
let renderer = null
let imagePlane = null
let cameraIndicator = null
let animationFrameId = null

// 相机参数
const horizontalAngle = ref(props.initialAngles.horizontal || 0)
const verticalAngle = ref(props.initialAngles.vertical || 0)
const zoomLevel = ref(props.initialAngles.zoom || 5)

// 方位角映射表（修正：左右方向与相机实际位置对应）
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

// 仰角映射
const ELEVATION_MAP = [
  { min: -30, max: -15, label: 'low-angle shot' },
  { min: -15, max: 15, label: 'eye-level shot' },
  { min: 15, max: 45, label: 'elevated shot' },
  { min: 45, max: 61, label: 'high-angle shot' }
]

// 距离映射
const DISTANCE_MAP = [
  { min: 0, max: 3.33, label: 'close-up' },
  { min: 3.33, max: 6.66, label: 'medium shot' },
  { min: 6.66, max: 11, label: 'wide shot' }
]

// 获取方位角标签
function getAzimuthLabel(angle) {
  const normalized = ((angle % 360) + 360) % 360
  for (const mapping of AZIMUTH_MAP) {
    if (normalized >= mapping.min && normalized < mapping.max) {
      return mapping.label
    }
  }
  return 'front view'
}

// 获取仰角标签
function getElevationLabel(angle) {
  for (const mapping of ELEVATION_MAP) {
    if (angle >= mapping.min && angle < mapping.max) {
      return mapping.label
    }
  }
  return 'eye-level shot'
}

// 获取距离标签
function getDistanceLabel(zoom) {
  for (const mapping of DISTANCE_MAP) {
    if (zoom >= mapping.min && zoom < mapping.max) {
      return mapping.label
    }
  }
  return 'medium shot'
}

// 计算输出提示词（包含坐标信息）
const outputPrompt = computed(() => {
  const azimuth = getAzimuthLabel(horizontalAngle.value)
  const elevation = getElevationLabel(verticalAngle.value)
  const distance = getDistanceLabel(zoomLevel.value)
  const coords = `(horizontal: ${horizontalAngle.value}, vertical: ${verticalAngle.value}, zoom: ${zoomLevel.value})`
  return `<sks> ${azimuth} ${elevation} ${distance} ${coords}`
})

// 当前角度的中文描述
const angleDescription = computed(() => {
  const azimuthMap = {
    'front view': '正面',
    'front-right quarter view': '右前方',
    'right side view': '右侧',
    'back-right quarter view': '右后方',
    'back view': '背面',
    'back-left quarter view': '左后方',
    'left side view': '左侧',
    'front-left quarter view': '左前方'
  }
  const elevationMap = {
    'low-angle shot': '仰拍',
    'eye-level shot': '平视',
    'elevated shot': '俯拍',
    'high-angle shot': '高角度'
  }
  const distanceMap = {
    'close-up': '特写',
    'medium shot': '中景',
    'wide shot': '远景'
  }
  
  const azimuth = azimuthMap[getAzimuthLabel(horizontalAngle.value)] || '正面'
  const elevation = elevationMap[getElevationLabel(verticalAngle.value)] || '平视'
  const distance = distanceMap[getDistanceLabel(zoomLevel.value)] || '中景'
  
  return `${azimuth} · ${elevation} · ${distance}`
})

// 初始化 Three.js 场景
function initThreeJS() {
  if (!containerRef.value) return

  const width = containerRef.value.clientWidth || 400
  const height = 260

  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1e)

  // 创建相机（固定观察视角）
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  camera.position.set(10, 8, 10)
  camera.lookAt(0, 2, 0)

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  containerRef.value.appendChild(renderer.domElement)

  // 添加网格地面
  const gridHelper = new THREE.GridHelper(12, 12, 0x444444, 0x333333)
  scene.add(gridHelper)

  // 添加坐标轴
  const axesHelper = new THREE.AxesHelper(2)
  scene.add(axesHelper)

  // 添加环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  // 添加方向光
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 5)
  scene.add(directionalLight)

  // 创建图片平面
  if (props.imageUrl) {
    loadImagePlane(props.imageUrl)
  } else {
    createPlaceholderPlane()
  }

  // 创建相机位置指示器
  createCameraIndicator()

  // 开始渲染
  animate()

  // 添加鼠标交互
  addMouseInteraction()
}

// 创建占位平面
function createPlaceholderPlane() {
  const geometry = new THREE.PlaneGeometry(3, 4)
  const material = new THREE.MeshBasicMaterial({
    color: 0x333340,
    side: THREE.DoubleSide
  })
  imagePlane = new THREE.Mesh(geometry, material)
  imagePlane.position.set(0, 2, 0)
  // 旋转平面使其面向 X 轴正方向（正对 front view 相机）
  imagePlane.rotation.y = Math.PI / 2
  scene.add(imagePlane)
  
  // 添加边框
  const edges = new THREE.EdgesGeometry(geometry)
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x666666 })
  const wireframe = new THREE.LineSegments(edges, lineMaterial)
  imagePlane.add(wireframe)
}

// 加载图片为平面
function loadImagePlane(imageUrl) {
  const loader = new THREE.TextureLoader()
  loader.crossOrigin = 'anonymous'
  
  loader.load(imageUrl, (texture) => {
    if (imagePlane) {
      scene.remove(imagePlane)
    }

    const aspect = texture.image.width / texture.image.height
    const height = 4
    const width = height * aspect

    const geometry = new THREE.PlaneGeometry(Math.min(width, 5), height)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide
    })
    imagePlane = new THREE.Mesh(geometry, material)
    imagePlane.position.set(0, height / 2, 0)
    // 旋转平面使其面向 X 轴正方向（正对 front view 相机）
    imagePlane.rotation.y = Math.PI / 2
    scene.add(imagePlane)
  }, undefined, (error) => {
    console.warn('[Camera3D] 图片加载失败，使用占位符')
    createPlaceholderPlane()
  })
}

// 连接线（独立于相机组，使用世界坐标）
let connectionLine = null

// 创建相机指示器
function createCameraIndicator() {
  // 相机组
  const cameraGroup = new THREE.Group()
  
  // 相机锥体
  const coneGeometry = new THREE.ConeGeometry(0.3, 0.6, 8)
  const coneMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
  const cone = new THREE.Mesh(coneGeometry, coneMaterial)
  cone.rotation.x = Math.PI / 2
  cameraGroup.add(cone)
  
  // 添加发光圈
  const ringGeometry = new THREE.RingGeometry(0.4, 0.5, 16)
  const ringMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x60a5fa, 
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6
  })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  cameraGroup.add(ring)
  
  cameraIndicator = cameraGroup
  scene.add(cameraIndicator)
  
  // 创建独立的连接线（使用世界坐标）
  const lineGeometry = new THREE.BufferGeometry()
  const lineMaterial = new THREE.LineBasicMaterial({ 
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.6
  })
  connectionLine = new THREE.Line(lineGeometry, lineMaterial)
  scene.add(connectionLine)
  
  updateCameraIndicator()
}

// 更新相机指示器位置
function updateCameraIndicator() {
  if (!cameraIndicator) return

  const phi = THREE.MathUtils.degToRad(90 - verticalAngle.value)
  const theta = THREE.MathUtils.degToRad(horizontalAngle.value)
  const distance = 3 + zoomLevel.value * 0.5

  const x = distance * Math.sin(phi) * Math.cos(theta)
  const y = distance * Math.cos(phi) + 2
  const z = distance * Math.sin(phi) * Math.sin(theta)

  cameraIndicator.position.set(x, y, z)
  cameraIndicator.lookAt(0, 2, 0)
  
  // 更新连接线（使用世界坐标，从相机位置指向图片中心）
  if (connectionLine) {
    const positions = new Float32Array([
      x, y, z,      // 起点：相机位置
      0, 2, 0       // 终点：图片中心
    ])
    connectionLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  }
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

    // 水平拖动控制方位角（向右拖动减小角度，向左拖动增大角度）
    let newHorizontal = startHorizontal - deltaX * 0.5
    newHorizontal = ((newHorizontal % 360) + 360) % 360
    horizontalAngle.value = Math.round(newHorizontal)

    // 垂直拖动控制仰角
    let newVertical = startVertical - deltaY * 0.3
    verticalAngle.value = Math.round(Math.max(-30, Math.min(60, newVertical)))

    updateCameraIndicator()
    emitUpdate()
  }

  const handleMouseUp = () => {
    isDragging = false
    if (canvas) canvas.style.cursor = 'grab'
  }

  // 滚轮控制缩放
  const handleWheel = (e) => {
    e.preventDefault()
    e.stopPropagation()

    const delta = e.deltaY > 0 ? 0.5 : -0.5
    zoomLevel.value = Math.round(Math.max(0, Math.min(10, zoomLevel.value + delta)) * 10) / 10

    updateCameraIndicator()
    emitUpdate()
  }

  canvas.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('wheel', handleWheel, { passive: false })
  
  canvas.style.cursor = 'grab'

  // 清理函数
  const cleanup = () => {
    canvas.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    canvas.removeEventListener('wheel', handleWheel)
  }
  
  // 存储清理函数
  if (containerRef.value) {
    containerRef.value._cleanup = cleanup
  }
}

// 渲染循环
function animate() {
  animationFrameId = requestAnimationFrame(animate)
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

// 发送更新事件
function emitUpdate() {
  emit('update', {
    horizontal: horizontalAngle.value,
    vertical: verticalAngle.value,
    zoom: zoomLevel.value,
    prompt: outputPrompt.value
  })
}

// 快捷预设（修正：左右方向与相机实际位置对应）
const presets = {
  azimuth: [
    { label: '正面', value: 0, icon: '⬆' },
    { label: '左前', value: 45, icon: '↗' },
    { label: '左侧', value: 90, icon: '➡' },
    { label: '左后', value: 135, icon: '↘' },
    { label: '背面', value: 180, icon: '⬇' },
    { label: '右后', value: 225, icon: '↙' },
    { label: '右侧', value: 270, icon: '⬅' },
    { label: '右前', value: 315, icon: '↖' }
  ],
  elevation: [
    { label: '仰拍', value: -30 },
    { label: '平视', value: 0 },
    { label: '俯拍', value: 30 },
    { label: '高角度', value: 60 }
  ],
  distance: [
    { label: '特写', value: 2 },
    { label: '中景', value: 5 },
    { label: '远景', value: 8 }
  ]
}

function applyAzimuthPreset(value) {
  horizontalAngle.value = value
  updateCameraIndicator()
  emitUpdate()
}

function applyElevationPreset(value) {
  verticalAngle.value = value
  updateCameraIndicator()
  emitUpdate()
}

function applyDistancePreset(value) {
  zoomLevel.value = value
  updateCameraIndicator()
  emitUpdate()
}

// 应用到节点（仅传递角度信息，不生成）
function handleApply() {
  emit('apply', {
    horizontal: horizontalAngle.value,
    vertical: verticalAngle.value,
    zoom: zoomLevel.value,
    prompt: outputPrompt.value
  })
}

// 生成多角度图片
async function handleGenerate() {
  if (generating.value) return
  
  if (!props.imageUrl) {
    generateError.value = '请先选择一张图片'
    return
  }
  
  generating.value = true
  generateProgress.value = '提交任务中...'
  generateError.value = ''
  
  try {
    // 获取 token
    const token = localStorage.getItem('token')
    if (!token) {
      throw new Error('请先登录')
    }
    
    // 提交多角度生成任务
    const response = await fetch('/api/images/multiangle', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageUrl: props.imageUrl,
        prompt: outputPrompt.value
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || '生成失败')
    }
    
    const result = await response.json()
    const taskId = result.taskId
    
    if (!taskId) {
      throw new Error('未获取到任务ID')
    }
    
    // 立即发出生成开始事件，携带任务信息
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
    
    // 立即关闭面板，让父组件处理后续轮询
    generating.value = false
    handleClose()
    
  } catch (error) {
    console.error('[Camera3D] 生成失败:', error)
    generateError.value = error.message || '生成失败'
    generating.value = false
    emit('generate-error', { error: error.message })
  }
}

// 关闭面板
function handleClose() {
  emit('close')
}


// 点击外部关闭
function handleClickOutside(e) {
  if (panelRef.value && !panelRef.value.contains(e.target)) {
    handleClose()
  }
}

// 监听图片变化
watch(() => props.imageUrl, (newUrl) => {
  if (newUrl && scene) {
    loadImagePlane(newUrl)
  }
})

// 监听滑块变化
watch([horizontalAngle, verticalAngle, zoomLevel], () => {
  updateCameraIndicator()
  emitUpdate()
})

onMounted(() => {
  nextTick(() => {
    initThreeJS()
  })
  
  // 延迟添加点击外部关闭事件
  setTimeout(() => {
    document.addEventListener('mousedown', handleClickOutside)
  }, 100)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  if (containerRef.value?._cleanup) {
    containerRef.value._cleanup()
  }
  if (renderer) {
    renderer.dispose()
  }
})
</script>

<template>
  <div class="camera-3d-overlay">
    <div 
      ref="panelRef" 
      class="camera-3d-panel" 
      @click.stop 
      @mousedown.stop
      :style="{
        left: position.x + 'px',
        top: position.y + 'px'
      }"
    >
      <!-- 标题栏 -->
      <div class="panel-header">
        <div class="panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span>3D 相机角度</span>
        </div>
        <button class="panel-close" @click="handleClose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      
      <!-- 3D 视口 -->
      <div class="viewport-container" ref="containerRef">
        <div class="viewport-hint">拖动旋转 · 滚轮缩放</div>
      </div>
      
      <!-- 当前角度描述 -->
      <div class="angle-description">
        {{ angleDescription }}
      </div>
      
      <!-- 控制面板 -->
      <div class="controls-section">
        <!-- 方位角控制 -->
        <div class="control-group">
          <div class="control-label">
            <span>方位角</span>
            <span class="control-value">{{ horizontalAngle }}°</span>
          </div>
          <input 
            type="range" 
            v-model.number="horizontalAngle" 
            min="0" 
            max="359" 
            step="1"
            class="control-slider"
          />
          <div class="preset-btns azimuth-presets">
            <button 
              v-for="p in presets.azimuth" 
              :key="p.value"
              class="preset-btn"
              :class="{ active: Math.abs(horizontalAngle - p.value) < 22.5 || (p.value === 0 && horizontalAngle > 337.5) }"
              :title="p.label"
              @click="applyAzimuthPreset(p.value)"
            >
              {{ p.icon }}
            </button>
          </div>
        </div>
        
        <!-- 仰角控制 -->
        <div class="control-group">
          <div class="control-label">
            <span>仰角</span>
            <span class="control-value">{{ verticalAngle }}°</span>
          </div>
          <input 
            type="range" 
            v-model.number="verticalAngle" 
            min="-30" 
            max="60" 
            step="1"
            class="control-slider"
          />
          <div class="preset-btns">
            <button 
              v-for="p in presets.elevation" 
              :key="p.value"
              class="preset-btn text-btn"
              :class="{ active: Math.abs(verticalAngle - p.value) < 15 }"
              @click="applyElevationPreset(p.value)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        
        <!-- 距离控制 -->
        <div class="control-group">
          <div class="control-label">
            <span>距离</span>
            <span class="control-value">{{ zoomLevel.toFixed(1) }}</span>
          </div>
          <input 
            type="range" 
            v-model.number="zoomLevel" 
            min="0" 
            max="10" 
            step="0.5"
            class="control-slider"
          />
          <div class="preset-btns">
            <button 
              v-for="p in presets.distance" 
              :key="p.value"
              class="preset-btn text-btn"
              :class="{ active: Math.abs(zoomLevel - p.value) < 1.5 }"
              @click="applyDistancePreset(p.value)"
            >
              {{ p.label }}
            </button>
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
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{{ generateError }}</span>
        </div>
      </div>
      
      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button class="action-btn secondary" @click="handleClose" :disabled="generating">取消</button>
        <button class="action-btn primary" @click="handleGenerate" :disabled="generating || !imageUrl">
          <svg v-if="generating" class="btn-spinner" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" />
          </svg>
          <template v-else>
            <span>生成</span>
            <span v-if="props.pointsCost > 0" class="points-badge">-{{ props.pointsCost }} 积分</span>
          </template>
        </button>
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
  width: 440px;
  background: #1a1a1c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #222224;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #e5e5e5;
}

.panel-title svg {
  width: 18px;
  height: 18px;
  color: #999;
}

.panel-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.panel-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.panel-close svg {
  width: 16px;
  height: 16px;
}

.viewport-container {
  position: relative;
  width: 100%;
  height: 260px;
  background: #141416;
}

.viewport-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;
  z-index: 10;
}

.angle-description {
  padding: 10px 16px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #b0b0b0;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.controls-section {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #777;
}

.control-value {
  font-family: 'SF Mono', Monaco, monospace;
  color: #ccc;
}

.control-slider {
  width: 100%;
  height: 4px;
  appearance: none;
  background: #333;
  border-radius: 2px;
  cursor: pointer;
}

.control-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: #888;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: all 0.15s ease;
}

.control-slider::-webkit-slider-thumb:hover {
  background: #aaa;
  transform: scale(1.1);
}

.control-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #888;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.preset-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.azimuth-presets {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.preset-btn {
  padding: 6px 8px;
  background: #2a2a2c;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #777;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.preset-btn:hover {
  background: #333;
  color: #ccc;
}

.preset-btn.active {
  background: #3a3a3c;
  border-color: #555;
  color: #fff;
}

.preset-btn.text-btn {
  flex: 1;
  min-width: 60px;
  font-size: 12px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.action-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn.secondary {
  background: #2a2a2c;
  color: #888;
}

.action-btn.secondary:hover {
  background: #333;
  color: #ccc;
}

.action-btn.primary {
  background: #444;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.action-btn.primary:hover:not(:disabled) {
  background: #555;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 积分标签 */
.points-badge {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: #aaa;
}

/* 生成状态 */
.generate-status {
  padding: 10px 16px;
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

.status-error svg,
.status-progress svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.spinner, .btn-spinner {
  animation: spin 1s linear infinite;
}

.btn-spinner {
  width: 18px;
  height: 18px;
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

:root.canvas-theme-light .camera-3d-panel .panel-header {
  background: #f5f5f5;
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .camera-3d-panel .panel-title {
  color: #333;
}

:root.canvas-theme-light .camera-3d-panel .panel-title svg {
  color: #666;
}

:root.canvas-theme-light .camera-3d-panel .panel-close {
  color: #999;
}

:root.canvas-theme-light .camera-3d-panel .panel-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #333;
}

:root.canvas-theme-light .camera-3d-panel .viewport-container {
  background: #f0f0f0;
}

:root.canvas-theme-light .camera-3d-panel .viewport-hint {
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.7);
}

:root.canvas-theme-light .camera-3d-panel .angle-description {
  background: rgba(0, 0, 0, 0.03);
  color: #555;
}

:root.canvas-theme-light .camera-3d-panel .control-label {
  color: #888;
}

:root.canvas-theme-light .camera-3d-panel .control-value {
  color: #333;
}

:root.canvas-theme-light .camera-3d-panel .control-slider {
  background: #ddd;
}

:root.canvas-theme-light .camera-3d-panel .control-slider::-webkit-slider-thumb {
  background: #888;
}

:root.canvas-theme-light .camera-3d-panel .preset-btn {
  background: #f0f0f0;
  color: #666;
}

:root.canvas-theme-light .camera-3d-panel .preset-btn:hover {
  background: #e5e5e5;
  color: #333;
}

:root.canvas-theme-light .camera-3d-panel .preset-btn.active {
  background: #ddd;
  border-color: #bbb;
  color: #333;
}

:root.canvas-theme-light .camera-3d-panel .action-btn.secondary {
  background: #f0f0f0;
  color: #666;
}

:root.canvas-theme-light .camera-3d-panel .action-btn.secondary:hover {
  background: #e5e5e5;
  color: #333;
}

:root.canvas-theme-light .camera-3d-panel .action-btn.primary {
  background: #555;
  color: #fff;
}

:root.canvas-theme-light .camera-3d-panel .action-btn.primary:hover:not(:disabled) {
  background: #444;
}

:root.canvas-theme-light .camera-3d-panel .points-badge {
  background: rgba(0, 0, 0, 0.08);
  color: #666;
}
</style>

