<template>
  <teleport to="body">
    <div class="video-tool-modal" role="dialog" aria-modal="true">
      <VideoSourceRail :canvas-videos="canvasVideos" @add-source="addSourceToTimeline" />

      <main class="video-tool-modal__workspace">
        <!-- 标题栏 -->
        <header class="video-tool-modal__titlebar">
          <span class="video-tool-modal__title">视频工具</span>
          <button type="button" class="video-tool-modal__close" title="关闭" @click="$emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </header>

        <!-- 模式切换标签栏（视频上方） -->
        <nav class="video-tool-modal__mode-tabs">
          <button
            type="button"
            class="video-tool-modal__mode-tab"
            :class="{ 'video-tool-modal__mode-tab--active': activeMode === 'edit' }"
            @click="activeMode = 'edit'; showEraseDropdown = false"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
            </svg>
            <span>剪辑</span>
          </button>
          <div class="video-tool-modal__mode-tab-wrapper">
            <button
              type="button"
              class="video-tool-modal__mode-tab"
              :class="{ 'video-tool-modal__mode-tab--active': activeMode === 'subtitle' }"
              @click="handleSubtitleTabClick"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M7 15h4M13 15h4" />
              </svg>
              <span>字幕擦除</span>
              <span class="video-tool-modal__erase-label">· {{ activeEraseOption.label }}</span>
              <svg class="video-tool-modal__dropdown-arrow" :class="{ 'video-tool-modal__dropdown-arrow--open': showEraseDropdown }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div v-if="showEraseDropdown" class="video-tool-modal__erase-dropdown">
              <div class="video-tool-modal__erase-group-label">字幕擦除</div>
              <button
                v-for="option in subtitleEraseOptions"
                :key="option.value"
                type="button"
                :class="{ active: eraseMode === option.value }"
                @click="eraseMode = option.value; showEraseDropdown = false"
              >{{ option.label }}</button>
              <div class="video-tool-modal__erase-group-label">高级水印/字幕擦除</div>
              <button
                v-for="option in watermarkEraseOptions"
                :key="option.value"
                type="button"
                :class="{ active: eraseMode === option.value }"
                @click="eraseMode = option.value; showEraseDropdown = false"
              >{{ option.label }}</button>
            </div>
          </div>
        </nav>

        <!-- 视频预览区 -->
        <VideoPreview
          ref="previewRef"
          class="video-tool-modal__preview"
          :clip="selectedClip"
          :mode="activeMode === 'subtitle' && isSelectionEraseMode ? 'fine' : 'standard'"
          @update:detect-rect="detectRect = $event"
          @timeupdate="handlePreviewTimeUpdate"
          @play="isPreviewPlaying = true"
          @pause="isPreviewPlaying = false"
          @ended="handleClipEnded"
        />

        <!-- 工具栏 -->
        <div class="video-tool-modal__toolbar">
          <div class="video-tool-modal__toolbar-left"></div>

          <!-- 中间：播放控制 -->
          <div class="video-tool-modal__toolbar-center">
            <span class="video-tool-modal__time">{{ formatTimeDisplay(currentPlayTime) }}</span>
            <button type="button" class="video-tool-modal__play-btn" @click="togglePreviewPlay" :title="isPreviewPlaying ? '暂停' : '播放'">
              <svg v-if="!isPreviewPlaying" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
            <span class="video-tool-modal__time video-tool-modal__time--total">{{ formatTimeDisplay(totalSeconds) }}</span>
            <button
              type="button"
              class="video-tool-modal__submit-btn"
              :disabled="submitting || normalizedClips.length === 0"
              @click="submit"
            >
              {{ submitting ? '处理中...' : (activeMode === 'edit' ? '合成视频' : '开始擦除') }}
            </button>
          </div>

          <!-- 右侧：缩放 -->
          <div class="video-tool-modal__toolbar-right">
            <div class="video-tool-modal__zoom-group">
              <button type="button" title="缩小" @click="zoomLevel = Math.max(0.1, zoomLevel - 0.25)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35M8 11h6" />
                </svg>
              </button>
              <input
                type="range"
                class="video-tool-modal__zoom-slider"
                min="0.1"
                max="5"
                step="0.1"
                v-model.number="zoomLevel"
              />
              <button type="button" title="放大" @click="zoomLevel = Math.min(5, zoomLevel + 0.25)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 状态信息条 -->
        <div v-if="estimate || statusText !== '添加视频后开始处理'" class="video-tool-modal__status-bar">
          <span>{{ statusText }}</span>
          <strong v-if="estimate">
            预计 {{ estimate.pointsCost }} 积分
            <template v-if="estimate.channel"> · {{ estimate.channel === 'volcengine' ? '火山' : '无痕' }}</template>
            <template v-if="estimate.billingUnit === 'second'">
              · {{ estimate.billedSeconds }} 秒（{{ estimate.pointsPerSecond }} 积分/秒）
            </template>
            <template v-else>
              · {{ estimate.billedMinutes }} 分钟
            </template>
          </strong>
        </div>

        <!-- 时间轴 -->
        <VideoTimeline
          :clips="clips"
          :selected-index="selectedIndex"
          :total-seconds="totalSeconds"
          :current-time="currentPlayTime"
          :zoom="zoomLevel"
          @update:clips="clips = $event"
          @select="selectedIndex = $event"
          @seek="handleSeek"
          @add-source="addSourceToTimeline"
          @update:zoom="zoomLevel = Math.min(5, Math.max(0.1, $event))"
        />
      </main>
    </div>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import VideoSourceRail from './video-tool/VideoSourceRail.vue'
