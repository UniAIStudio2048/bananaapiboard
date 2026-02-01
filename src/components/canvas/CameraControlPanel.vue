<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="visible" class="camera-control-overlay" @click.self="handleClose">
        <div class="camera-control-panel" @click.stop>
          <!-- 标题栏 -->
          <div class="panel-header">
            <span class="panel-title">摄影机控制</span>
            <button class="save-btn" @click="handleSave">保存</button>
          </div>

          <!-- 相机类型切换 -->
          <div class="type-tabs-row">
            <div class="type-tabs">
              <button 
                v-for="type in cameraTypes" 
                :key="type.id"
                :class="['type-tab', { active: cameraType === type.id }]"
                @click="cameraType = type.id"
              >
                <span class="type-icon">{{ type.icon }}</span>
                <span class="type-label">{{ type.name }}</span>
              </button>
            </div>
            
            <!-- 重置按钮 -->
            <button class="reset-btn" @click="handleReset" title="重置">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 3v5h5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- 选择器行 -->
          <div class="selectors-row">
            <!-- 相机选择器 -->
            <div class="selector-group camera-selector">
              <div class="selector-label-top">{{ isCinemaMode ? '机身' : (isPhoneMode ? '手机' : '相机') }}</div>
              <WheelSelector
                :items="filteredCameras"
                v-model="selectedCamera"
                label-key="name"
                value-key="id"
              />
              <div class="selector-value">{{ selectedCameraData?.name || '-' }}</div>
              <div class="selector-brand" v-if="selectedCameraData?.brand">{{ selectedCameraData.brand }}</div>
            </div>

            <!-- 镜头选择器（仅电影机模式） -->
            <div class="selector-group" v-if="isCinemaMode">
              <div class="selector-label-top">镜头</div>
              <WheelSelector
                :items="compatibleLenses"
                v-model="selectedLens"
                label-key="name"
                value-key="id"
              />
              <div class="selector-value">{{ selectedLensData?.name || '-' }}</div>
            </div>

            <!-- 焦段选择器 -->
            <div class="selector-group">
              <div class="selector-label-top">焦段</div>
              <WheelSelector
                :items="availableFocalLengths"
                v-model="selectedFocalLength"
                :format-label="v => `${v}mm`"
              />
              <div class="selector-value">{{ selectedFocalLength }}mm</div>
            </div>

            <!-- 光圈选择器 -->
            <div class="selector-group">
              <div class="selector-label-top">光圈</div>
              <WheelSelector
                :items="availableApertures"
                v-model="selectedAperture"
                :format-label="v => `f/${v}`"
              />
              <div class="selector-value">f/{{ selectedAperture }}</div>
            </div>
          </div>

          <!-- 相机信息栏（所有模式通用） -->
          <div class="camera-info-bar" v-if="selectedCameraData">
            <div class="info-row">
              <div class="info-item" v-if="selectedCameraData.year">
                <span class="info-label">年份</span>
                <span class="info-value highlight">{{ selectedCameraData.year }}</span>
              </div>
              <div class="info-item" v-if="selectedCameraData.format">
                <span class="info-label">{{ isCinemaMode ? '画幅' : '画幅' }}</span>
                <span class="info-value highlight">{{ selectedCameraData.format }}</span>
              </div>
              <div class="info-item" v-if="selectedCameraData.sensor">
                <span class="info-label">{{ isCinemaMode ? '传感器/胶片' : '传感器' }}</span>
                <span class="info-value">{{ selectedCameraData.sensor }}</span>
              </div>
            </div>
            <!-- 中文名称 -->
            <div class="info-name-cn" v-if="selectedCameraData.nameCn">
              {{ selectedCameraData.nameCn }}
            </div>
            <!-- 描述 -->
            <div class="info-desc" v-if="selectedCameraData.description">
              {{ selectedCameraData.description }}
            </div>
            <!-- 经典电影（仅电影机模式） -->
            <div class="info-films" v-if="isCinemaMode && selectedCameraData.famousFilms && selectedCameraData.famousFilms.length > 0">
              <span class="films-label">🎬 经典作品：</span>
              <span class="films-list">{{ selectedCameraData.famousFilms.join('、') }}</span>
            </div>
          </div>

          <!-- 镜头特效选择 -->
          <div class="effects-section" v-if="availableEffects.length > 0">
            <div class="effects-header">
              <span class="effects-title">镜头特效</span>
              <span class="effects-hint">{{ selectedLensData?.description || '选择此镜头特有的光学效果' }}</span>
            </div>
            <div class="effects-grid">
              <button
                v-for="effect in availableEffects"
                :key="effect.id"
                :class="['effect-chip', { active: selectedEffects.includes(effect.id) }]"
                @click="toggleEffect(effect.id)"
                :title="effect.description"
              >
                <span class="effect-icon">{{ getEffectIcon(effect.category) }}</span>
                <span class="effect-name">{{ effect.name }}</span>
              </button>
            </div>
          </div>

          <!-- 预览提示词 -->
          <div class="preview-section">
            <div class="preview-label">生成的提示词（将追加到您的提示词后方）</div>
            <div class="preview-prompt">{{ generatedPrompt || '请选择相机和镜头' }}</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import WheelSelector from './WheelSelector.vue'
