<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Check, Keyboard, Loader2, Magnet, Pause, Play, Repeat, X } from '@lucide/vue'
import { adjustClipRangeByKey, getClipBarPosition, initialClipRange, moveClipRange, resizeClipRange } from '@/utils/videoSegmentClip'

const props = defineProps({
  videoElement: { type: Object, default: null },
  anchorElement: { type: Object, default: null },
  videoUrl: { type: String, required: true },
  posterUrl: { type: String, default: '' },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['cancel', 'confirm'])

const track = ref(null)
const bar = ref(null)
const position = ref(null)
const duration = ref(0)
const range = ref({ start: 0, end: 0 })
const currentTime = ref(0)
const playing = ref(false)
const snap = ref(false)
const loop = ref(true)
const shiftPressed = ref(false)
const showShortcuts = ref(false)
const thumbnails = ref([])
const thumbnailState = ref('loading')
let video = null
let previousVideoLoop = null
let drag = null
let frameVideo = null
let cancelled = false
let animationFrame = 0
let positionFrame = 0

const ready = computed(() => duration.value > 0 && !props.busy)
const percent = value => duration.value ? Math.max(0, Math.min(100, value / duration.value * 100)) : 0
const startPercent = computed(() => percent(range.value.start))
const endPercent = computed(() => percent(range.value.end))
const playheadPercent = computed(() => percent(currentTime.value))
const selectionDuration = computed(() => Math.max(0, range.value.end - range.value.start))
const ticks = computed(() => {
  if (!shiftPressed.value || duration.value <= 0) return []
  const count = Math.min(Math.floor(duration.value * 2), 200)
  return Array.from({ length: count }, (_, index) => (index + 1) * 0.5).filter(time => time < duration.value)
})

function setDuration(value) {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0 || Math.abs(next - duration.value) < 0.001) return
  duration.value = next
  range.value = initialClipRange(next)
}

function updateTime() {
  if (!video) return
  if (loop.value && !video.paused && video.currentTime >= range.value.end) video.currentTime = range.value.start
  currentTime.value = video.currentTime || 0
}

function animatePlayhead() {
  cancelAnimationFrame(animationFrame)
  if (!video || video.paused) return
  updateTime()
  animationFrame = requestAnimationFrame(animatePlayhead)
}

function handlePlay() {
  playing.value = true
  if (loop.value && video && (video.currentTime < range.value.start || video.currentTime >= range.value.end)) seek(range.value.start)
  animatePlayhead()
}
function handlePause() { playing.value = false; cancelAnimationFrame(animationFrame); updateTime() }
function handleMetadata() { setDuration(video?.duration); updateTime() }
function handleEnded() {
  playing.value = false
  if (video && loop.value && range.value.end > range.value.start) {
    seek(range.value.start)
    video.play().catch(() => {})
  } else updateTime()
}

function bindVideo(element) {
  if (video) {
    video.removeEventListener('loadedmetadata', handleMetadata)
    video.removeEventListener('timeupdate', updateTime)
    video.removeEventListener('play', handlePlay)
    video.removeEventListener('pause', handlePause)
    video.removeEventListener('ended', handleEnded)
    video.loop = previousVideoLoop
  }
  cancelAnimationFrame(animationFrame)
  video = element
  if (!video) return
  previousVideoLoop = video.loop
  video.loop = false
  video.addEventListener('loadedmetadata', handleMetadata)
  video.addEventListener('timeupdate', updateTime)
  video.addEventListener('play', handlePlay)
  video.addEventListener('pause', handlePause)
  video.addEventListener('ended', handleEnded)
  handleMetadata()
  playing.value = !video.paused
  if (playing.value) animatePlayhead()
}
watch(() => props.videoElement, bindVideo, { immediate: true })

function seek(time) {
  if (!video || !Number.isFinite(time)) return
  video.currentTime = Math.max(0, Math.min(duration.value, time))
  currentTime.value = video.currentTime
}

function togglePlay() {
  if (!video || !ready.value) return
  if (!video.paused) return video.pause()
  if (loop.value && (video.currentTime < range.value.start || video.currentTime >= range.value.end)) seek(range.value.start)
  video.play().catch(() => {})
}

function toggleSnap() {
  snap.value = !snap.value
  if (!snap.value || duration.value < 1) return
  const maxWholeSecond = Math.floor(duration.value)
  const minimum = 1
  const maxStart = Math.max(0, maxWholeSecond - minimum)
  const start = Math.max(0, Math.min(maxStart, Math.round(range.value.start)))
  const end = Math.max(start + minimum, Math.min(maxWholeSecond, Math.round(range.value.end)))
  range.value = { start, end }
  if (video) seek(start)
}

