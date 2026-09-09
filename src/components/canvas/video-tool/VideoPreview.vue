<template>
  <section class="video-preview">
    <div
      ref="stageRef"
      class="video-preview__stage"
      :class="{ 'video-preview__stage--fine': mode === 'fine' }"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
    >
      <video
        v-if="clip?.url"
        ref="videoRef"
        class="video-preview__video"
        crossorigin="anonymous"
        :src="clip.url"
        :controls="showControls"
        playsinline
        @timeupdate="onTimeUpdate"
        @seeked="onTimeUpdate"
        @loadedmetadata="onMetadataLoaded"
        @play="onPlay"
        @pause="onPause"
        @ended="onNativeEnded"
        @error="emit('preview-error', '视频预览加载失败，请检查素材地址及跨域访问权限')"
      />
      <div v-else class="video-preview__empty">选择视频片段</div>
      <div
        v-if="mode === 'fine' && selectionStyle"
        class="video-preview__selection"
        :style="selectionStyle"
      >
        <span class="video-preview__resize-handle video-preview__resize-handle--nw" data-handle="nw"></span>
        <span class="video-preview__resize-handle video-preview__resize-handle--ne" data-handle="ne"></span>
        <span class="video-preview__resize-handle video-preview__resize-handle--sw" data-handle="sw"></span>
        <span class="video-preview__resize-handle video-preview__resize-handle--se" data-handle="se"></span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { normalizePreviewRectToVideo } from '@/utils/videoToolRect'

const props = defineProps({
  showControls: { type: Boolean, default: true },
  clip: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'standard'
  }
})

const emit = defineEmits(['update:detectRect', 'timeupdate', 'play', 'pause', 'ended', 'preview-error', 'metadata'])

const stageRef = ref(null)
const videoRef = ref(null)
const dragStart = ref(null)
const dragCurrent = ref(null)
const isDragging = ref(false)
const activeVideoBox = ref(null)
const dragAction = ref(null)
const resizeHandle = ref(null)
const selectionOrigin = ref(null)
const committedSelection = ref(null)
const dragPreviewRect = ref(null)

const selectionStyle = computed(() => {
  const rect = dragPreviewRect.value || committedSelection.value
  if (!rect) return null
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }
})

function isPrimaryPointer(event) {
  return event.isPrimary !== false && event.button === 0
}

function getLocalPoint(event) {
  const stageBox = stageRef.value?.getBoundingClientRect()
  if (!stageBox) return null
  return {
    x: Math.min(stageBox.width, Math.max(0, event.clientX - stageBox.left)),
    y: Math.min(stageBox.height, Math.max(0, event.clientY - stageBox.top))
  }
}

function getContainedVideoBox() {
  const stageBox = stageRef.value?.getBoundingClientRect()
  const videoEl = videoRef.value
  const videoBox = videoRef.value?.getBoundingClientRect()
  if (!stageBox || !videoBox) return null

  const elementBox = {
    x: videoBox.left - stageBox.left,
    y: videoBox.top - stageBox.top,
    width: videoBox.width,
    height: videoBox.height
  }

  const intrinsicWidth = videoEl?.videoWidth
  const intrinsicHeight = videoEl?.videoHeight
  if (!intrinsicWidth || !intrinsicHeight || !elementBox.width || !elementBox.height) {
    return elementBox
  }

  const elementRatio = elementBox.width / elementBox.height
  const videoRatio = intrinsicWidth / intrinsicHeight
  if (videoRatio > elementRatio) {
    const height = elementBox.width / videoRatio
    return {
      x: elementBox.x,
      y: elementBox.y + (elementBox.height - height) / 2,
      width: elementBox.width,
      height
    }
  }

  const width = elementBox.height * videoRatio
  return {
    x: elementBox.x + (elementBox.width - width) / 2,
    y: elementBox.y,
    width,
    height: elementBox.height
  }
}

function isPointInsideBox(point, box) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  )
}

function clampPointToBox(point, box) {
  return {
    x: Math.min(box.x + box.width, Math.max(box.x, point.x)),
    y: Math.min(box.y + box.height, Math.max(box.y, point.y))
  }
}