import VideoTimeline from './video-tool/VideoTimeline.vue'
import VideoPreview from './video-tool/VideoPreview.vue'
import { estimateSubtitleEraseBilling } from '@/utils/videoToolBilling'
import { getTimelineTotalSeconds, normalizeTimelineClips } from '@/utils/videoToolTimeline'
import {
  createSubtitleEraseTask,
  estimateSubtitleErase,
  exportVideoTimeline,
  getSubtitleEraseConfig
} from '@/api/canvas/video-tools'

const props = defineProps({
  initialMode: {
    type: String,
    default: 'subtitle'
  },
  canvasVideos: {
    type: Array,
    default: () => []
  },
  initialSource: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['completed', 'close', 'cancel', 'export-started'])

const activeMode = ref(props.initialMode === 'edit' ? 'edit' : 'subtitle')
const eraseMode = ref('subtitle_all_area')
const showEraseDropdown = ref(false)
const clips = ref([])
const selectedIndex = ref(0)
const detectRect = ref(null)
const estimate = ref(null)
const subtitleConfig = ref(null)
const submitting = ref(false)
const statusText = ref('添加视频后开始处理')
const zoomLevel = ref(1)
const currentPlayTime = ref(0)
const isPreviewPlaying = ref(false)
const previewRef = ref(null)

const subtitleEraseOptions = [
  { value: 'subtitle_all_area', label: '全域智能擦除' },
  { value: 'subtitle_sel_area', label: '选区擦除' }
]
const watermarkEraseOptions = [
  { value: 'watermark_all_area', label: '全域水印/字幕擦除' },
  { value: 'watermark_sel_area', label: '选区水印/字幕擦除' }
]
const eraseOptions = [...subtitleEraseOptions, ...watermarkEraseOptions]

const activeEraseOption = computed(() => eraseOptions.find(option => option.value === eraseMode.value) || eraseOptions[0])
const isSelectionEraseMode = computed(() => eraseMode.value.endsWith('_sel_area'))

function handleSubtitleTabClick() {
  if (activeMode.value === 'subtitle') {
    showEraseDropdown.value = !showEraseDropdown.value
  } else {
    activeMode.value = 'subtitle'
    showEraseDropdown.value = false
  }
}

const normalizedClips = computed(() => {
  try {
    return normalizeTimelineClips(clips.value)
  } catch {
    return []
  }
})

const totalSeconds = computed(() => getTimelineTotalSeconds(normalizedClips.value))
const selectedClip = computed(() => clips.value[selectedIndex.value] || clips.value[0] || null)

const clipOffsets = computed(() => {
  const offsets = []
  let acc = 0
  for (const c of clips.value) {
    offsets.push(acc)
    acc += Math.max(0, (c.endTime || 0) - (c.startTime || 0))
  }
  return offsets
})

function globalTimeToClipInfo(globalTime) {
  const list = clips.value
  if (list.length === 0) return { clipIndex: 0, localTime: 0 }
  let acc = 0
  for (let i = 0; i < list.length; i++) {
    const dur = Math.max(0, (list[i].endTime || 0) - (list[i].startTime || 0))
    if (globalTime < acc + dur) {
      return { clipIndex: i, localTime: (list[i].startTime || 0) + (globalTime - acc) }
    }
    acc += dur
  }
  const last = list.length - 1
  return { clipIndex: last, localTime: list[last].endTime || 0 }
}

function clipLocalTimeToGlobal(clipIndex, localTime) {
  const list = clips.value
  if (clipIndex < 0 || clipIndex >= list.length) return 0
  const offset = clipOffsets.value[clipIndex] || 0
  const start = list[clipIndex].startTime || 0
  return offset + Math.max(0, localTime - start)
}

function formatTimeDisplay(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function togglePreviewPlay() {
  const videoEl = previewRef.value?.$el?.querySelector('video')
  if (!videoEl) return
  if (videoEl.paused) {
    videoEl.play()
  } else {
    videoEl.pause()
  }
}

let seekGuardUntil = 0

function handleSeek(time) {
  const { clipIndex, localTime } = globalTimeToClipInfo(time)
  if (clipIndex !== selectedIndex.value) {
    selectedIndex.value = clipIndex
    nextTick(() => {
      previewRef.value?.seekTo?.(localTime)
    })
  } else {
    previewRef.value?.seekTo?.(localTime)
  }
  currentPlayTime.value = time
  seekGuardUntil = Date.now() + 150
}

function handlePreviewTimeUpdate(localTime) {
  if (Date.now() < seekGuardUntil) return
  currentPlayTime.value = clipLocalTimeToGlobal(selectedIndex.value, localTime)
}

function handleClipEnded() {
  const nextIdx = selectedIndex.value + 1
  if (nextIdx < clips.value.length) {
    selectedIndex.value = nextIdx
    nextTick(() => {
      const clip = clips.value[nextIdx]
      previewRef.value?.seekTo?.(clip.startTime || 0)
      const videoEl = previewRef.value?.$el?.querySelector('video')
      if (videoEl) videoEl.play()
    })
  } else {
    isPreviewPlaying.value = false
  }
}

function sourceToClip(source, probedDuration) {
  const duration = Math.max(0.1, probedDuration || Number(source.duration) || 10)
  return {
    id: `${source.id || 'source'}-${Date.now()}`,
    name: source.name || '视频片段',
    url: source.url,
    startTime: 0,
    endTime: duration,
    duration
  }
}

async function addSourceToTimeline(source) {
  if (!source?.url) return
  const clip = sourceToClip(source)
  clips.value = [...clips.value, clip]
  selectedIndex.value = clips.value.length - 1

  let probedDuration = 0
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    probedDuration = await new Promise((resolve) => {
      const cleanup = () => { video.removeAttribute('src'); video.load() }
      video.onloadedmetadata = () => {
        const dur = video.duration
        cleanup()
        resolve(Number.isFinite(dur) && dur > 0 ? dur : 0)
      }
      video.onerror = () => { cleanup(); resolve(0) }
      video.src = source.url
      setTimeout(() => { cleanup(); resolve(0) }, 8000)
    })
  } catch { /* use fallback */ }

  if (probedDuration > 0) {
    clips.value = clips.value.map(existing => {
      if (existing.id !== clip.id) return existing
      const nextDuration = Math.max(0.1, probedDuration)
      const startTime = Math.min(existing.startTime || 0, nextDuration)
      const defaultRangeUnchanged = (existing.startTime || 0) === 0 && (existing.endTime || 0) === clip.endTime
      return {
        ...existing,
        startTime,
        endTime: defaultRangeUnchanged ? nextDuration : Math.min(existing.endTime || nextDuration, nextDuration),
        duration: nextDuration
      }
    })
  }
}

function getResultUrl(payload) {
  return payload?.resultUrl || payload?.url || payload?.videoUrl || payload?.video_url || payload?.outputUrl || payload?.output?.url
}

function getTaskId(payload) {
  return payload?.taskId || payload?.task_id || payload?.id
}

async function refreshEstimate() {
  if (activeMode.value !== 'subtitle' || normalizedClips.value.length === 0) {
    estimate.value = null
    statusText.value = normalizedClips.value.length === 0 ? '添加视频后开始处理' : '剪辑导出'
    return
  }

  try {
    estimate.value = await estimateSubtitleErase({
      clips: normalizedClips.value,
      mode: eraseMode.value,
      detectRect: isSelectionEraseMode.value ? detectRect.value : undefined
    })
    statusText.value = activeEraseOption.value.label
  } catch {
    estimate.value = estimateSubtitleEraseBilling({
      totalSeconds: totalSeconds.value,
      config: subtitleConfig.value,
      mode: eraseMode.value
    })
    statusText.value = '本地预估'
  }
}

async function submit() {
  if (normalizedClips.value.length === 0) return
  submitting.value = true
  statusText.value = '提交中'
  try {
    if (activeMode.value === 'edit') {
      const clipsSnapshot = JSON.parse(JSON.stringify(normalizedClips.value))
      emit('export-started', { clips: clipsSnapshot, mode: 'edit' })
      return
    }

    const task = await createSubtitleEraseTask({
      clips: normalizedClips.value,
      mode: eraseMode.value,
      detectRect: isSelectionEraseMode.value ? detectRect.value : undefined
    })
    const immediateUrl = getResultUrl(task)
    if (immediateUrl) {
      emit('completed', { url: immediateUrl, resultUrl: immediateUrl, mode: 'subtitle', eraseMode: eraseMode.value, result: task })
    } else {
      emit('export-started', {
        mode: 'subtitle',
        eraseMode: eraseMode.value,
        taskId: getTaskId(task),
        task
      })
    }
  } catch (error) {
    statusText.value = error.message || '处理失败'
  } finally {
    submitting.value = false
  }
}

watch([activeMode, eraseMode, normalizedClips, detectRect], refreshEstimate, { deep: true })

function handleKeydown(e) {
  if (e.code === 'Space' && !e.target.closest('input, textarea, select, [contenteditable]')) {
    e.preventDefault()
    e.stopPropagation()
    togglePreviewPlay()
  }
  if (e.code === 'Escape') {
    e.stopPropagation()
    showEraseDropdown.value = false
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
    e.stopPropagation()
    if (clips.value.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < clips.value.length) {
      const newClips = clips.value.filter((_, i) => i !== selectedIndex.value)
      clips.value = newClips
      selectedIndex.value = Math.min(selectedIndex.value, newClips.length - 1)
    }
  }
}

function handleGlobalClick(e) {
  if (showEraseDropdown.value && !e.target.closest('.video-tool-modal__mode-tab-wrapper')) {
    showEraseDropdown.value = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('click', handleGlobalClick, true)
  if (props.initialSource) addSourceToTimeline(props.initialSource)
  try {
    subtitleConfig.value = await getSubtitleEraseConfig()
  } catch {
    subtitleConfig.value = null
  }
  refreshEstimate()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('click', handleGlobalClick, true)
})
</script>

<style scoped>
.video-tool-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: #0a0a0c;
  color: #f5f5f5;
}

