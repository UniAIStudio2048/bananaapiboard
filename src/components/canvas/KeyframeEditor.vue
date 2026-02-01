<script setup>
/**
 * KeyframeEditor.vue - 关键帧截取编辑器
 * 
 * 功能：
 * - 全屏显示视频播放器
 * - 时间线进度条拖动
 * - 空格键标记关键帧
 * - Ctrl+Z 撤销
 * - 关键帧预览和裁剪
 * - 最多支持8个关键帧
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  videoUrl: {
    type: String,
    required: true
  },
  nodeId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'confirm'])

// 视频元素引用
const videoRef = ref(null)

// 视频状态
const videoDuration = ref(0)
const currentTime = ref(0)
const isPlaying = ref(false)
const isLoaded = ref(false)
const videoWidth = ref(1920)
const videoHeight = ref(1080)
const videoAspectRatio = computed(() => videoWidth.value / videoHeight.value)

// 播放速度
const playbackRate = ref(1)
const playbackRateOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
const showSpeedMenu = ref(false)

// 设置播放速度
function setPlaybackRate(rate) {
  playbackRate.value = rate
  if (videoRef.value) {
    videoRef.value.playbackRate = rate
  }
  showSpeedMenu.value = false
}

// 切换速度菜单
function toggleSpeedMenu() {
  showSpeedMenu.value = !showSpeedMenu.value
}

// 关键帧列表 [{time: number, thumbnail: string, cropArea: object}]
const keyframes = ref([])
const MAX_KEYFRAMES = 8

// 撤销栈
const undoStack = ref([])

// 当前选中的关键帧索引
const selectedKeyframeIndex = ref(-1)

// 裁剪模式
const isCropMode = ref(false)
const cropArea = ref({ x: 0, y: 0, width: 100, height: 100 }) // 百分比
const cropPreset = ref('original') // original, 1:1, 16:9, 9:16, 4:3, 3:4

// 时间线拖拽状态
const isDraggingTimeline = ref(false)
const timelineRef = ref(null)

// 裁剪比例预设
const cropPresets = [
  { value: 'original', label: '原比例', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '16:9', label: '16:9', ratio: 16/9 },
  { value: '9:16', label: '9:16', ratio: 9/16 },
  { value: '4:3', label: '4:3', ratio: 4/3 },
  { value: '3:4', label: '3:4', ratio: 3/4 }
]

// 时间格式化
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00.0'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
}

// 视频加载完成
function handleVideoLoaded() {
  if (videoRef.value) {
    videoDuration.value = videoRef.value.duration
    videoWidth.value = videoRef.value.videoWidth
    videoHeight.value = videoRef.value.videoHeight
    isLoaded.value = true
    console.log('[KeyframeEditor] 视频加载完成:', {
      duration: videoDuration.value,
      width: videoWidth.value,
      height: videoHeight.value
    })
  }
}

// 视频时间更新
function handleTimeUpdate() {
  if (videoRef.value && !isDraggingTimeline.value) {
    currentTime.value = videoRef.value.currentTime
  }
}

// 视频加载错误
function handleVideoError(event) {
  console.error('[KeyframeEditor] 视频加载失败:', event)
  isLoaded.value = false
}

// 播放/暂停
function togglePlay() {
  if (!videoRef.value) return
  
  if (isPlaying.value) {
    videoRef.value.pause()
    isPlaying.value = false
  } else {
    videoRef.value.play()
    isPlaying.value = true
  }
}

// 跳转到指定时间
function seekTo(time) {
  if (!videoRef.value) return
  const clampedTime = Math.max(0, Math.min(time, videoDuration.value))
  videoRef.value.currentTime = clampedTime
  currentTime.value = clampedTime
}

// 前进/后退
function seekStep(delta) {
  seekTo(currentTime.value + delta)
}

// ========== 时间线拖拽 ==========
function handleTimelineMouseDown(event) {
  isDraggingTimeline.value = true
  handleTimelineSeek(event)
  document.addEventListener('mousemove', handleTimelineMouseMove)
  document.addEventListener('mouseup', handleTimelineMouseUp)
}

function handleTimelineMouseMove(event) {
  if (isDraggingTimeline.value) {
    handleTimelineSeek(event)
  }
}

function handleTimelineMouseUp() {
  isDraggingTimeline.value = false
  document.removeEventListener('mousemove', handleTimelineMouseMove)
  document.removeEventListener('mouseup', handleTimelineMouseUp)
}

function handleTimelineSeek(event) {
  if (!timelineRef.value) return
  const rect = timelineRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const percent = x / rect.width
  const time = percent * videoDuration.value
  seekTo(time)
}

// 播放头位置样式
const playheadStyle = computed(() => {
  if (!videoDuration.value) return { left: '0%' }
  const percent = (currentTime.value / videoDuration.value) * 100
  return { left: `${Math.min(100, percent)}%` }
})

// ========== 关键帧操作 ==========
// 标记当前帧为关键帧
async function markKeyframe() {
  if (keyframes.value.length >= MAX_KEYFRAMES) {
    console.log('[KeyframeEditor] 已达到最大关键帧数量')
    return
  }
  
  if (!videoRef.value) return
  
  // 暂停视频以获取准确帧
  videoRef.value.pause()
  isPlaying.value = false
  
  try {
    // 截取当前帧
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.value.videoWidth
    canvas.height = videoRef.value.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.value, 0, 0)
    
    const thumbnail = canvas.toDataURL('image/jpeg', 0.8)
    
    // 保存撤销状态
    undoStack.value.push([...keyframes.value])
    
    // 添加关键帧
    keyframes.value.push({
      time: currentTime.value,
      thumbnail,
      cropArea: null // 使用原始比例
    })
    
    // 选中新添加的关键帧
    selectedKeyframeIndex.value = keyframes.value.length - 1
    
    console.log('[KeyframeEditor] 添加关键帧:', currentTime.value, '总数:', keyframes.value.length)
  } catch (e) {
    console.error('[KeyframeEditor] 截取关键帧失败:', e.message)
    // 跨域视频无法截取帧时的提示
    alert('无法截取关键帧：该视频来源不支持帧截取功能。请尝试使用本地上传的视频。')
  }
}

// 撤销
function undo() {
  if (undoStack.value.length === 0) return
  
  const previousState = undoStack.value.pop()
  keyframes.value = previousState
  
  // 调整选中索引
  if (selectedKeyframeIndex.value >= keyframes.value.length) {
    selectedKeyframeIndex.value = keyframes.value.length - 1
  }
  
  console.log('[KeyframeEditor] 撤销，剩余关键帧:', keyframes.value.length)
}

// 删除指定关键帧
function removeKeyframe(index) {
  if (index < 0 || index >= keyframes.value.length) return
  
  // 保存撤销状态
  undoStack.value.push([...keyframes.value])
  
  keyframes.value.splice(index, 1)
  
  // 调整选中索引
  if (selectedKeyframeIndex.value >= keyframes.value.length) {
    selectedKeyframeIndex.value = keyframes.value.length - 1
  }
}

// 选中关键帧
function selectKeyframe(index) {
  selectedKeyframeIndex.value = index
  if (index >= 0 && index < keyframes.value.length) {
    // 跳转到该关键帧时间
    seekTo(keyframes.value[index].time)
    // 退出裁剪模式
    isCropMode.value = false
  }
}

// ========== 裁剪功能 ==========
function enterCropMode() {
  if (selectedKeyframeIndex.value < 0) return
  isCropMode.value = true
  
  const kf = keyframes.value[selectedKeyframeIndex.value]
  if (kf.cropArea) {
    cropArea.value = { ...kf.cropArea }
  } else {
    cropArea.value = { x: 0, y: 0, width: 100, height: 100 }
  }
}

function exitCropMode() {
  isCropMode.value = false
}

function applyCrop() {
  if (selectedKeyframeIndex.value < 0) return
  
  // 保存裁剪区域到关键帧
  keyframes.value[selectedKeyframeIndex.value].cropArea = { ...cropArea.value }
  keyframes.value[selectedKeyframeIndex.value].cropPreset = cropPreset.value
  
  isCropMode.value = false
}

function selectCropPreset(preset) {
  cropPreset.value = preset.value
  
  if (preset.ratio === null) {
    // 原始比例
    cropArea.value = { x: 0, y: 0, width: 100, height: 100 }
  } else {
    // 计算居中裁剪区域
    const videoRatio = videoAspectRatio.value
    const targetRatio = preset.ratio
    
    if (targetRatio > videoRatio) {
      // 目标更宽，以宽度为准
      const newHeight = (videoRatio / targetRatio) * 100
      cropArea.value = {
        x: 0,
        y: (100 - newHeight) / 2,
        width: 100,
        height: newHeight
      }
    } else {
      // 目标更高，以高度为准
      const newWidth = (targetRatio / videoRatio) * 100
      cropArea.value = {
        x: (100 - newWidth) / 2,
        y: 0,
        width: newWidth,
        height: 100
      }
    }
  }
}

// ========== 键盘事件 ==========
function handleKeyDown(event) {
  // 空格键播放/暂停
  if (event.code === 'Space') {
    event.preventDefault()
    togglePlay()
    return
  }
  
  // M键标记关键帧
  if (event.key === 'm' || event.key === 'M') {
    event.preventDefault()
    markKeyframe()
    return
  }
  
  // Ctrl+Z 撤销
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    event.preventDefault()
    undo()
    return
  }
  
  // ESC 关闭
  if (event.key === 'Escape') {
    if (isCropMode.value) {
      exitCropMode()
    } else {
      handleClose()
    }
    return
  }
  
  // 左右箭头微调
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekStep(-0.1) // 后退0.1秒
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekStep(0.1) // 前进0.1秒
    return
  }
}

// ========== 确认创建 ==========
async function handleConfirm() {
  if (keyframes.value.length === 0) {
    return
  }
  
  // 处理关键帧，生成最终图片数据
  const processedKeyframes = []
  
  for (const kf of keyframes.value) {
    let imageData = kf.thumbnail
    
    // 如果有裁剪，应用裁剪
    if (kf.cropArea && (kf.cropArea.x !== 0 || kf.cropArea.y !== 0 || 
        kf.cropArea.width !== 100 || kf.cropArea.height !== 100)) {
      imageData = await applyCropToImage(kf.thumbnail, kf.cropArea)
    }
    
    processedKeyframes.push({
      time: kf.time,
      image: imageData,
      cropArea: kf.cropArea
    })
  }
  
  emit('confirm', {
    keyframes: processedKeyframes,
    videoUrl: props.videoUrl
  })
}

// 应用裁剪到图片
async function applyCropToImage(imageData, cropArea) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const srcX = (cropArea.x / 100) * img.width
      const srcY = (cropArea.y / 100) * img.height
      const srcW = (cropArea.width / 100) * img.width
      const srcH = (cropArea.height / 100) * img.height
      
      canvas.width = srcW
      canvas.height = srcH
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)
      
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.src = imageData
  })
}

// 关闭编辑器
function handleClose() {
  if (videoRef.value) {
    videoRef.value.pause()
  }
  emit('close')
}

// 关键帧在时间线上的位置
function getKeyframeTimelinePosition(kf) {
  if (!videoDuration.value) return { left: '0%' }
  const percent = (kf.time / videoDuration.value) * 100
  return { left: `${percent}%` }
}

// 点击外部关闭速度菜单
function handleClickOutside(event) {
  if (showSpeedMenu.value) {
    const speedSelector = event.target.closest('.speed-selector')
    if (!speedSelector) {
      showSpeedMenu.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('mousemove', handleTimelineMouseMove)
  document.removeEventListener('mouseup', handleTimelineMouseUp)
})
</script>

<template>
  <Teleport to="body">
    <div class="keyframe-editor-overlay" @click.self="handleClose">
      <div class="keyframe-editor-container">
        <!-- 标题栏 -->
        <div class="editor-header">
          <div class="header-left">
            <h3>关键帧截取</h3>
            <span class="header-hint">空格播放/暂停，M标记关键帧，Ctrl+Z撤销</span>
          </div>
          <div class="header-right">
            <span class="keyframe-count">{{ keyframes.length }} / {{ MAX_KEYFRAMES }}</span>
            <button class="header-btn" @click="handleClose" title="关闭">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 主内容区域 -->
        <div class="editor-main">
          <!-- 视频预览区域 -->
          <div class="video-preview-section">
            <div class="video-wrapper" :class="{ 'crop-mode': isCropMode }" @click="togglePlay">
              <video
                ref="videoRef"
                :src="videoUrl"
                class="preview-video"
                @loadedmetadata="handleVideoLoaded"
                @timeupdate="handleTimeUpdate"
                @ended="isPlaying = false"
                @error="handleVideoError"
                preload="auto"
              ></video>
              
              <!-- 裁剪遮罩 -->
              <div v-if="isCropMode" class="crop-overlay">
                <div class="crop-mask crop-mask-top" :style="{ height: cropArea.y + '%' }"></div>
                <div class="crop-mask crop-mask-bottom" :style="{ height: (100 - cropArea.y - cropArea.height) + '%' }"></div>
                <div class="crop-mask crop-mask-left" :style="{ 
                  top: cropArea.y + '%', 
                  height: cropArea.height + '%',
                  width: cropArea.x + '%' 
                }"></div>
                <div class="crop-mask crop-mask-right" :style="{ 
                  top: cropArea.y + '%', 
                  height: cropArea.height + '%',
                  width: (100 - cropArea.x - cropArea.width) + '%' 
                }"></div>
                <div class="crop-area" :style="{
                  left: cropArea.x + '%',
                  top: cropArea.y + '%',
                  width: cropArea.width + '%',
                  height: cropArea.height + '%'
                }">
                  <div class="crop-handle crop-handle-nw"></div>
                  <div class="crop-handle crop-handle-ne"></div>
                  <div class="crop-handle crop-handle-sw"></div>
                  <div class="crop-handle crop-handle-se"></div>
                </div>
              </div>
              
            </div>
            
            <!-- 裁剪比例选择（裁剪模式） -->
            <div v-if="isCropMode" class="crop-presets">
              <button 
                v-for="preset in cropPresets" 
                :key="preset.value"
                class="preset-btn"
                :class="{ active: cropPreset === preset.value }"
                @click="selectCropPreset(preset)"
              >
                {{ preset.label }}
              </button>
              <div class="crop-actions">
                <button class="crop-action-btn cancel" @click="exitCropMode">取消</button>
                <button class="crop-action-btn confirm" @click="applyCrop">应用</button>
              </div>
            </div>
          </div>
          
          <!-- 关键帧列表 -->
          <div class="keyframes-panel">
            <div class="panel-header">
              <span>已标记的关键帧</span>
            </div>
            <div class="keyframes-list">
              <div 
                v-for="(kf, index) in keyframes" 
                :key="index"
                class="keyframe-item"
                :class="{ selected: selectedKeyframeIndex === index }"
                @click="selectKeyframe(index)"
              >
                <img :src="kf.thumbnail" alt="关键帧" class="keyframe-thumbnail" />
                <div class="keyframe-info">
                  <span class="keyframe-time">{{ formatTime(kf.time) }}</span>
                  <span v-if="kf.cropArea" class="keyframe-cropped">已裁剪</span>
                </div>
                <div class="keyframe-actions">
                  <button 
                    class="kf-action-btn" 
                    title="裁剪"
                    @click.stop="selectKeyframe(index); enterCropMode()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M6 2v4M6 18v4M2 6h4M18 6h4M18 18h-8a2 2 0 01-2-2V6" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M6 6h10a2 2 0 012 2v10" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button 
                    class="kf-action-btn delete" 
                    title="删除"
                    @click.stop="removeKeyframe(index)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <!-- 空状态 -->
              <div v-if="keyframes.length === 0" class="keyframes-empty">
                <div class="empty-icon">🎬</div>
                <div class="empty-text">按 M 键标记关键帧</div>
                <div class="empty-hint">最多可标记 {{ MAX_KEYFRAMES }} 个</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 时间线区域 -->
        <div class="timeline-section">
          <!-- 时间显示 -->
          <div class="time-display">
            <span class="time-current">{{ formatTime(currentTime) }}</span>
            <span class="time-separator">/</span>
            <span class="time-total">{{ formatTime(videoDuration) }}</span>
          </div>
          
          <!-- 时间线轨道 -->
          <div 
            ref="timelineRef"
            class="timeline-track"
            @mousedown="handleTimelineMouseDown"
          >
            <div class="track-bg"></div>
            
            <!-- 关键帧标记 -->
            <div 
              v-for="(kf, index) in keyframes" 
              :key="'marker-' + index"
              class="keyframe-marker"
              :class="{ selected: selectedKeyframeIndex === index }"
              :style="getKeyframeTimelinePosition(kf)"
              @click.stop="selectKeyframe(index)"
            >
              <div class="marker-dot"></div>
            </div>
            
            <!-- 播放头 -->
            <div class="playhead" :style="playheadStyle">
              <div class="playhead-line"></div>
              <div class="playhead-handle"></div>
            </div>
          </div>
          
          <!-- 控制按钮 -->
          <div class="timeline-controls">
            <button class="control-btn" @click="seekStep(-1)" title="后退1秒">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="control-btn" @click="seekStep(-0.1)" title="后退0.1秒">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="control-btn play-pause" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
              <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            </button>
            <button class="control-btn" @click="seekStep(0.1)" title="前进0.1秒">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="control-btn" @click="seekStep(1)" title="前进1秒">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 5l7 7-7 7M6 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="controls-divider"></div>
            <button class="control-btn mark-btn" @click="markKeyframe" :disabled="keyframes.length >= MAX_KEYFRAMES" title="标记关键帧（M）">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>标记</span>
            </button>
            <button class="control-btn undo-btn" @click="undo" :disabled="undoStack.length === 0" title="撤销（Ctrl+Z）">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l4-4M3 10l4 4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>撤销</span>
            </button>
            <div class="controls-divider"></div>
            <!-- 播放速度选择器 -->
            <div class="speed-selector" @click.stop>
              <button class="control-btn speed-btn" @click="toggleSpeedMenu" title="播放速度">
                <span class="speed-value">{{ playbackRate }}x</span>
              </button>
              <div v-if="showSpeedMenu" class="speed-menu">
                <button 
                  v-for="rate in playbackRateOptions" 
                  :key="rate"
                  class="speed-option"
                  :class="{ active: playbackRate === rate }"
                  @click="setPlaybackRate(rate)"
                >
                  {{ rate }}x
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 底部操作栏 -->
        <div class="editor-footer">
          <button class="footer-btn secondary" @click="handleClose">
            返回
          </button>
          <button 
            class="footer-btn primary" 
            @click="handleConfirm" 
            :disabled="keyframes.length === 0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            创建 {{ keyframes.length }} 个关键帧节点
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.keyframe-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 99999;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.keyframe-editor-container {
  width: 95vw;
  max-width: 1400px;
  height: 90vh;
  background: #0a0a0a;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.8);
  animation: scaleIn 0.3s ease;
}

@keyframes scaleIn {
  from { 
    opacity: 0;
    transform: scale(0.95);
  }
  to { 
    opacity: 1;
    transform: scale(1);
  }
}

/* 标题栏 */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #111;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.header-hint {
  font-size: 13px;
  color: #666;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.keyframe-count {
  font-size: 14px;
  font-weight: 500;
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
  padding: 6px 12px;
  border-radius: 6px;
}

