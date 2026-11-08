<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { Camera, Maximize, Pause, Play, Volume1, Volume2, VolumeX } from '@lucide/vue'

const props = defineProps({
  videoElement: { type: Object, default: null },
  keyboardActive: { type: Boolean, default: false },
  fullscreen: { type: Boolean, default: false },
  allowCapture: { type: Boolean, default: true },
  captureBusy: { type: Boolean, default: false }
})
const emit = defineEmits(['capture', 'close'])
const currentTime = ref(0)
const duration = ref(0)
const playing = ref(false)
const muted = ref(true)
const volume = ref(50)
const showFrameMenu = ref(false)
const playbackRate = ref(1)
let boundVideo = null

const progress = computed(() => duration.value > 0 ? Math.min(100, currentTime.value / duration.value * 100) : 0)

function formatTime(value) {
  const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const remainder = String(seconds % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`
}

function syncVideo() {
  if (!boundVideo) return
  currentTime.value = Number.isFinite(boundVideo.currentTime) ? boundVideo.currentTime : 0
  duration.value = Number.isFinite(boundVideo.duration) ? boundVideo.duration : 0
  playing.value = !boundVideo.paused && !boundVideo.ended
  muted.value = boundVideo.muted || boundVideo.volume === 0
  volume.value = Math.round(boundVideo.volume * 100)
  playbackRate.value = boundVideo.playbackRate
}

const videoEvents = ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'play', 'pause', 'ended', 'volumechange', 'ratechange']
function bindVideo(element) {
  if (boundVideo) videoEvents.forEach(event => boundVideo.removeEventListener(event, syncVideo))
  boundVideo = element
  if (!boundVideo) return
  if (!boundVideo.dataset.volumeInitialized) {
    boundVideo.volume = 0.5
    boundVideo.dataset.volumeInitialized = 'true'
  }
  videoEvents.forEach(event => boundVideo.addEventListener(event, syncVideo))
  syncVideo()
}
watch(() => props.videoElement, bindVideo, { immediate: true })
onUnmounted(() => bindVideo(null))

function togglePlay() {
  const video = props.videoElement
  if (!video) return
  if (video.dataset.autoplayMuted === 'true') {
    video.muted = false
    delete video.dataset.autoplayMuted
  }
  if (video.paused || video.ended) {
    if (video.ended) video.currentTime = 0
    video.play().catch(() => {})
  } else {
    video.pause()
  }
}

function handleSpaceKey(event) {
  if (!props.keyboardActive || !props.videoElement || event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (target?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target?.tagName) || (target?.tagName === 'INPUT' && target.type !== 'range')) return
  event.preventDefault()
  event.stopPropagation()
  if (!event.repeat) togglePlay()
}

function handleSpaceKeyUp(event) {
  if (!props.keyboardActive || !props.videoElement || event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (target?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target?.tagName) || (target?.tagName === 'INPUT' && target.type !== 'range')) return
  event.preventDefault()
  event.stopPropagation()
}

function handleEscapeKey(event) {
  if (!props.fullscreen || !props.keyboardActive || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleSpaceKey, true)
  window.addEventListener('keydown', handleEscapeKey, true)
  window.addEventListener('keyup', handleSpaceKeyUp, true)
  onUnmounted(() => {
    window.removeEventListener('keydown', handleSpaceKey, true)
    window.removeEventListener('keydown', handleEscapeKey, true)
    window.removeEventListener('keyup', handleSpaceKeyUp, true)
  })
}

function seek(event) {
  if (!props.videoElement || !duration.value) return
  props.videoElement.currentTime = Number(event.target.value)
  currentTime.value = props.videoElement.currentTime
}

function toggleMute() {
  const video = props.videoElement
  if (!video) return
  delete video.dataset.autoplayMuted
  if (video.muted || video.volume === 0) {
    if (video.volume === 0) video.volume = 0.5
    video.muted = false
  } else {
    video.muted = true
  }
  syncVideo()
}

function changeVolume(event) {
  const video = props.videoElement
  if (!video) return
  delete video.dataset.autoplayMuted
  video.volume = Number(event.target.value) / 100
  video.muted = video.volume === 0
  syncVideo()
}

function cyclePlaybackRate() {
  const video = props.videoElement
  if (!video) return
  const rates = [1, 1.5, 2]
  video.playbackRate = rates[(rates.indexOf(video.playbackRate) + 1) % rates.length]
  syncVideo()
}

function toggleFullscreen() {
  const overlay = props.videoElement?.closest('.fullscreen-preview-overlay')
  if (!overlay) return
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  else overlay.requestFullscreen?.().catch(() => {})
}

function capture(mode) {
  if (!props.videoElement || props.captureBusy) return
  emit('capture', { mode, time: props.videoElement.currentTime, duration: props.videoElement.duration })
  showFrameMenu.value = false
}
</script>

<template>
  <div v-if="fullscreen" class="video-playback-controls fullscreen-controls nodrag nopan" @pointerdown.stop @mousedown.stop @click.stop>
    <div class="fullscreen-controls-row">
      <button class="playback-button" type="button" :aria-label="playing ? '暂停' : '播放'" :title="playing ? '暂停（空格）' : '播放（空格）'" @click="togglePlay">
        <Pause v-if="playing" :size="16" fill="currentColor" />
        <Play v-else :size="16" fill="currentColor" />
      </button>
      <span class="fullscreen-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      <button class="speed-button" type="button" title="切换播放速度" @click="cyclePlaybackRate">{{ playbackRate }}x</button>
      <button class="playback-button" type="button" aria-label="全屏播放" title="全屏播放" @click="toggleFullscreen"><Maximize :size="16" /></button>
    </div>
    <input class="playback-progress fullscreen-progress" type="range" min="0" :max="duration || 0" step="0.01" :value="currentTime" :disabled="!duration" :style="{ '--progress': `${progress}%` }" aria-label="播放进度" @input="seek" />
  </div>
  <div v-else class="video-playback-controls nodrag nopan" @pointerdown.stop @mousedown.stop @click.stop>
    <button class="playback-button" type="button" :aria-label="playing ? '暂停' : '播放'" :title="playing ? '暂停（空格）' : '播放（空格）'" @click="togglePlay">
      <Pause v-if="playing" :size="16" fill="currentColor" />
      <Play v-else :size="16" fill="currentColor" />
    </button>
    <span class="playback-time">{{ formatTime(currentTime) }}</span>
    <input class="playback-progress" type="range" min="0" :max="duration || 0" step="0.01" :value="currentTime" :disabled="!duration" :style="{ '--progress': `${progress}%` }" aria-label="播放进度" @input="seek" />
    <span class="playback-time">{{ formatTime(duration) }}</span>
    <div class="volume-control">
      <div class="volume-popover">
        <span>{{ muted ? 0 : volume }}</span>
        <input type="range" min="0" max="100" :value="muted ? 0 : volume" aria-label="音量" @input="changeVolume" />
      </div>
      <button class="playback-button" type="button" :aria-label="muted ? '取消静音' : '静音'" :title="muted ? '取消静音' : '静音'" @click="toggleMute">
        <VolumeX v-if="muted" :size="16" />
        <Volume1 v-else-if="volume < 50" :size="16" />
        <Volume2 v-else :size="16" />
      </button>
    </div>
    <div v-if="allowCapture" class="frame-control" @mouseleave="showFrameMenu = false">
      <div class="frame-menu" :class="{ 'is-open': showFrameMenu }">
        <button type="button" :disabled="captureBusy" @click="capture('current')">截取当前帧</button>
        <button type="button" :disabled="captureBusy" @click="capture('first')">截取首帧</button>
        <button type="button" :disabled="captureBusy || !duration" @click="capture('last')">截取尾帧</button>
      </div>
      <button class="playback-button" type="button" aria-label="截取视频帧" title="截取视频帧" :aria-expanded="showFrameMenu" :disabled="captureBusy" @click="showFrameMenu = !showFrameMenu">
        <Camera :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.video-playback-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 32px 12px 10px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, .7));
  cursor: default;
}
.playback-button {
  display: flex;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: transparent;
  cursor: pointer;
}
.playback-button:hover, .playback-button:focus-visible { background: rgba(0, 0, 0, .5); }
.playback-button:focus-visible, .frame-menu button:focus-visible, input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.playback-button:disabled, .frame-menu button:disabled { opacity: .5; cursor: not-allowed; }
.fullscreen-controls { display: block; padding: 8px 16px 12px; }
.fullscreen-controls-row { display: flex; height: 32px; align-items: center; gap: 8px; }
.fullscreen-controls-row .playback-button:first-child { flex-basis: 22px; width: 22px; }
.fullscreen-time { flex: 1; font-size: 14px; font-variant-numeric: tabular-nums; }
.speed-button { height: 28px; padding: 0 8px; border: 0; border-radius: 999px; background: transparent; color: #fff; font-size: 12px; cursor: pointer; }
.speed-button:hover, .speed-button:focus-visible { background: rgba(255, 255, 255, .2); }
.speed-button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.fullscreen-progress { display: block; width: 100%; height: 12px; }
.playback-time { flex: none; font-size: 12px; line-height: 1; font-variant-numeric: tabular-nums; }
.playback-progress {
  flex: 1 1 auto;
  min-width: 20px;
  height: 14px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.playback-progress::-webkit-slider-runnable-track { height: 3px; border-radius: 999px; background: linear-gradient(to right, #fff var(--progress), rgba(255, 255, 255, .3) var(--progress)); }
.playback-progress::-moz-range-track { height: 3px; border-radius: 999px; background: linear-gradient(to right, #fff var(--progress), rgba(255, 255, 255, .3) var(--progress)); }
.playback-progress::-webkit-slider-thumb { width: 10px; height: 10px; margin-top: -3.5px; appearance: none; border: 0; border-radius: 50%; background: #fff; }
.playback-progress::-moz-range-thumb { width: 10px; height: 10px; border: 0; border-radius: 50%; background: #fff; }
.volume-control, .frame-control { position: relative; flex: none; }
.volume-popover, .frame-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 10px;
  background: rgba(26, 26, 26, .95);
  box-shadow: 0 4px 10px rgba(0, 0, 0, .25);
  opacity: 0;
  pointer-events: none;
  transition: opacity .15s ease;
}
.volume-popover::after, .frame-menu::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 8px; }
.volume-popover { left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 6px; font-size: 11px; }
.volume-popover input { writing-mode: vertical-lr; direction: rtl; width: 16px; height: 70px; margin: 0; accent-color: #fff; cursor: pointer; }
.volume-control:hover .volume-popover, .volume-control:focus-within .volume-popover,
.frame-control:hover .frame-menu, .frame-control:focus-within .frame-menu, .frame-menu.is-open { opacity: 1; pointer-events: auto; }
.frame-menu { right: 0; display: flex; flex-direction: column; gap: 4px; padding: 4px; white-space: nowrap; }
.frame-menu button { border: 0; border-radius: 7px; padding: 6px 9px; color: #fff; background: transparent; font-size: 12px; text-align: left; cursor: pointer; }
.frame-menu button:hover { background: rgba(255, 255, 255, .1); }
</style>