function normalizeRectFromPoints(start, end) {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  return {
    x: left,
    y: top,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

function clampRectToBox(rect, box) {
  const width = Math.min(rect.width, box.width)
  const height = Math.min(rect.height, box.height)
  return {
    x: Math.min(box.x + box.width - width, Math.max(box.x, rect.x)),
    y: Math.min(box.y + box.height - height, Math.max(box.y, rect.y)),
    width,
    height
  }
}

function getResizeHandle(event) {
  return event.target?.closest?.('[data-handle]')?.dataset?.handle || null
}

function isSelectionTarget(event) {
  return !!event.target?.closest?.('.video-preview__selection')
}

function startInteraction(event) {
  event.preventDefault()
  event.stopPropagation()
  stageRef.value?.setPointerCapture?.(event.pointerId)
  isDragging.value = true
}

function clearDragState() {
  isDragging.value = false
  dragStart.value = null
  dragCurrent.value = null
  activeVideoBox.value = null
  dragAction.value = null
  resizeHandle.value = null
  selectionOrigin.value = null
  dragPreviewRect.value = null
}

function clearSelectionState() {
  committedSelection.value = null
  clearDragState()
}

function commitSelection(rect, videoBox) {
  if (!rect || !videoBox || rect.width <= 4 || rect.height <= 4) return
  committedSelection.value = clampRectToBox(rect, videoBox)
  const normalizedRect = normalizePreviewRectToVideo({
    selection: committedSelection.value,
    videoBox
  })
  emit('update:detectRect', {
    ...normalizedRect,
    sourceWidth: videoRef.value?.videoWidth,
    sourceHeight: videoRef.value?.videoHeight
  })
}

function startDrawSelection(point, videoBox, event) {
  startInteraction(event)
  dragAction.value = 'draw'
  activeVideoBox.value = videoBox
  dragStart.value = clampPointToBox(point, videoBox)
  dragCurrent.value = dragStart.value
  dragPreviewRect.value = normalizeRectFromPoints(dragStart.value, dragCurrent.value)
}

function startMoveSelection(point, videoBox, event) {
  startInteraction(event)
  dragAction.value = 'move'
  activeVideoBox.value = videoBox
  dragStart.value = point
  selectionOrigin.value = committedSelection.value
  dragPreviewRect.value = committedSelection.value
}

function startResizeSelection(point, videoBox, event, handle) {
  startInteraction(event)
  dragAction.value = 'resize'
  resizeHandle.value = handle
  activeVideoBox.value = videoBox
  dragStart.value = point
  selectionOrigin.value = committedSelection.value
  dragPreviewRect.value = committedSelection.value
}

function updateDrawSelection(point, videoBox) {
  dragCurrent.value = clampPointToBox(point, videoBox)
  dragPreviewRect.value = normalizeRectFromPoints(dragStart.value, dragCurrent.value)
}

function updateMoveSelection(point, videoBox) {
  if (!selectionOrigin.value || !dragStart.value) return
  const dx = point.x - dragStart.value.x
  const dy = point.y - dragStart.value.y
  dragPreviewRect.value = clampRectToBox({
    ...selectionOrigin.value,
    x: selectionOrigin.value.x + dx,
    y: selectionOrigin.value.y + dy
  }, videoBox)
}

function updateResizeSelection(point, videoBox) {
  const origin = selectionOrigin.value
  if (!origin) return
  const clampedPoint = clampPointToBox(point, videoBox)
  const left = origin.x
  const right = origin.x + origin.width
  const top = origin.y
  const bottom = origin.y + origin.height
  const nextStart = {
    x: resizeHandle.value?.includes('w') ? right : left,
    y: resizeHandle.value?.includes('n') ? bottom : top
  }
  dragPreviewRect.value = normalizeRectFromPoints(nextStart, clampedPoint)
}

function handlePointerDown(event) {
  if (props.mode !== 'fine' || !props.clip?.url) return
  if (!isPrimaryPointer(event)) return
  const point = getLocalPoint(event)
  const videoBox = getContainedVideoBox()
  if (!point || !videoBox) return
  const handle = getResizeHandle(event)
  if (handle && committedSelection.value) {
    startResizeSelection(point, videoBox, event, handle)
    return
  }
  if (committedSelection.value && isSelectionTarget(event)) {
    startMoveSelection(point, videoBox, event)
    return
  }
  if (!isPointInsideBox(point, videoBox)) return
  startDrawSelection(point, videoBox, event)
}

function handlePointerMove(event) {
  if (!isDragging.value || !dragStart.value || props.mode !== 'fine') return
  const point = getLocalPoint(event)
  const videoBox = activeVideoBox.value || getContainedVideoBox()
  if (point && videoBox) {
    event.preventDefault()
    if (dragAction.value === 'move') {
      updateMoveSelection(point, videoBox)
    } else if (dragAction.value === 'resize') {
      updateResizeSelection(point, videoBox)
    } else {
      updateDrawSelection(point, videoBox)
    }
  }
}

function handlePointerUp(event) {
  if (!isDragging.value) return
  stageRef.value?.releasePointerCapture?.(event.pointerId)
  const videoBox = activeVideoBox.value || getContainedVideoBox()
  commitSelection(dragPreviewRect.value, videoBox)
  clearDragState()
}

function handlePointerCancel(event) {
  stageRef.value?.releasePointerCapture?.(event.pointerId)
  clearDragState()
}

watch([() => props.mode, () => props.clip?.url], clearSelectionState)

const endedByBoundary = ref(false)
let audioContext = null
let gainNode = null
let audioSource = null
let audioElement = null
let animationFrame = null
let pendingSeek = null

async function applyClipSettings() {
  const video = videoRef.value
  if (!video) return
  if (audioElement && audioElement !== video) {
    audioSource?.disconnect()
    gainNode?.disconnect()
    audioContext?.close().catch(() => {})
    audioContext = null
    audioSource = null
    gainNode = null
    audioElement = null
  }
  video.playbackRate = props.clip?.playbackRate || 1
  video.preservesPitch = true
  const volumeDb = props.clip?.volumeDb || 0
  if (!gainNode && volumeDb === 0) return
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) throw new Error('浏览器不支持音频处理')
      audioContext = new AudioContextClass()
      audioSource = audioContext.createMediaElementSource(video)
      audioElement = video
      gainNode = audioContext.createGain()
      audioSource.connect(gainNode)
      gainNode.connect(audioContext.destination)
    }
    gainNode.gain.value = Math.pow(10, volumeDb / 20)
    video.volume = 1
    if (!video.paused) await audioContext.resume()
  } catch (error) {
    video.muted = true
    emit('preview-error', `音量预览不可用，已静音：${error.message}。导出仍会应用音量设置。`)
  }
}