.header-btn {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 8px;
  color: #888;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.header-btn svg {
  width: 20px;
  height: 20px;
}

/* 主内容区域 */
.editor-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 视频预览区域 */
.video-preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #000;
  position: relative;
}

.video-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.preview-video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}


/* 裁剪覆盖层 */
.crop-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crop-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.7);
}

.crop-mask-top {
  top: 0;
  left: 0;
  right: 0;
}

.crop-mask-bottom {
  bottom: 0;
  left: 0;
  right: 0;
}

.crop-mask-left {
  left: 0;
}

.crop-mask-right {
  right: 0;
}

.crop-area {
  position: absolute;
  border: 2px solid #4ade80;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}

.crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #4ade80;
  border-radius: 2px;
}

.crop-handle-nw { top: -6px; left: -6px; cursor: nw-resize; }
.crop-handle-ne { top: -6px; right: -6px; cursor: ne-resize; }
.crop-handle-sw { bottom: -6px; left: -6px; cursor: sw-resize; }
.crop-handle-se { bottom: -6px; right: -6px; cursor: se-resize; }

/* 裁剪比例选择 */
.crop-presets {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #111;
  border-top: 1px solid #222;
}

.preset-btn {
  padding: 8px 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: #222;
  color: #fff;
}

.preset-btn.active {
  background: rgba(74, 222, 128, 0.15);
  border-color: #4ade80;
  color: #4ade80;
}

