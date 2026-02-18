<script setup>
/**
 * VideoClipEditor.vue - 视频裁剪编辑器
 * 
 * 功能：
 * - 全屏居中显示视频
 * - 时间线选择器（1-3秒范围）
 * - 裁剪预览
 * - 确认创建角色
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getSoraCharacterConfig, getTenantHeaders } from '@/config/tenant.js'

// 获取角色创建积分消耗
const characterPointsCost = computed(() => {
  const config = getSoraCharacterConfig()
  return config.points_cost || 0
})

const props = defineProps({
  // 视频URL（必须传入）
  videoUrl: {
    type: String,
    required: true
  },
  // 节点ID
  nodeId: {
    type: String,
    default: ''
  },
  // Sora 任务ID（可选，用于判断是否可以使用 Sora 模式）
  soraTaskId: {
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

// 裁剪范围（秒）
const clipStart = ref(0)
const clipEnd = ref(3)
const MIN_CLIP_DURATION = 1 // 最短1秒
const MAX_CLIP_DURATION = 3 // 最长3秒

// 角色名称
const characterName = ref('')

// 创建模式：'sora'（使用任务ID）或 'url'（使用URL上传）
// 如果有 soraTaskId 则默认使用 sora 模式，否则只能使用 url 模式
const createMode = ref(props.soraTaskId ? 'sora' : 'url')

// 是否可以使用 Sora 模式（需要有任务ID）
const canUseSoraMode = computed(() => !!props.soraTaskId)

// 通道选择相关
const availableChannels = ref([])
const selectedChannel = ref(null)
const loadingChannels = ref(false)
const showChannelSelector = ref(false)

// 拖拽状态
const isDraggingStart = ref(false)
const isDraggingEnd = ref(false)
const isDraggingRange = ref(false)
const dragStartX = ref(0)
const dragStartValue = ref(0)

// 时间线容器引用
const timelineRef = ref(null)

// 计算裁剪时长
const clipDuration = computed(() => {
  return Math.round((clipEnd.value - clipStart.value) * 10) / 10
})

// 时间格式化
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
}

// 视频加载完成
function handleVideoLoaded() {
  if (videoRef.value) {
    videoDuration.value = videoRef.value.duration
    isLoaded.value = true

    // 初始化裁剪范围（默认前3秒或视频长度）
    clipEnd.value = Math.min(3, videoDuration.value)
    clipStart.value = 0

    // 跳转到裁剪起始位置
    videoRef.value.currentTime = clipStart.value
  }
}

// 视频加载错误
function handleVideoError(event) {
  console.error('[VideoClipEditor] 视频加载失败:', event)
  isLoaded.value = false
}

// 视频时间更新
function handleTimeUpdate() {
  if (videoRef.value) {
    currentTime.value = videoRef.value.currentTime
    
    // 如果播放超出裁剪范围，循环播放
    if (isPlaying.value && currentTime.value >= clipEnd.value) {
      videoRef.value.currentTime = clipStart.value
    }
  }
}

// 播放/暂停
function togglePlay() {
  if (!videoRef.value) return
  
  if (isPlaying.value) {
    videoRef.value.pause()
    isPlaying.value = false
  } else {
    // 确保从裁剪范围内开始播放
    if (currentTime.value < clipStart.value || currentTime.value >= clipEnd.value) {
      videoRef.value.currentTime = clipStart.value
    }
    videoRef.value.play()
    isPlaying.value = true
  }
}

// 预览裁剪片段
function previewClip() {
  if (!videoRef.value) return
  
  videoRef.value.currentTime = clipStart.value
  videoRef.value.play()
  isPlaying.value = true
}

// 时间线点击跳转
function handleTimelineClick(event) {
  if (!timelineRef.value || !videoRef.value) return
  if (isDraggingStart.value || isDraggingEnd.value || isDraggingRange.value) return
  
  const rect = timelineRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const percent = x / rect.width
  const time = percent * videoDuration.value
  
  // 跳转到点击位置
  videoRef.value.currentTime = Math.max(0, Math.min(time, videoDuration.value))
}

// 开始拖拽起始点
function startDragStart(event) {
  event.preventDefault()
  event.stopPropagation()
  isDraggingStart.value = true
  dragStartX.value = event.clientX
  dragStartValue.value = clipStart.value
  
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

// 开始拖拽结束点
function startDragEnd(event) {
  event.preventDefault()
  event.stopPropagation()
  isDraggingEnd.value = true
  dragStartX.value = event.clientX
  dragStartValue.value = clipEnd.value
  
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

// 开始拖拽整个范围
function startDragRange(event) {
  event.preventDefault()
  event.stopPropagation()
  isDraggingRange.value = true
  dragStartX.value = event.clientX
  dragStartValue.value = clipStart.value
  
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

// 拖拽移动
function handleDragMove(event) {
  if (!timelineRef.value) return
  
  const rect = timelineRef.value.getBoundingClientRect()
  const deltaX = event.clientX - dragStartX.value
  const deltaTime = (deltaX / rect.width) * videoDuration.value
  
  if (isDraggingStart.value) {
    let newStart = dragStartValue.value + deltaTime
    newStart = Math.max(0, newStart)
    newStart = Math.min(newStart, clipEnd.value - MIN_CLIP_DURATION)
    
    // 确保不超过最大时长
    if (clipEnd.value - newStart > MAX_CLIP_DURATION) {
      newStart = clipEnd.value - MAX_CLIP_DURATION
    }
    
    clipStart.value = Math.round(newStart * 10) / 10
    
    // 更新视频位置
    if (videoRef.value) {
      videoRef.value.currentTime = clipStart.value
    }
  } else if (isDraggingEnd.value) {
    let newEnd = dragStartValue.value + deltaTime
    newEnd = Math.min(videoDuration.value, newEnd)
    newEnd = Math.max(newEnd, clipStart.value + MIN_CLIP_DURATION)
    
    // 确保不超过最大时长
    if (newEnd - clipStart.value > MAX_CLIP_DURATION) {
      newEnd = clipStart.value + MAX_CLIP_DURATION
    }
    
    clipEnd.value = Math.round(newEnd * 10) / 10
  } else if (isDraggingRange.value) {
    const duration = clipEnd.value - clipStart.value
    let newStart = dragStartValue.value + deltaTime
    
    // 边界限制
    newStart = Math.max(0, newStart)
    newStart = Math.min(newStart, videoDuration.value - duration)
    
    clipStart.value = Math.round(newStart * 10) / 10
    clipEnd.value = Math.round((newStart + duration) * 10) / 10
    
    // 更新视频位置
    if (videoRef.value) {
      videoRef.value.currentTime = clipStart.value
    }
  }
}

// 拖拽结束
function handleDragEnd() {
  isDraggingStart.value = false
  isDraggingEnd.value = false
  isDraggingRange.value = false
  
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

// 加载可用通道列表
async function loadAvailableChannels() {
  loadingChannels.value = true
  try {
    const response = await fetch('/api/sora/characters/channels', {
      headers: {
        ...getTenantHeaders()
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      availableChannels.value = data.channels || []
      
      // 如果只有一个通道，自动选择
      if (availableChannels.value.length === 1) {
        selectedChannel.value = availableChannels.value[0].type
        showChannelSelector.value = false
      } else if (availableChannels.value.length > 1) {
        // 多个通道，显示选择界面
        showChannelSelector.value = true
        // 默认选择第一个
        if (!selectedChannel.value) {
          selectedChannel.value = availableChannels.value[0].type
        }
      } else {
        // 没有可用通道
        showChannelSelector.value = false
        selectedChannel.value = null
      }
    } else {
      console.warn('[VideoClipEditor] 获取通道列表失败')
      availableChannels.value = []
      showChannelSelector.value = false
    }
  } catch (error) {
    console.error('[VideoClipEditor] 加载通道列表出错:', error)
    availableChannels.value = []
    showChannelSelector.value = false
  } finally {
    loadingChannels.value = false
  }
}

// 确认创建角色
function handleConfirm() {
  // 如果显示通道选择器但未选择通道，提示用户
  if (showChannelSelector.value && !selectedChannel.value) {
    alert('请选择要使用的角色创建通道')
    return
  }
  
  // 取整数秒
  const startSec = Math.floor(clipStart.value)
  const endSec = Math.ceil(clipEnd.value)

  // 确保时间差在1-3秒范围内
  let finalStart = startSec
  let finalEnd = endSec

  if (finalEnd - finalStart > 3) {
    finalEnd = finalStart + 3
  }
  if (finalEnd - finalStart < 1) {
    finalEnd = finalStart + 1
  }

  // 角色名称：用户输入或默认值
  const name = characterName.value.trim() || '角色创建1'

  emit('confirm', {
    videoUrl: props.videoUrl,
    timestamps: `${finalStart},${finalEnd}`,
    startTime: finalStart,
    endTime: finalEnd,
    characterName: name, // 传递角色名称
    createMode: createMode.value, // 传递创建模式：'sora' 或 'url'
    channel_type: selectedChannel.value // 传递选择的通道类型
  })
}

// 关闭编辑器
function handleClose() {
  if (videoRef.value) {
    videoRef.value.pause()
  }
  emit('close')
}

// ESC 关闭
function handleKeyDown(event) {
  if (event.key === 'Escape') {
    handleClose()
  } else if (event.key === ' ') {
    event.preventDefault()
    togglePlay()
  }
}

// 计算选区样式
const selectionStyle = computed(() => {
  if (!videoDuration.value) return { left: '0%', width: '0%' }
  
  const startPercent = (clipStart.value / videoDuration.value) * 100
  const endPercent = (clipEnd.value / videoDuration.value) * 100
  
  return {
    left: `${startPercent}%`,
    width: `${endPercent - startPercent}%`
  }
})

// 计算播放头位置
const playheadStyle = computed(() => {
  if (!videoDuration.value) return { left: '0%' }
  
  const percent = (currentTime.value / videoDuration.value) * 100
  return { left: `${percent}%` }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  // 加载可用通道列表
  loadAvailableChannels()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
})
</script>

<template>
  <Teleport to="body">
    <div class="video-clip-overlay" @click.self="handleClose">
      <div class="video-clip-container">
        <!-- 标题栏 -->
        <div class="clip-header">
          <h3>
            创建 Sora 角色
            <span v-if="characterPointsCost > 0" class="header-points-badge">
              消耗 {{ characterPointsCost }} 积分
            </span>
          </h3>
          <p class="clip-hint">选择 1-3 秒的视频片段用于角色训练</p>
          <button class="close-btn" @click="handleClose">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- 可滚动内容区域 -->
        <div class="clip-content-wrapper">
        <!-- 视频预览区域 -->
        <div class="video-preview-area">
          <video
            ref="videoRef"
            :src="videoUrl"
            :key="videoUrl"
            class="clip-video"
            @loadedmetadata="handleVideoLoaded"
            @timeupdate="handleTimeUpdate"
            @ended="isPlaying = false"
            @error="handleVideoError"
            preload="auto"
          ></video>
          
          <!-- 播放按钮覆盖层 -->
          <div v-if="!isPlaying && isLoaded" class="play-overlay" @click="togglePlay">
            <div class="play-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- 时间线编辑区域 -->
        <div class="timeline-editor">
          <!-- 时间显示 -->
          <div class="time-display">
            <span class="time-current">{{ formatTime(clipStart) }}</span>
            <span class="time-separator">-</span>
            <span class="time-current">{{ formatTime(clipEnd) }}</span>
            <span class="time-duration">({{ clipDuration }}秒)</span>
          </div>
          
          <!-- 时间线 -->
          <div 
            ref="timelineRef"
            class="timeline-track"
            @click="handleTimelineClick"
          >
            <!-- 背景轨道 -->
            <div class="track-bg"></div>
            
            <!-- 选中区域 -->
            <div 
              class="track-selection"
              :style="selectionStyle"
              @mousedown="startDragRange"
            >
              <!-- 左侧拖拽手柄 -->
              <div 
                class="selection-handle handle-left"
                @mousedown.stop="startDragStart"
              >
                <div class="handle-bar"></div>
              </div>
              
              <!-- 右侧拖拽手柄 -->
              <div 
                class="selection-handle handle-right"
                @mousedown.stop="startDragEnd"
              >
                <div class="handle-bar"></div>
              </div>
            </div>
            
            <!-- 播放头 -->
            <div class="playhead" :style="playheadStyle"></div>
          </div>
          
          <!-- 时间刻度 -->
          <div class="timeline-labels">
            <span>0:00</span>
            <span>{{ formatTime(videoDuration / 2) }}</span>
            <span>{{ formatTime(videoDuration) }}</span>
          </div>
        </div>
        
        <!-- 创建模式选择 -->
        <div class="create-mode-section">
          <label class="section-label">创建方式</label>
          <div class="create-mode-options">
            <label 
              class="mode-option"
              :class="{ active: createMode === 'sora', disabled: !canUseSoraMode }"
            >
              <input 
                type="radio" 
                v-model="createMode" 
                value="sora"
                :disabled="!canUseSoraMode"
              />
              <div class="mode-content">
                <span class="mode-icon">⚡</span>
                <div class="mode-info">
                  <span class="mode-title">Sora 直连</span>
                  <span class="mode-desc">{{ canUseSoraMode ? '使用原始任务ID，更快速' : '仅 Sora 生成的视频可用' }}</span>
                </div>
              </div>
            </label>
            <label 
              class="mode-option"
              :class="{ active: createMode === 'url' }"
            >
              <input 
                type="radio" 
                v-model="createMode" 
                value="url"
              />
              <div class="mode-content">
                <span class="mode-icon">🔗</span>
                <div class="mode-info">
                  <span class="mode-title">URL 上传</span>
                  <span class="mode-desc">通过视频URL创建，适用所有视频</span>
                </div>
              </div>
            </label>
          </div>
          <!-- Sora2 备注提示 -->
          <p class="sora2-note">💡 当前 Sora2 从 URL 上传创建角色成功率较高，不支持真人</p>
        </div>
        
        <!-- 角色名称输入 -->
        <div class="character-name-input">
          <label class="name-label">角色名称</label>
          <input 
            v-model="characterName"
            type="text"
            class="name-input"
            placeholder="请输入角色名称（可选，默认：角色创建1）"
            maxlength="50"
          />
        </div>
        
        <!-- 通道选择（仅在多个通道启用时显示） -->
        <div v-if="showChannelSelector" class="channel-selector-section">
          <label class="section-label">选择创建通道</label>
          <div class="channel-options">
            <label
              v-for="channel in availableChannels"
              :key="channel.type"
              class="channel-option"
              :class="{ active: selectedChannel === channel.type }"
            >
              <input
                type="radio"
                :value="channel.type"
                v-model="selectedChannel"
                class="channel-radio"
              />
              <div class="channel-info">
                <span class="channel-name">{{ channel.name }}</span>
                <span v-if="channel.points_cost > 0" class="channel-points">
                  {{ channel.points_cost }} 积分/次
                </span>
                <span v-else class="channel-points free">免费</span>
              </div>
            </label>
          </div>
        </div>
        </div>
        <!-- 可滚动内容区域结束 -->
        
        <!-- 操作按钮 -->
        <div class="clip-actions">
          <button class="action-btn secondary" @click="previewClip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 3l14 9-14 9V3z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            预览片段
          </button>
          <button class="action-btn primary" @click="handleConfirm" :disabled="!isLoaded">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            确认创建角色
            <span v-if="characterPointsCost > 0" class="points-cost-badge">
              {{ characterPointsCost }} 积分
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.video-clip-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
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

.video-clip-container {
  width: 90vw;
  max-width: 900px;
  max-height: 95vh;
  background: #1a1a1a;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
  animation: scaleIn 0.3s ease;
}

/* 可滚动内容区域包装器 */
.clip-content-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
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
.clip-header {
  position: relative;
  padding: 16px 24px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.clip-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 标题积分徽章 */
.header-points-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.25));
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #FBBF24;
}