import { 
  cameraDatabase, 
  getCompatibleLenses, 
  getAvailableApertures, 
  getAvailableEffects,
  generateCameraPrompt,
  getCameraTypes,
  getCamerasByType,
  getCameraEffects
} from '@/config/canvas/cameraDatabase'

const props = defineProps({
  visible: { type: Boolean, default: false },
  initialSettings: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'save'])

// 相机类型
const cameraTypes = computed(() => cameraDatabase.cameraTypes || getCameraTypes())
const cameraType = ref('DIGITAL')

// 判断模式
const isCinemaMode = computed(() => cameraType.value === 'FILM' || cameraType.value === 'DIGITAL')
const isPhoneMode = computed(() => cameraType.value === 'PHONE')
const isCameraMode = computed(() => cameraType.value === 'CAMERA')

// 选中状态
const selectedCamera = ref('')
const selectedLens = ref('')
const selectedFocalLength = ref(35)
const selectedAperture = ref(2.0)
const selectedEffects = ref([])

// 初始化设置
watch(() => props.visible, (newVal) => {
  if (newVal && props.initialSettings) {
    const settings = props.initialSettings
    if (settings.camera) {
      // 查找相机类型
      const camera = cameraDatabase.cameras.find(c => c.id === settings.camera)
      if (camera) {
        cameraType.value = camera.type
        selectedCamera.value = settings.camera
      }
    }
    if (settings.lens) selectedLens.value = settings.lens
    if (settings.focalLength) selectedFocalLength.value = settings.focalLength
    if (settings.aperture) selectedAperture.value = settings.aperture
    if (settings.effects) selectedEffects.value = [...settings.effects]
  }
}, { immediate: true })

// 按类型过滤相机
const filteredCameras = computed(() => getCamerasByType(cameraType.value))

// 当前选中的相机数据
const selectedCameraData = computed(() => 
  cameraDatabase.cameras.find(c => c.id === selectedCamera.value)
)

// 兼容的镜头列表（仅电影机模式使用）
const compatibleLenses = computed(() => {
  if (!selectedCamera.value || !isCinemaMode.value) return []
  return getCompatibleLenses(selectedCamera.value)
})

// 当前选中的镜头数据
const selectedLensData = computed(() => 
  cameraDatabase.lenses?.find(l => l.id === selectedLens.value)
)

// 可用焦段列表
const availableFocalLengths = computed(() => {
  // 电影机模式：从镜头获取焦段
  if (isCinemaMode.value && selectedLensData.value) {
    return selectedLensData.value.focalLengths || [35]
  }
  // 照相机/手机模式：从相机数据获取焦段
  if (selectedCameraData.value?.focalLengths) {
    return selectedCameraData.value.focalLengths
  }
  return [35]
})

// 可用光圈列表
const availableApertures = computed(() => {
  // 电影机模式
  if (isCinemaMode.value && selectedLens.value && selectedFocalLength.value) {
    return getAvailableApertures(selectedLens.value, selectedFocalLength.value)
  }
  // 照相机/手机模式：从相机数据获取光圈
  if (selectedCameraData.value?.apertures) {
    return selectedCameraData.value.apertures
  }
  return [1.4, 2.0, 2.8, 4.0, 5.6, 8.0, 11]
})