.crop-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.crop-action-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.crop-action-btn.cancel {
  background: #333;
  color: #888;
}

.crop-action-btn.cancel:hover {
  background: #444;
  color: #fff;
}

.crop-action-btn.confirm {
  background: #4ade80;
  color: #000;
}

.crop-action-btn.confirm:hover {
  background: #22c55e;
}

/* 关键帧面板 */
.keyframes-panel {
  width: 280px;
  background: #111;
  border-left: 1px solid #222;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid #222;
  font-size: 14px;
  font-weight: 500;
  color: #888;
}

.keyframes-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.keyframe-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid transparent;
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.keyframe-item:hover {
  background: #222;
}

.keyframe-item.selected {
  border-color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}

.keyframe-thumbnail {
  width: 64px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  background: #000;
}

.keyframe-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keyframe-time {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  font-family: 'SF Mono', Monaco, monospace;
}

.keyframe-cropped {
  font-size: 11px;
  color: #4ade80;
}

.keyframe-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.keyframe-item:hover .keyframe-actions {
  opacity: 1;
}

.kf-action-btn {
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  color: #888;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.kf-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.kf-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.kf-action-btn svg {
  width: 14px;
  height: 14px;
}

/* 空状态 */
.keyframes-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 12px;
  color: #444;
}