function timeAt(clientX) {
  const rect = track.value?.getBoundingClientRect()
  if (!rect?.width) return 0
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration.value
}

function startDrag(event, type) {
  if (!ready.value) return
  drag = { type, origin: timeAt(event.clientX), range: { ...range.value } }
}

function onPointerMove(event) {
  if (!drag || !ready.value) return
  const time = timeAt(event.clientX)
  if (drag.type === 'region') {
    range.value = moveClipRange(drag.range, duration.value, time - drag.origin, snap.value)
    seek(range.value.start)
  } else {
    range.value = resizeClipRange(range.value, duration.value, drag.type, time, snap.value)
    if (drag.type === 'start') seek(range.value.start)
  }
}

function onPointerUp() { drag = null }

function handleKey(event) {
  if (event.key === 'Shift') shiftPressed.value = true
  const target = event.target
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return
  const isSpaceKey = event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar' || event.code === 'Space'
  if ((event.key === 'Enter' || isSpaceKey) && target?.closest?.('button')) return
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); if (!props.busy) emit('cancel'); return
  }
  if (!ready.value) return
  if (event.key === 'Enter') {
    event.preventDefault(); event.stopPropagation(); emit('confirm', { ...range.value }); return
  }
  if (isSpaceKey) {
    event.preventDefault(); event.stopPropagation(); togglePlay(); return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'i', 'I', 'o', 'O'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  range.value = adjustClipRangeByKey(range.value, duration.value, event.key, video?.currentTime || 0, event.metaKey || event.ctrlKey)
  if (['ArrowLeft', 'ArrowRight', 'i', 'I'].includes(event.key)) seek(range.value.start)
}

function handleKeyUp(event) { if (event.key === 'Shift') shiftPressed.value = false }
function handleBlur() { shiftPressed.value = false }

function updatePosition() {
  if (props.anchorElement?.isConnected && bar.value) {
    const next = getClipBarPosition(props.anchorElement.getBoundingClientRect(), window.innerWidth, window.innerHeight, bar.value.offsetHeight)
    if (!position.value || Object.keys(next).some(key => next[key] !== position.value[key])) position.value = next
  }
  positionFrame = requestAnimationFrame(updatePosition)
}

function waitForVideoEvent(element, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('视频缩略图加载超时')), 5000)
    const success = () => finish()
    const failure = () => finish(new Error('视频缩略图不可用'))
    function finish(error) {
      clearTimeout(timer)
      element.removeEventListener(name, success)
      element.removeEventListener('error', failure)
      error ? reject(error) : resolve()
    }
    element.addEventListener(name, success, { once: true })
    element.addEventListener('error', failure, { once: true })
  })
}

async function loadThumbnails() {
  const element = document.createElement('video')
  frameVideo = element
  element.crossOrigin = 'anonymous'
  element.muted = true
  element.preload = 'auto'
  try {
    const metadata = waitForVideoEvent(element, 'loadedmetadata')
    element.src = props.videoUrl
    await metadata
    if (cancelled) return
    setDuration(element.duration)
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = Math.max(1, Math.round(120 * (element.videoHeight || 9) / (element.videoWidth || 16)))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法读取视频画面')
    const frames = []
    for (let index = 0; index < 12 && !cancelled; index++) {
      const target = Math.min(element.duration - 0.001, (index + 0.5) / 12 * element.duration)
      const sought = waitForVideoEvent(element, 'seeked')
      element.currentTime = Math.max(0, target)
      await sought
      context.drawImage(element, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', 0.65))
      thumbnails.value = [...frames]
    }
    if (!cancelled) thumbnailState.value = frames.length ? 'ready' : 'unavailable'
  } catch {
    if (!cancelled) thumbnailState.value = 'unavailable'
  } finally {
    element.removeAttribute('src')
    element.load()
    if (frameVideo === element) frameVideo = null
  }
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', handleKey, true)
  window.addEventListener('keyup', handleKeyUp, true)
  window.addEventListener('blur', handleBlur)
  updatePosition()
  loadThumbnails()
})
onUnmounted(() => {
  cancelled = true
  if (frameVideo) { frameVideo.removeAttribute('src'); frameVideo.load() }
  bindVideo(null)
  cancelAnimationFrame(positionFrame)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('keydown', handleKey, true)
  window.removeEventListener('keyup', handleKeyUp, true)
  window.removeEventListener('blur', handleBlur)
})
</script>

