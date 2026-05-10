<template>
  <section class="video-timeline" ref="timelineRef">
    <!-- 时间刻度尺 -->
    <div
      class="video-timeline__ruler"
      ref="rulerRef"
      @pointerdown="handleRulerScrubStart"
    >
      <div class="video-timeline__ruler-inner" :style="{ width: rulerWidth + 'px', marginLeft: TRACK_LABEL_WIDTH + 'px' }">
        <div
          v-for="tick in ticks"
          :key="tick.time"
          class="video-timeline__tick"
          :class="{ major: tick.major }"
          :style="{ left: tick.left + 'px' }"
        >
          <span v-if="tick.major" class="video-timeline__tick-label">{{ tick.label }}</span>
        </div>
        <!-- 播放头指示器 -->
        <div
          class="video-timeline__playhead"
          :style="{ left: playheadLeft + 'px' }"
        >
          <div class="video-timeline__playhead-head" />
          <div class="video-timeline__playhead-line" />
        </div>
      </div>
    </div>

    <!-- 光标移动轴 -->
    <div
      class="video-timeline__scrubber"
      ref="scrubberRef"
      @pointerdown="handleScrubStart"
    >
      <div class="video-timeline__scrubber-track" :style="{ width: rulerWidth + 'px', marginLeft: TRACK_LABEL_WIDTH + 'px' }">
        <div class="video-timeline__scrubber-progress" :style="{ width: playheadLeft + 'px' }" />
        <div class="video-timeline__scrubber-thumb" :style="{ left: playheadLeft + 'px' }" />
      </div>
    </div>

    <!-- 轨道区域 -->
    <div
      class="video-timeline__tracks"
      ref="tracksRef"
      @pointerdown="handleTrackScrubStart"
      @dragover="handleExternalDragOver"
      @dragleave="handleExternalDragLeave"
      @drop="handleExternalDrop"
      :class="{ 'video-timeline__tracks--drag-over': isExternalDragOver }"
    >
      <!-- 视频轨道 -->
      <div class="video-timeline__track-row">
        <div class="video-timeline__track-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div class="video-timeline__track-content" :style="{ width: rulerWidth + 'px' }">
          <div
            v-for="(clip, index) in clips"
            :key="clip.id || `clip-${index}`"
            class="video-timeline__clip"
            :class="{ active: index === selectedIndex }"
            :style="getClipStyle(clip, index)"
            draggable="true"
            @click="$emit('select', index)"
            @dragstart="handleDragStart(index)"
            @dragover.prevent
            @drop="handleDrop(index)"
          >
            <span class="video-timeline__clip-duration">{{ formatClipDuration(clip) }}</span>
            <span class="video-timeline__clip-name">{{ clip.name || `片段 ${index + 1}` }}</span>
            <button
              type="button"
              class="video-timeline__clip-remove"
              title="移除"
              @click.stop="removeClip(index)"
            >×</button>
          </div>
          <div v-if="clips.length === 0" class="video-timeline__empty">从左侧添加视频到时间轴</div>
        </div>
      </div>

      <!-- 音频轨道（占位） -->
      <div class="video-timeline__track-row video-timeline__track-row--audio">
        <div class="video-timeline__track-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        </div>
        <div class="video-timeline__track-content video-timeline__track-content--empty" :style="{ width: rulerWidth + 'px' }">
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  clips: {
    type: Array,
    default: () => []
  },
  selectedIndex: {
    type: Number,
    default: 0
  },
  totalSeconds: {
    type: Number,
    default: 0
  },
  currentTime: {
    type: Number,
    default: 0
  },
  zoom: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['update:clips', 'select', 'seek', 'add-source', 'update:zoom'])
const draggingIndex = ref(-1)
const isExternalDragOver = ref(false)
const rulerRef = ref(null)
const tracksRef = ref(null)
const scrubberRef = ref(null)
const timelineRef = ref(null)
const isScrubbing = ref(false)
const viewportWidth = ref(800)

const PIXELS_PER_SECOND = computed(() => 50 * props.zoom)
const TRACK_LABEL_WIDTH = 32

