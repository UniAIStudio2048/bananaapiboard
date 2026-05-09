<template>
  <section class="video-preview">
    <div
      ref="stageRef"
      class="video-preview__stage"
      :class="{ 'video-preview__stage--fine': mode === 'fine' }"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <video
        v-if="clip?.url"
        ref="videoRef"
        class="video-preview__video"
        :src="clip.url"
        controls
        playsinline
        muted
      />
      <div v-else class="video-preview__empty">选择视频片段</div>
      <div v-if="mode === 'fine' && selectionStyle" class="video-preview__selection" :style="selectionStyle" />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { normalizePreviewRectToVideo } from '@/utils/videoToolRect'

const props = defineProps({
  clip: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'standard'
  }
})

const emit = defineEmits(['update:detectRect'])

const stageRef = ref(null)
const videoRef = ref(null)
const dragStart = ref(null)
const dragCurrent = ref(null)

const selectionStyle = computed(() => {
  if (!dragStart.value || !dragCurrent.value) return null
  const left = Math.min(dragStart.value.x, dragCurrent.value.x)
  const top = Math.min(dragStart.value.y, dragCurrent.value.y)
  const width = Math.abs(dragCurrent.value.x - dragStart.value.x)
  const height = Math.abs(dragCurrent.value.y - dragStart.value.y)
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`
  }
})

function getLocalPoint(event) {
  const stageBox = stageRef.value?.getBoundingClientRect()
  if (!stageBox) return null
  return {
    x: Math.min(stageBox.width, Math.max(0, event.clientX - stageBox.left)),
    y: Math.min(stageBox.height, Math.max(0, event.clientY - stageBox.top))
  }
}

function getVideoBox() {
  const stageBox = stageRef.value?.getBoundingClientRect()
  const videoBox = videoRef.value?.getBoundingClientRect()
  if (!stageBox || !videoBox) return null
  return {
    x: videoBox.left - stageBox.left,
    y: videoBox.top - stageBox.top,
    width: videoBox.width,
    height: videoBox.height
  }
}

function handlePointerDown(event) {
  if (props.mode !== 'fine' || !props.clip?.url) return
  const point = getLocalPoint(event)
  if (!point) return
  stageRef.value?.setPointerCapture?.(event.pointerId)
  dragStart.value = point
  dragCurrent.value = point
}

function handlePointerMove(event) {
  if (!dragStart.value || props.mode !== 'fine') return
  const point = getLocalPoint(event)
  if (point) dragCurrent.value = point
}

function handlePointerUp(event) {
  if (!dragStart.value || !dragCurrent.value || props.mode !== 'fine') return
  stageRef.value?.releasePointerCapture?.(event.pointerId)
  const videoBox = getVideoBox()
  const selection = {
    x: dragStart.value.x,
    y: dragStart.value.y,
    width: dragCurrent.value.x - dragStart.value.x,
    height: dragCurrent.value.y - dragStart.value.y
  }
  if (videoBox && Math.abs(selection.width) > 4 && Math.abs(selection.height) > 4) {
    emit('update:detectRect', normalizePreviewRectToVideo({ selection, videoBox }))
  }
}
</script>

<style scoped>
.video-preview {
  min-height: 0;
  display: grid;
  place-items: center;
}

.video-preview__stage {
  position: relative;
  width: min(100%, 960px);
  height: min(58vh, 560px);
  border: 1px solid #27272a;
  background: #050505;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.video-preview__stage--fine {
  cursor: crosshair;
}

.video-preview__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-preview__empty {
  color: #71717a;
  font-size: 14px;
}

.video-preview__selection {
  position: absolute;
  border: 1px solid #f5f5f5;
  background: rgba(255, 255, 255, 0.14);
  pointer-events: none;
}
</style>