// 可用特效列表
const availableEffects = computed(() => {
  // 电影机模式：从镜头获取特效
  if (isCinemaMode.value && selectedLens.value) {
    return getAvailableEffects(selectedLens.value)
  }
  // 照相机/手机模式：从相机数据获取特效
  if (selectedCameraData.value?.availableEffects) {
    return getCameraEffects(selectedCameraData.value.availableEffects)
  }
  return []
})

// 生成的提示词
const generatedPrompt = computed(() => {
  if (!selectedCameraData.value) return ''
  
  // 电影机模式
  if (isCinemaMode.value) {
    if (!selectedLensData.value) return ''
    return generateCameraPrompt({
      cameraName: selectedCameraData.value.name,
      lensName: selectedLensData.value.name,
      focalLength: selectedFocalLength.value,
      aperture: selectedAperture.value,
      effects: selectedEffects.value,
      mode: 'cinema'
    })
  }
  
  // 照相机/手机模式
  return generateCameraPrompt({
    cameraName: selectedCameraData.value.name,
    cameraData: selectedCameraData.value,
    focalLength: selectedFocalLength.value,
    aperture: selectedAperture.value,
    effects: selectedEffects.value,
    mode: isPhoneMode.value ? 'phone' : 'camera'
  })
})

// 当相机类型改变时，选择第一个相机
watch(cameraType, () => {
  const cameras = filteredCameras.value
  if (cameras.length > 0) {
    // 如果当前选中的相机不在新列表中，选择第一个
    if (!cameras.find(c => c.id === selectedCamera.value)) {
      selectedCamera.value = cameras[0].id
    }
  }
  // 清空镜头选择（如果切换到非电影机模式）
  if (!isCinemaMode.value) {
    selectedLens.value = ''
  }
}, { immediate: true })

// 当相机改变时，自动处理
watch(selectedCamera, () => {
  // 电影机模式：选择第一个兼容镜头
  if (isCinemaMode.value) {
    const lenses = compatibleLenses.value
    if (lenses.length > 0) {
      if (!lenses.find(l => l.id === selectedLens.value)) {
        selectedLens.value = lenses[0].id
      }
    }
  } else {
    // 照相机/手机模式：验证焦段和光圈
    const focalLengths = availableFocalLengths.value
    if (focalLengths.length > 0 && !focalLengths.includes(selectedFocalLength.value)) {
      // 选择最接近当前值的焦段
      const closest = focalLengths.reduce((prev, curr) => 
        Math.abs(curr - selectedFocalLength.value) < Math.abs(prev - selectedFocalLength.value) ? curr : prev
      )
      selectedFocalLength.value = closest
    }
    
    const apertures = availableApertures.value
    if (apertures.length > 0 && !apertures.includes(selectedAperture.value)) {
      selectedAperture.value = apertures[0]
    }
  }
  // 清空特效选择
  selectedEffects.value = []
}, { immediate: true })

// 当镜头改变时，验证焦段是否有效（仅电影机模式）
watch(selectedLens, () => {
  if (isCinemaMode.value) {
    if (!availableFocalLengths.value.includes(selectedFocalLength.value)) {
      // 选择最接近35mm的焦段
      const closest = availableFocalLengths.value.reduce((prev, curr) => 
        Math.abs(curr - 35) < Math.abs(prev - 35) ? curr : prev
      )
      selectedFocalLength.value = closest
    }
    // 清空特效选择（不同镜头有不同特效）
    selectedEffects.value = []
  }
}, { immediate: true })

// 当焦段改变时，验证光圈是否有效
watch(selectedFocalLength, () => {
  if (!availableApertures.value.includes(selectedAperture.value)) {
    // 选择最大可用光圈
    selectedAperture.value = availableApertures.value[0] || 2.0
  }
})

// 切换特效
function toggleEffect(effectId) {
  const index = selectedEffects.value.indexOf(effectId)
  if (index > -1) {
    selectedEffects.value.splice(index, 1)
  } else {
    selectedEffects.value.push(effectId)
  }
}

// 获取特效图标
function getEffectIcon(category) {
  const icons = {
    flare: '✨',
    bokeh: '🔮',
    style: '🎨',
    softness: '🌫️',
    distortion: '〰️',
    sharpness: '🔬'
  }
  return icons[category] || '⚡'
}