const visibleDurationSeconds = computed(() => Math.max(1, viewportWidth.value / PIXELS_PER_SECOND.value))
const contentTotal = computed(() => props.totalSeconds || 0)
const effectiveTotal = computed(() => {
  const extraBuffer = visibleDurationSeconds.value * 2
  return Math.max(contentTotal.value + extraBuffer, visibleDurationSeconds.value * 3)
})
const rulerWidth = computed(() => effectiveTotal.value * PIXELS_PER_SECOND.value)

const ticks = computed(() => {
  const result = []
  const total = effectiveTotal.value
  const pps = PIXELS_PER_SECOND.value
  const interval = pps >= 80 ? 1 : pps >= 40 ? 2 : 5
  for (let t = 0; t <= total; t += interval) {
    result.push({
      time: t,
      left: t * pps,
      major: t % (interval * 5 === 0 ? 5 : (interval <= 2 ? 5 : 10)) === 0 || t === 0,
      label: formatTickLabel(t)
    })
  }
  return result
})

const playheadLeft = computed(() => props.currentTime * PIXELS_PER_SECOND.value)



function autoScrollEdge(el, clientX) {
  const rect = el.getBoundingClientRect()
  const edgeZone = 50
  const maxSpeed = 20
  if (clientX > rect.right - edgeZone) {
    const factor = Math.min(1, (clientX - (rect.right - edgeZone)) / edgeZone)
    el.scrollLeft += maxSpeed * factor
  } else if (clientX < rect.left + edgeZone) {
    const factor = Math.min(1, ((rect.left + edgeZone) - clientX) / edgeZone)
    el.scrollLeft -= maxSpeed * factor
  }
}

function seekFromScrubber(clientX) {
  const el = scrubberRef.value
  if (!el) return
  if (isScrubbing.value) autoScrollEdge(el, clientX)
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left - TRACK_LABEL_WIDTH + el.scrollLeft) / rulerWidth.value))
  const time = ratio * effectiveTotal.value
  emit('seek', time)
}

function seekFromRuler(clientX) {
  const el = rulerRef.value
  if (!el) return
  if (isScrubbing.value) autoScrollEdge(el, clientX)
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left - TRACK_LABEL_WIDTH + el.scrollLeft) / rulerWidth.value))
  const time = ratio * effectiveTotal.value
  emit('seek', time)
}

function seekFromTracks(clientX) {
  const el = tracksRef.value
  if (!el) return
  if (isScrubbing.value) autoScrollEdge(el, clientX)
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left - TRACK_LABEL_WIDTH + el.scrollLeft) / rulerWidth.value))
  const time = ratio * effectiveTotal.value
  emit('seek', time)
}