.video-tool-modal__workspace {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: 40px auto minmax(0, 1fr) 44px auto 140px;
  background: #0a0a0c;
}

/* 标题栏 */
.video-tool-modal__titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #111114;
  border-bottom: 1px solid #1e1e22;
}

.video-tool-modal__title {
  font-size: 13px;
  font-weight: 500;
  color: #d4d4d8;
}

.video-tool-modal__close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #71717a;
  cursor: pointer;
  transition: all 0.15s ease;
}

.video-tool-modal__close:hover {
  background: #27272a;
  color: #f5f5f5;
}

/* 模式切换标签栏 */
.video-tool-modal__mode-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 16px;
  background: #111114;
  border-bottom: 1px solid #1e1e22;
}

.video-tool-modal__mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: #71717a;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.video-tool-modal__mode-tab:hover {
  color: #d4d4d8;
}

.video-tool-modal__mode-tab--active {
  color: #f5f5f5;
  border-bottom-color: #0d9488;
}

.video-tool-modal__mode-tab--active svg:first-child {
  color: #0d9488;
}

/* 字幕擦除标签包裹器 */
.video-tool-modal__mode-tab-wrapper {
  position: relative;
}

.video-tool-modal__erase-label {
  font-size: 11px;
  color: #a1a1aa;
  margin-left: 2px;
}