<template>
  <div ref="bar" class="segment-clip-bar nodrag nopan" :style="position ? { left: position.left + 'px', top: position.top + 'px', width: position.width + 'px' } : { visibility: 'hidden' }" @pointerdown.stop @click.stop @wheel.stop>
    <div v-if="showShortcuts" class="shortcuts" role="dialog" aria-label="片段截取快捷键">
      <div class="shortcuts-heading"><strong>快捷键</strong><button type="button" title="关闭快捷键" @click="showShortcuts = false"><X :size="16" /></button></div>
      <div class="shortcuts-grid">
        <span>移动选区 <kbd>←</kbd> <kbd>→</kbd></span><span>精确刻度 <kbd>Shift</kbd></span>
        <span>扩展/收缩选区 <kbd>↑</kbd> <kbd>↓</kbd></span><span>快速调整 <kbd>⌘ / Ctrl</kbd> + 方向键</span>
        <span>设置出点入点 <kbd>I</kbd> <kbd>O</kbd></span><span>播放/暂停 <kbd>Space</kbd></span>
        <span>退出 <kbd>Esc</kbd></span><span>确认剪辑 <kbd>Enter</kbd></span>
      </div>
    </div>
    <div class="clip-controls">
      <button type="button" class="clip-icon" data-tooltip="取消截取" aria-label="取消截取" :disabled="busy" @click="emit('cancel')"><X :size="18" /></button>
      <span class="divider"></span>
      <button type="button" class="clip-icon" data-tooltip="快捷键" aria-label="快捷键" :aria-pressed="showShortcuts" @click="showShortcuts = !showShortcuts"><Keyboard :size="18" /></button>
      <button type="button" class="clip-icon" :data-tooltip="playing ? '暂停' : '播放'" :aria-label="playing ? '暂停' : '播放'" :disabled="!ready" @click="togglePlay"><Pause v-if="playing" :size="17" /><Play v-else :size="17" /></button>
      <div ref="track" class="clip-track" :class="{ disabled: !ready }" aria-label="视频片段时间轴" @pointerdown.stop.prevent="ready && seek(timeAt($event.clientX))">
        <div class="frames">
          <img v-for="(frame, index) in thumbnails" :key="index" :src="frame" alt="视频缩略图" draggable="false" />
          <img v-if="!thumbnails.length && posterUrl" :src="posterUrl" alt="视频封面" draggable="false" />
          <span v-if="!thumbnails.length && !posterUrl">{{ thumbnailState === 'loading' ? '正在加载视频缩略图' : '视频缩略图不可用' }}</span>
        </div>
        <div class="track-mask" :style="{ width: startPercent + '%' }"></div>
        <div class="track-mask right" :style="{ width: (100 - endPercent) + '%' }"></div>
        <div v-for="tick in ticks" :key="tick" class="track-tick" :style="{ left: percent(tick) + '%' }"></div>
        <div class="clip-selection" :style="{ left: startPercent + '%', width: (endPercent - startPercent) + '%' }" @pointerdown.stop.prevent="startDrag($event, 'region')">
          <span class="clip-length">{{ selectionDuration.toFixed(2) }} s</span>
        </div>
        <div class="clip-handle start" :style="{ left: startPercent + '%' }" role="slider" title="拖动设置开始时间" aria-label="截取开始时间" :aria-valuenow="range.start" :aria-valuemin="0" :aria-valuemax="range.end" tabindex="0" @pointerdown.stop.prevent="startDrag($event, 'start')"><span></span></div>
        <div class="clip-handle end" :style="{ left: endPercent + '%' }" role="slider" title="拖动设置结束时间" aria-label="截取结束时间" :aria-valuenow="range.end" :aria-valuemin="range.start" :aria-valuemax="duration" tabindex="0" @pointerdown.stop.prevent="startDrag($event, 'end')"><span></span></div>
        <div class="playhead" :style="{ left: playheadPercent + '%' }"></div>
      </div>
      <button type="button" class="clip-icon" :class="{ active: snap }" :data-tooltip="snap ? '关闭整数秒吸附' : '开启整数秒吸附'" :aria-label="snap ? '关闭整数秒吸附' : '开启整数秒吸附'" :aria-pressed="snap" :disabled="!ready" @click="toggleSnap"><span class="toggle-symbol" :class="{ 'is-off': !snap }"><Magnet :size="18" /></span></button>
      <button type="button" class="clip-icon tooltip-right" :class="{ active: loop }" :data-tooltip="loop ? '关闭选区循环播放' : '开启选区循环播放'" :aria-label="loop ? '关闭选区循环播放' : '开启选区循环播放'" :aria-pressed="loop" :disabled="!ready" @click="loop = !loop"><span class="toggle-symbol" :class="{ 'is-off': !loop }"><Repeat :size="18" /></span></button>
      <button type="button" class="clip-confirm tooltip-right" data-tooltip="确认截取" aria-label="确认截取" :disabled="!ready" @click="emit('confirm', { ...range })"><Loader2 v-if="busy" :size="20" class="spin" /><Check v-else :size="20" /></button>
    </div>
  </div>