/* 时间线区域 */
.timeline-section {
  padding: 16px 24px;
  background: #111;
  border-top: 1px solid #222;
  flex-shrink: 0;
}

.time-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
  font-family: 'SF Mono', Monaco, monospace;
}

.time-current {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
}

.time-separator {
  font-size: 18px;
  color: #444;
}

.time-total {
  font-size: 16px;
  color: #666;
}

/* 时间线轨道 */
.timeline-track {
  position: relative;
  height: 48px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 16px;
}

.track-bg {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 6px;
  transform: translateY(-50%);
  background: #2a2a2a;
  border-radius: 3px;
}

/* 关键帧标记 */
.keyframe-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 5;
}

.marker-dot {
  width: 12px;
  height: 12px;
  background: #4ade80;
  border-radius: 50%;
  border: 2px solid #0a0a0a;
  transition: transform 0.2s ease;
}

.keyframe-marker:hover .marker-dot,
.keyframe-marker.selected .marker-dot {
  transform: scale(1.3);
}

.keyframe-marker.selected .marker-dot {
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.3);
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
}

.playhead-line {
  width: 2px;
  height: 40px;
  background: #fff;
  border-radius: 1px;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.playhead-handle {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #fff;
}

/* 控制按钮 */
.timeline-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 40px;
  height: 40px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  color: #888;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover:not(:disabled) {
  background: #222;
  color: #fff;
  border-color: #444;
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.control-btn svg {
  width: 18px;
  height: 18px;
}

.control-btn.play-pause {
  width: 56px;
  height: 56px;
  background: #fff;
  color: #0a0a0a;
  border: none;
}

.control-btn.play-pause:hover {
  background: #e5e5e5;
  color: #0a0a0a;
}

.control-btn.play-pause svg {
  width: 24px;
  height: 24px;
}

.controls-divider {
  width: 1px;
  height: 24px;
  background: #333;
  margin: 0 12px;
}

.control-btn.mark-btn,
.control-btn.undo-btn {
  width: auto;
  padding: 0 16px;
}

.control-btn.mark-btn {
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.3);
  color: #4ade80;
}