.clip-hint {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: #888;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  color: #888;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

/* 视频预览区域 */
.video-preview-area {
  position: relative;
  width: 100%;
  height: 28vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.clip-video {
  max-width: 100%;
  max-height: 28vh;
  width: auto;
  height: auto;
  object-fit: contain;
}

.play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: background 0.2s ease;
}

.play-overlay:hover {
  background: rgba(0, 0, 0, 0.4);
}

.play-btn {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}

.play-overlay:hover .play-btn {
  transform: scale(1.1);
}

.play-btn svg {
  width: 28px;
  height: 28px;
  color: #1a1a1a;
  margin-left: 4px;
}

/* 时间线编辑区域 */
.timeline-editor {
  padding: 16px 24px;
  background: #141414;
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
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.time-separator {
  color: #666;
}

.time-duration {
  font-size: 14px;
  color: #888;
  margin-left: 8px;
}

/* 时间线轨道 */
.timeline-track {
  position: relative;
  height: 48px;
  cursor: pointer;
  user-select: none;
}

.track-bg {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 8px;
  transform: translateY(-50%);
  background: #2a2a2a;
  border-radius: 4px;
}

/* 选中区域 */
.track-selection {
  position: absolute;
  top: 50%;
  height: 32px;
  transform: translateY(-50%);
  background: rgba(59, 130, 246, 0.3);
  border: 2px solid #3b82f6;
  border-radius: 6px;
  cursor: grab;
  transition: background 0.15s ease;
}

.track-selection:hover {
  background: rgba(59, 130, 246, 0.4);
}

.track-selection:active {
  cursor: grabbing;
}

/* 拖拽手柄 */
.selection-handle {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 16px;
  cursor: ew-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}

.handle-left {
  left: -8px;
}

.handle-right {
  right: -8px;
}

.handle-bar {
  width: 4px;
  height: 24px;
  background: #3b82f6;
  border-radius: 2px;
  transition: transform 0.15s ease;
}

.selection-handle:hover .handle-bar {
  transform: scaleY(1.2);
  background: #60a5fa;
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 40px;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 1px;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.playhead::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid #fff;
}

/* 时间刻度 */
.timeline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #666;
  font-family: 'SF Mono', Monaco, monospace;
}

/* 创建模式选择 */
.create-mode-section {
  padding: 16px 24px;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #888;
  margin-bottom: 10px;
}

.create-mode-options {
  display: flex;
  gap: 12px;
}

.mode-option {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 12px 14px;
  background: #222;
  border: 1px solid #333;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-option:hover:not(.disabled) {
  background: #2a2a2a;
  border-color: #444;
}

.mode-option.active {
  background: rgba(251, 191, 36, 0.1);
  border-color: #FBBF24;
}

.mode-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-option input[type="radio"] {
  display: none;
}

.mode-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mode-icon {
  font-size: 20px;
}

.mode-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.mode-desc {
  font-size: 11px;
  color: #888;
}

.mode-option.active .mode-title {
  color: #FBBF24;
}

/* Sora2 备注提示 */
.sora2-note {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(251, 191, 36, 0.1);
  border-left: 3px solid #FBBF24;
  border-radius: 4px;
  font-size: 12px;
  color: #999;
  line-height: 1.5;
}

/* 角色名称输入 */
.character-name-input {
  padding: 16px 24px;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.name-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #888;
  margin-bottom: 8px;
}

.name-input {
  width: 100%;
  padding: 12px 16px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.name-input:focus {
  border-color: #3b82f6;
  background: #333;
}

.name-input::placeholder {
  color: #666;
}

/* 通道选择器 */
.channel-selector-section {
  padding: 16px 24px;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
  min-height: fit-content;
}

.channel-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: fit-content;
}

.channel-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #2a2a2a;
  border: 2px solid #3a3a3a;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  min-height: 48px;
}