.video-tool-modal__dropdown-arrow {
  transition: transform 0.2s ease;
  color: #71717a;
}

.video-tool-modal__dropdown-arrow--open {
  transform: rotate(180deg);
}

.video-tool-modal__erase-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  min-width: 120px;
  padding: 4px;
  background: #1e1e22;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.video-tool-modal__erase-dropdown button {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #d4d4d8;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;
}

.video-tool-modal__erase-dropdown button:hover {
  background: #27272a;
}

.video-tool-modal__erase-dropdown button.active {
  color: #0d9488;
  background: rgba(13, 148, 136, 0.1);
}

/* 视频预览 */
.video-tool-modal__preview {
  min-height: 0;
  min-width: 0;
  padding: 12px;
  overflow: hidden;
  background: #0a0a0c;
}

/* 工具栏 */
.video-tool-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #141418;
  border-top: 1px solid #1e1e22;
  border-bottom: 1px solid #1e1e22;
  gap: 12px;
}

.video-tool-modal__toolbar-left,
.video-tool-modal__toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.video-tool-modal__toolbar-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 时间显示 */
.video-tool-modal__time {
  font-size: 12px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  color: #d4d4d8;
  min-width: 42px;
  text-align: center;
}

.video-tool-modal__time--total {
  color: #71717a;
}