function handleScrubStart(e) {
  isScrubbing.value = true
  seekFromScrubber(e.clientX)
  const onMove = (ev) => seekFromScrubber(ev.clientX)
  const onUp = () => {
    isScrubbing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function handleRulerScrubStart(e) {
  isScrubbing.value = true
  seekFromRuler(e.clientX)
  const onMove = (ev) => seekFromRuler(ev.clientX)
  const onUp = () => {
    isScrubbing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function handleTrackScrubStart(e) {
  if (e.target.closest('.video-timeline__clip') || e.target.closest('.video-timeline__clip-remove')) return
  isScrubbing.value = true
  seekFromTracks(e.clientX)
  const onMove = (ev) => seekFromTracks(ev.clientX)
  const onUp = () => {
    isScrubbing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function formatTickLabel(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatClipDuration(clip) {
  const dur = Math.max(0, (clip.endTime || 0) - (clip.startTime || 0))
  return `${dur.toFixed(1)}s`
}

function getClipStyle(clip, index) {
  const pps = PIXELS_PER_SECOND.value
  let offset = 0
  for (let i = 0; i < index; i++) {
    const c = props.clips[i]
    offset += Math.max(0, (c.endTime || 0) - (c.startTime || 0))
  }
  const duration = Math.max(0, (clip.endTime || 0) - (clip.startTime || 0))
  return {
    left: `${offset * pps}px`,
    width: `${Math.max(60, duration * pps)}px`
  }
}

function removeClip(index) {
  emit('update:clips', props.clips.filter((_, i) => i !== index))
}

function handleDragStart(index) {
  draggingIndex.value = index
}

function handleDrop(index) {
  const from = draggingIndex.value
  draggingIndex.value = -1
  if (from < 0 || from === index) return
  const next = [...props.clips]
  const [clip] = next.splice(from, 1)
  next.splice(index, 0, clip)
  emit('update:clips', next)
}

function handleExternalDragOver(e) {
  if (e.dataTransfer.types.includes('application/video-source')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    isExternalDragOver.value = true
  }
}

function handleExternalDragLeave() {
  isExternalDragOver.value = false
}

function handleExternalDrop(e) {
  isExternalDragOver.value = false
  const raw = e.dataTransfer.getData('application/video-source')
  if (!raw) return
  e.preventDefault()
  try {
    const source = JSON.parse(raw)
    emit('add-source', source)
  } catch { /* ignore */ }
}

let syncingScroll = false
function syncScroll(source) {
  if (syncingScroll) return
  syncingScroll = true
  const left = source.scrollLeft
  const targets = [rulerRef.value, scrubberRef.value, tracksRef.value].filter(el => el && el !== source)
  targets.forEach(el => { el.scrollLeft = left })
  syncingScroll = false
}

function onRulerScroll() { syncScroll(rulerRef.value) }
function onScrubberScroll() { syncScroll(scrubberRef.value) }
function onTracksScroll() { syncScroll(tracksRef.value) }

function handleWheel(e) {
  e.preventDefault()

  if (e.shiftKey) {
    const scrollEl = tracksRef.value || rulerRef.value
    if (scrollEl) {
      const newLeft = scrollEl.scrollLeft + e.deltaY
      const targets = [rulerRef.value, scrubberRef.value, tracksRef.value].filter(Boolean)
      targets.forEach(el => { el.scrollLeft = newLeft })
    }
    return
  }

  const delta = e.deltaY > 0 ? -0.15 : 0.15
  const newZoom = Math.min(5, Math.max(0.1, props.zoom + delta))

  const scrollEl = tracksRef.value || rulerRef.value
  if (!scrollEl) {
    emit('update:zoom', newZoom)
    return
  }

  const rect = scrollEl.getBoundingClientRect()
  const mouseXInContainer = e.clientX - rect.left - TRACK_LABEL_WIDTH + scrollEl.scrollLeft
  const timeAtCursor = mouseXInContainer / PIXELS_PER_SECOND.value

  emit('update:zoom', newZoom)

  requestAnimationFrame(() => {
    const newPps = 50 * newZoom
    const newScrollLeft = timeAtCursor * newPps - (e.clientX - rect.left - TRACK_LABEL_WIDTH)
    const targets = [rulerRef.value, scrubberRef.value, tracksRef.value].filter(Boolean)
    targets.forEach(el => { el.scrollLeft = Math.max(0, newScrollLeft) })
  })
}

let resizeObserver = null

function updateViewportWidth() {
  const el = timelineRef.value
  if (el) viewportWidth.value = el.clientWidth - TRACK_LABEL_WIDTH
}

onMounted(() => {
  rulerRef.value?.addEventListener('scroll', onRulerScroll)
  scrubberRef.value?.addEventListener('scroll', onScrubberScroll)
  tracksRef.value?.addEventListener('scroll', onTracksScroll)

  const el = timelineRef.value
  if (el) {
    el.addEventListener('wheel', handleWheel, { passive: false })
    updateViewportWidth()
    resizeObserver = new ResizeObserver(updateViewportWidth)
    resizeObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  rulerRef.value?.removeEventListener('scroll', onRulerScroll)
  scrubberRef.value?.removeEventListener('scroll', onScrubberScroll)
  tracksRef.value?.removeEventListener('scroll', onTracksScroll)
  timelineRef.value?.removeEventListener('wheel', handleWheel)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.video-timeline {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  background: #111114;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid #1e1e22;
}

/* 时间刻度尺 */
.video-timeline__ruler {
  height: 28px;
  background: #18181c;
  border-bottom: 1px solid #1e1e22;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  cursor: pointer;
}

.video-timeline__ruler::-webkit-scrollbar {
  display: none;
}

.video-timeline__ruler-inner {
  position: relative;
  height: 100%;
  min-width: 100%;
}

.video-timeline__tick {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: #2a2a30;
}

.video-timeline__tick.major {
  background: #3a3a42;
}

.video-timeline__tick-label {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 10px;
  color: #71717a;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

/* 播放头 */
.video-timeline__playhead {
  position: absolute;
  top: 0;
  z-index: 10;
  cursor: col-resize;
  padding: 0 4px;
  margin-left: -4px;
}

.video-timeline__playhead-head {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #fff;
  margin-left: -6px;
}

.video-timeline__playhead-line {
  width: 2px;
  height: 200px;
  background: #fff;
  margin-left: -1px;
  opacity: 0.7;
}

/* 轨道区域 */
.video-timeline__tracks {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.video-timeline__tracks::-webkit-scrollbar {
  display: none;
}

.video-timeline__track-row {
  display: flex;
  min-height: 44px;
  border-bottom: 1px solid #1e1e22;
}

.video-timeline__track-row--audio {
  min-height: 36px;
  opacity: 0.5;
}

.video-timeline__track-label {
  width: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #141418;
  border-right: 1px solid #1e1e22;
  color: #71717a;
}

.video-timeline__track-content {
  position: relative;
  min-width: 100%;
  min-height: 44px;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 49px,
    #1a1a1f 49px,
    #1a1a1f 50px
  );
}

.video-timeline__track-content--empty {
  min-height: 36px;
}

/* 片段条 */
.video-timeline__clip {
  position: absolute;
  top: 4px;
  bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: linear-gradient(135deg, #0d9488, #14b8a6);
  border-radius: 4px;
  cursor: grab;
  overflow: hidden;
  transition: box-shadow 0.15s ease, filter 0.15s ease;
  user-select: none;
}

.video-timeline__clip:hover {
  filter: brightness(1.1);
}

.video-timeline__clip.active {
  box-shadow: 0 0 0 2px #fff, 0 0 12px rgba(255, 255, 255, 0.15);
}

.video-timeline__clip-duration {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.video-timeline__clip-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.video-timeline__clip-remove {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.video-timeline__clip:hover .video-timeline__clip-remove {
  opacity: 1;
}

.video-timeline__clip-remove:hover {
  background: rgba(239, 68, 68, 0.6);
  color: #fff;
}

.video-timeline__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #52525b;
  font-size: 12px;
  pointer-events: none;
}

.video-timeline__tracks--drag-over {
  outline: 2px dashed #14b8a6;
  outline-offset: -2px;
  background: rgba(20, 184, 166, 0.05);
}

/* 光标移动轴 */
.video-timeline__scrubber {
  height: 24px;
  flex-shrink: 0;
  background: #0d0d10;
  border-bottom: 1px solid #1e1e22;
  overflow-x: auto;
  overflow-y: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.video-timeline__scrubber::-webkit-scrollbar {
  display: none;
}

.video-timeline__scrubber-track {
  position: relative;
  height: 6px;
  min-width: 100%;
  background: #2a2a30;
  border-radius: 3px;
}

.video-timeline__scrubber-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  max-width: 100%;
  background: linear-gradient(90deg, #0d9488, #14b8a6);
  border-radius: 3px 0 0 3px;
  pointer-events: none;
}

.video-timeline__scrubber-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: #fff;
  border: 2px solid #14b8a6;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 6px rgba(20, 184, 166, 0.4);
  pointer-events: none;
}

.video-timeline__scrubber:hover .video-timeline__scrubber-thumb {
  transform: translate(-50%, -50%) scale(1.2);
}

.video-timeline__scrubber:active .video-timeline__scrubber-thumb {
  transform: translate(-50%, -50%) scale(1.3);
  box-shadow: 0 0 10px rgba(20, 184, 166, 0.6);
}
</style>