.channel-option:hover {
  background: #333;
  border-color: #4a4a4a;
}

.channel-option.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: #3b82f6;
}

.channel-radio {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #3b82f6;
}

.channel-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
}

.channel-name {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.channel-points {
  font-size: 12px;
  color: #888;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.channel-points.free {
  color: #10b981;
}

/* 操作按钮 */
.clip-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
  background: #1a1a1a;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn svg {
  width: 18px;
  height: 18px;
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.action-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.action-btn.primary {
  background: #3b82f6;
  color: #fff;
}

.action-btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.action-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 积分消耗徽章 */
.points-cost-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(251, 191, 36, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.5);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: #FBBF24;
  white-space: nowrap;
}

/* 响应式优化 - 支持不同屏幕尺寸 */
@media (max-width: 768px) {
  .video-clip-overlay {
    padding: 10px;
  }

  .video-clip-container {
    width: 100vw;
    max-width: 100vw;
    border-radius: 12px;
  }

  .video-preview-area {
    height: 25vh;
  }

  .clip-video {
    max-height: 25vh;
  }

  .clip-header {
    padding: 12px 16px;
  }

  .clip-header h3 {
    font-size: 16px;
  }

  .timeline-editor {
    padding: 12px 16px;
  }

  .video-source-selector {
    padding: 12px 16px;
  }

  .character-name-input {
    padding: 12px 16px;
  }

  .clip-actions {
    padding: 12px 16px;
  }
}