// 重置
function handleReset() {
  const cameras = filteredCameras.value
  if (cameras.length > 0) {
    selectedCamera.value = cameras[0].id
  }
  selectedEffects.value = []
}

// 关闭
function handleClose() {
  emit('close')
}

// 保存
function handleSave() {
  emit('save', {
    camera: selectedCamera.value,
    cameraName: selectedCameraData.value?.name || '',
    cameraType: cameraType.value,
    lens: selectedLens.value,
    lensName: selectedLensData.value?.name || '',
    focalLength: selectedFocalLength.value,
    aperture: selectedAperture.value,
    effects: [...selectedEffects.value],
    prompt: generatedPrompt.value
  })
}
</script>

<style scoped>
.camera-control-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 10000;
  padding-bottom: 80px;
}

.camera-control-panel {
  background: rgba(30, 30, 35, 0.98);
  border-radius: 20px 20px 16px 16px;
  padding: 16px 20px 20px;
  min-width: 700px;
  max-width: 900px;
  width: 90%;
  box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: white;
}

.save-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

/* 类型切换 */
.type-tabs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.type-tabs {
  display: flex;
  gap: 8px;
}

.type-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.type-tab:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.type-tab.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.type-icon {
  font-size: 14px;
}

.type-label {
  font-weight: 500;
}

.reset-btn {
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.reset-btn svg {
  width: 16px;
  height: 16px;
}

/* 选择器行 */
.selectors-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.selector-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 10px 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.selector-label-top {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.selector-value {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 6px;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selector-brand {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.camera-selector {
  min-width: 140px;
}

/* 相机信息栏 */
.camera-info-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  margin-bottom: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
  max-width: 250px;
}

.info-value.highlight {
  color: #60a5fa;
  font-weight: 600;
}

.info-name-cn {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.info-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
}

.info-films {
  font-size: 11px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.films-label {
  color: rgba(255, 255, 255, 0.5);
}

.films-list {
  color: #fbbf24;
  font-weight: 500;
}

/* 特效选择 */
.effects-section {
  margin-bottom: 16px;
}

.effects-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}

.effects-title {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.effects-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.effects-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.effect-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.effect-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

.effect-chip.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

.effect-icon {
  font-size: 12px;
}

.effect-name {
  font-weight: 500;
}

/* 预览区域 */
.preview-section {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  padding: 12px 14px;
}

.preview-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 6px;
}

.preview-prompt {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  line-height: 1.5;
  word-break: break-word;
}

/* 动画 */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-active .camera-control-panel,
.panel-slide-leave-active .camera-control-panel {
  transition: all 0.3s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
}

.panel-slide-enter-from .camera-control-panel,
.panel-slide-leave-to .camera-control-panel {
  transform: translateY(100%);
}

/* ========== 亮色主题适配 ========== */
:root.canvas-theme-light .camera-control-overlay {
  background: rgba(0, 0, 0, 0.3);
}

:root.canvas-theme-light .camera-control-panel {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.05);
}

:root.canvas-theme-light .panel-title {
  color: #333;
}

:root.canvas-theme-light .save-btn {
  background: rgba(0, 0, 0, 0.05);
  color: #666;
}

:root.canvas-theme-light .save-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

:root.canvas-theme-light .type-tab {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .type-tab:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .type-tab.active {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
  color: #333;
}

:root.canvas-theme-light .reset-btn {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .reset-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .selector-group {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .selector-label-top {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .selector-value {
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .selector-brand {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .camera-info-bar {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .info-label {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .info-value {
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .info-value.highlight {
  color: #2563eb;
}

:root.canvas-theme-light .info-name-cn {
  color: rgba(0, 0, 0, 0.85);
  border-top-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .info-desc {
  color: rgba(0, 0, 0, 0.55);
}

:root.canvas-theme-light .info-films {
  border-top-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .films-label {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .films-list {
  color: #d97706;
}

:root.canvas-theme-light .effects-title {
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .effects-hint {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .effect-chip {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.6);
}

:root.canvas-theme-light .effect-chip:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .effect-chip.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #2563eb;
}

:root.canvas-theme-light .preview-section {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .preview-label {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .preview-prompt {
  color: rgba(0, 0, 0, 0.85);
}
</style>