</template>

<style scoped>
.segment-clip-bar { position: fixed; z-index: 1001; color: var(--canvas-text-primary); user-select: none; }
.clip-controls { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--canvas-border-default); border-radius: 18px; background: var(--canvas-bg-elevated); box-shadow: var(--canvas-shadow-md); }
.clip-icon, .clip-confirm, .shortcuts-heading button { position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 36px; height: 36px; border: 0; border-radius: 9px; background: transparent; color: var(--canvas-text-primary); cursor: pointer; }
.clip-icon:hover, .clip-icon.active, .shortcuts-heading button:hover { background: var(--canvas-border-subtle); }
.clip-icon:focus-visible, .clip-confirm:focus-visible, .clip-handle:focus-visible { outline: 2px solid var(--canvas-text-primary); outline-offset: 2px; }
.clip-icon:disabled, .clip-confirm:disabled { opacity: .45; cursor: not-allowed; }
.clip-confirm { width: 42px; height: 42px; background: var(--canvas-text-primary); color: var(--canvas-bg-primary); }
[data-tooltip]::after { content: attr(data-tooltip); position: absolute; z-index: 2; bottom: calc(100% + 9px); left: 50%; transform: translateX(-50%); padding: 5px 8px; border: 1px solid var(--canvas-border-default); border-radius: 6px; background: var(--canvas-bg-elevated); color: var(--canvas-text-primary); box-shadow: var(--canvas-shadow-md); font-size: 12px; line-height: 1.3; white-space: nowrap; opacity: 0; visibility: hidden; pointer-events: none; }
[data-tooltip]:hover::after, [data-tooltip]:focus-visible::after { opacity: 1; visibility: visible; }
.tooltip-right::after { left: auto; right: 0; transform: none; }
.toggle-symbol { display: inline-flex; position: relative; }
.toggle-symbol.is-off::after { content: ''; position: absolute; left: -2px; top: 8px; width: 22px; height: 1.5px; background: currentColor; box-shadow: 0 0 0 1px var(--canvas-bg-elevated); transform: rotate(-45deg); }
.divider { width: 1px; height: 24px; background: var(--canvas-border-default); }
.clip-track { position: relative; height: 52px; flex: 1; min-width: 0; overflow: hidden; border-radius: 9px; background: #151515; cursor: pointer; touch-action: none; }
.clip-track.disabled { opacity: .55; cursor: wait; }
.frames { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; color: #ddd; font-size: 12px; }
.frames img { flex: 1; min-width: 0; width: 0; height: 100%; object-fit: cover; }
.frames img:only-child { width: 100%; }
.track-mask { position: absolute; inset: 0 auto 0 0; background: rgba(0,0,0,.55); pointer-events: none; }
.track-mask.right { inset: 0 0 0 auto; }
.clip-selection { position: absolute; top: 0; bottom: 0; box-sizing: border-box; border: 2px solid #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: grab; }
.clip-selection:active { cursor: grabbing; }
.clip-length { padding: 4px 9px; border-radius: 8px; background: rgba(0,0,0,.72); color: white; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; }
.clip-handle { position: absolute; top: 0; bottom: 0; width: 14px; display: flex; align-items: center; justify-content: center; background: #fff; cursor: col-resize; touch-action: none; }
.clip-handle.start { transform: translateX(0); border-radius: 8px 0 0 8px; }
.clip-handle.end { transform: translateX(-100%); border-radius: 0 8px 8px 0; }
.clip-handle span { width: 2px; height: 15px; border-radius: 2px; background: #555; }
.playhead, .track-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: white; pointer-events: none; }
.playhead { width: 2px; box-shadow: 0 0 4px #000; }
.track-tick { background: rgba(255,255,255,.55); }
.shortcuts { position: absolute; bottom: calc(100% + 10px); left: 0; width: 520px; padding: 16px; border: 1px solid var(--canvas-border-default); border-radius: 14px; background: var(--canvas-bg-elevated); box-shadow: var(--canvas-shadow-lg); font-size: 13px; }
.shortcuts-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.shortcuts-heading button { width: 26px; height: 26px; }
.shortcuts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; color: var(--canvas-text-secondary); }
kbd { margin-left: 4px; padding: 3px 6px; border: 1px solid var(--canvas-border-default); border-radius: 5px; color: var(--canvas-text-primary); font: inherit; }
.spin { animation: segment-spin 1s linear infinite; }
@keyframes segment-spin { to { transform: rotate(360deg); } }
</style>