/* 播放按钮 */
.video-tool-modal__play-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #3f3f46;
  border-radius: 50%;
  background: #1e1e22;
  color: #f5f5f5;
  cursor: pointer;
  transition: all 0.15s ease;
}

.video-tool-modal__play-btn:hover {
  background: #27272a;
  border-color: #52525b;
}

/* 缩放控制 */
.video-tool-modal__zoom-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.video-tool-modal__zoom-group button {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #71717a;
  cursor: pointer;
  transition: color 0.15s ease;
}

.video-tool-modal__zoom-group button:hover {
  color: #d4d4d8;
}

.video-tool-modal__zoom-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #3f3f46;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.video-tool-modal__zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #d4d4d8;
  cursor: pointer;
}

.video-tool-modal__zoom-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #d4d4d8;
  border: none;
  cursor: pointer;
}

/* 提交按钮（合成视频 / 开始擦除） */
.video-tool-modal__submit-btn {
  height: 28px;
  padding: 0 14px;
  margin-left: 4px;
  border: 1px solid #0d9488;
  border-radius: 6px;
  background: #0d9488;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.video-tool-modal__submit-btn:hover:not(:disabled) {
  background: #14b8a6;
  border-color: #14b8a6;
}

.video-tool-modal__submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 状态信息条 */
.video-tool-modal__status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 4px 12px;
  background: #111114;
  font-size: 11px;
  color: #71717a;
}

.video-tool-modal__status-bar strong {
  color: #a1a1aa;
  font-weight: 500;
}

/* 响应式 */
@media (max-width: 760px) {
  .video-tool-modal {
    flex-direction: column;
  }

  .video-tool-modal__toolbar {
    flex-wrap: wrap;
    height: auto;
    padding: 8px 12px;
    gap: 8px;
  }

  .video-tool-modal__zoom-slider {
    width: 60px;
  }
}
</style>