function onMetadataLoaded() {
  emit('metadata', { clipId: props.clip?.id, duration: videoRef.value?.duration })
  seekTo(pendingSeek ?? props.clip?.startTime ?? 0)
  applyClipSettings()
}

function updatePlaybackFrame() {
  onTimeUpdate()
  if (videoRef.value && !videoRef.value.paused) animationFrame = requestAnimationFrame(updatePlaybackFrame)
}

function onPlay() {
  endedByBoundary.value = false
  const video = videoRef.value
  if (video && (video.currentTime < props.clip.startTime || video.currentTime >= props.clip.endTime)) seekTo(props.clip.startTime)
  applyClipSettings()
  cancelAnimationFrame(animationFrame)
  animationFrame = requestAnimationFrame(updatePlaybackFrame)
  emit('play')
}

function onNativeEnded() {
  if (endedByBoundary.value) return
  endedByBoundary.value = true
  emit('ended')
}

watch([() => props.clip?.id, () => props.clip?.url], () => {
  endedByBoundary.value = false
  seekTo(props.clip?.startTime || 0)
  applyClipSettings()
}, { flush: 'post' })
watch([() => props.clip?.playbackRate, () => props.clip?.volumeDb], applyClipSettings, { flush: 'post' })

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  videoRef.value?.pause()
  audioSource?.disconnect()
  gainNode?.disconnect()
  audioContext?.close().catch(() => {})
})

function onTimeUpdate() {
  const el = videoRef.value
  if (!el) return
  const startTime = props.clip?.startTime || 0
  const endTime = props.clip?.endTime
  if (el.currentTime < startTime || (el.paused && endTime != null && el.currentTime > endTime)) {
    seekTo(el.currentTime)
    return
  }
  if (endTime != null && el.currentTime >= endTime && !el.paused) {
    endedByBoundary.value = true
    el.pause()
    emit('timeupdate', endTime)
    emit('ended')
    return
  }
  emit('timeupdate', el.currentTime)
}

function onPause() {
  cancelAnimationFrame(animationFrame)
  if (endedByBoundary.value) {
    return
  }
  emit('pause')
}

function seekTo(time) {
  const el = videoRef.value
  const clamped = Math.max(props.clip?.startTime || 0, Math.min(props.clip?.endTime ?? time, time))
  pendingSeek = clamped
  if (el?.readyState >= 1) {
    el.currentTime = clamped
    pendingSeek = null
  }
}

defineExpose({ seekTo, pause: () => videoRef.value?.pause() })
</script>

<style scoped>
.video-preview {
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.video-preview__stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: #050505;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-preview__stage--fine {
  cursor: crosshair;
}

.video-preview__video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #050505;
}

.video-preview__empty {
  color: #71717a;
  font-size: 14px;
}

.video-preview__selection {
  position: absolute;
  border: 1px solid #f5f5f5;
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.08);
  cursor: move;
  pointer-events: auto;
}

.video-preview__resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 1px solid #050505;
  background: #f5f5f5;
  border-radius: 50%;
}

.video-preview__resize-handle--nw {
  top: -5px;
  left: -5px;
  cursor: nwse-resize;
}

.video-preview__resize-handle--ne {
  top: -5px;
  right: -5px;
  cursor: nesw-resize;
}

.video-preview__resize-handle--sw {
  bottom: -5px;
  left: -5px;
  cursor: nesw-resize;
}

.video-preview__resize-handle--se {
  right: -5px;
  bottom: -5px;
  cursor: nwse-resize;
}
</style>