/* 竖屏视频优化 */
@media (max-aspect-ratio: 1/1) {
  .video-preview-area {
    height: 25vh;
  }

  .clip-video {
    max-height: 25vh;
  }
}

/* 超宽屏优化 */
@media (min-aspect-ratio: 21/9) {
  .video-preview-area {
    height: 30vh;
  }

  .clip-video {
    max-height: 30vh;
  }
}

/* 小高度屏幕优化 */
@media (max-height: 700px) {
  .video-clip-overlay {
    padding: 10px;
  }

  .video-preview-area {
    height: 22vh;
  }

  .clip-video {
    max-height: 22vh;
  }

  .clip-header {
    padding: 10px 20px;
  }

  .clip-header h3 {
    font-size: 15px;
  }

  .clip-hint {
    font-size: 12px;
  }

  .timeline-editor {
    padding: 12px 20px;
  }

  .character-name-input,
  .clip-actions {
    padding: 10px 20px;
  }
}

/* 超小高度屏幕优化 */
@media (max-height: 600px) {
  .video-preview-area {
    height: 20vh;
  }

  .clip-video {
    max-height: 20vh;
  }

  .clip-header {
    padding: 8px 16px;
  }

  .clip-header h3 {
    font-size: 14px;
  }

  .clip-hint {
    display: none;
  }

  .timeline-editor {
    padding: 10px 16px;
  }

  .time-display {
    margin-bottom: 10px;
  }

  .character-name-input,
  .clip-actions {
    padding: 8px 16px;
  }
}
</style>