.control-btn.mark-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.2);
  border-color: #4ade80;
}

.control-btn.undo-btn span,
.control-btn.mark-btn span {
  font-size: 13px;
  font-weight: 500;
}

/* 播放速度选择器 */
.speed-selector {
  position: relative;
}

.control-btn.speed-btn {
  width: auto;
  padding: 0 14px;
  min-width: 56px;
}

.speed-value {
  font-size: 13px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, monospace;
}

.speed-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 80px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.speed-option {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #888;
  font-size: 13px;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, monospace;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.speed-option:hover {
  background: #222;
  color: #fff;
}

.speed-option.active {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

/* 底部操作栏 */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  background: #0a0a0a;
  border-top: 1px solid #222;
  flex-shrink: 0;
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.footer-btn.secondary {
  background: #222;
  color: #888;
}

.footer-btn.secondary:hover {
  background: #333;
  color: #fff;
}

.footer-btn.primary {
  background: #4ade80;
  color: #000;
}

.footer-btn.primary:hover:not(:disabled) {
  background: #22c55e;
}

.footer-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-btn svg {
  width: 18px;
  height: 18px;
}

/* 滚动条样式 */
.keyframes-list::-webkit-scrollbar {
  width: 6px;
}

.keyframes-list::-webkit-scrollbar-track {
  background: transparent;
}

.keyframes-list::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.keyframes-list::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>

