<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  audioUrl: { type: String, required: true },
  title: { type: String, default: '音频' },
  duration: { type: Number, default: 0 }
})

const emit = defineEmits(['close', 'submit'])

const audioRef = ref(null)
const timelineRef = ref(null)
const loadedDuration = ref(props.duration || 0)
const currentTime = ref(0)
const isPlaying = ref(false)
const showAdvanced = ref(false)
const startTime = ref(0)
const endTime = ref(Math.min(props.duration || 2, 2))
const volume = ref(1)
const pitch = ref(0)
const speed = ref(1)
const fadeIn = ref(0)
const fadeOut = ref(0)
const format = ref('mp3')
const dragState = ref(null)

const waveformBars = Array.from({ length: 72 }, (_, index) => 18 + ((index * 17 + index % 5 * 9) % 54))
const maxDuration = computed(() => loadedDuration.value || props.duration || 0)
const clipDuration = computed(() => Math.max(0, endTime.value - startTime.value))
const canSubmit = computed(() => props.audioUrl && clipDuration.value > 0)
const selectionStyle = computed(() => {
  const duration = maxDuration.value || 1
  return {
    left: `${(startTime.value / duration) * 100}%`,
    width: `${(clipDuration.value / duration) * 100}%`
  }
})

watch(maxDuration, value => {
  if (value > 0 && (!endTime.value || endTime.value > value)) endTime.value = Math.min(value, 2)
})

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function handleLoadedMetadata() {
  if (!audioRef.value) return
  loadedDuration.value = audioRef.value.duration || props.duration || 0
  if (!endTime.value || endTime.value > loadedDuration.value) endTime.value = Math.min(loadedDuration.value, 2)
}

function handleTimeUpdate() {
  if (!audioRef.value) return
  currentTime.value = audioRef.value.currentTime
  if (isPlaying.value && audioRef.value.currentTime >= endTime.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = startTime.value
    isPlaying.value = false
  }
}

function togglePlay() {
  if (!audioRef.value) return
  if (isPlaying.value) {
    audioRef.value.pause()
    isPlaying.value = false
    return
  }
  audioRef.value.currentTime = startTime.value
  audioRef.value.volume = Math.min(1, Math.max(0, volume.value))
  audioRef.value.playbackRate = speed.value
  audioRef.value.play()
  isPlaying.value = true
}

function getPointerTime(event) {
  const rect = timelineRef.value?.getBoundingClientRect()
  if (!rect || !maxDuration.value) return 0
  return Math.max(0, Math.min(maxDuration.value, ((event.clientX - rect.left) / rect.width) * maxDuration.value))
}

function startSelectionDrag(mode, event) {
  event.preventDefault()
  event.stopPropagation()
  dragState.value = {
    mode,
    pointerTime: getPointerTime(event),
    startTime: startTime.value,
    endTime: endTime.value
  }
  window.addEventListener('pointermove', handleSelectionDrag)
  window.addEventListener('pointerup', stopSelectionDrag, { once: true })
}

function handleSelectionDrag(event) {
  const state = dragState.value
  if (!state) return
  const pointerTime = getPointerTime(event)
  const minimum = Math.min(0.1, maxDuration.value)
  if (state.mode === 'start') startTime.value = Math.min(Math.max(0, pointerTime), endTime.value - minimum)
  if (state.mode === 'end') endTime.value = Math.max(Math.min(maxDuration.value, pointerTime), startTime.value + minimum)
  if (state.mode === 'move') {
    const length = state.endTime - state.startTime
    const nextStart = Math.max(0, Math.min(maxDuration.value - length, state.startTime + pointerTime - state.pointerTime))
    startTime.value = nextStart
    endTime.value = nextStart + length
  }
}

function stopSelectionDrag() {
  dragState.value = null
  window.removeEventListener('pointermove', handleSelectionDrag)
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    startTime: startTime.value,
    endTime: endTime.value,
    volume: volume.value,
    pitch: pitch.value,
    speed: speed.value,
    fadeIn: fadeIn.value,
    fadeOut: fadeOut.value,
    format: format.value,
    mode: showAdvanced.value ? 'edit' : 'trim'
  })
}

onUnmounted(stopSelectionDrag)
</script>

<template>
  <div class="audio-editor-overlay">
    <section class="audio-editor" aria-label="音频截取">
      <header class="audio-editor-header">
        <div>
          <span class="audio-editor-kicker">♫ 节点</span>
          <h3>音频截取</h3>
          <p>{{ title }}</p>
        </div>
        <button class="icon-btn" title="关闭" @click="emit('close')">×</button>
      </header>

      <audio ref="audioRef" :src="audioUrl" @loadedmetadata="handleLoadedMetadata" @timeupdate="handleTimeUpdate" @pause="isPlaying = false" @ended="isPlaying = false" />

      <div ref="timelineRef" class="trim-timeline" :class="{ dragging: dragState }">
        <div class="waveform" aria-hidden="true">
          <i v-for="(height, index) in waveformBars" :key="index" :style="{ height: `${height}%` }"></i>
        </div>
        <div class="trim-selection" :style="selectionStyle" @pointerdown="startSelectionDrag('move', $event)">
          <button class="trim-handle trim-handle-start" aria-label="调整截取起点" @pointerdown="startSelectionDrag('start', $event)"></button>
          <span class="trim-duration">{{ clipDuration.toFixed(2) }}<small>s</small></span>
          <button class="trim-handle trim-handle-end" aria-label="调整截取终点" @pointerdown="startSelectionDrag('end', $event)"></button>
        </div>
      </div>

      <div class="audio-status">
        <span>{{ formatTime(currentTime) }} / {{ formatTime(maxDuration) }}</span>
        <button class="play-btn" :title="isPlaying ? '暂停' : '播放截取片段'" @click="togglePlay">
          <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>

      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? '收起高级编辑' : '高级编辑' }}</button>
      <div v-if="showAdvanced" class="advanced-grid">
        <label><span>音量 {{ volume }}x</span><input v-model.number="volume" type="range" min="0" max="3" step="0.1" /></label>
        <label><span>变调 {{ pitch }} 半音</span><input v-model.number="pitch" type="range" min="-12" max="12" step="1" /></label>
        <label><span>速度 {{ speed }}x</span><input v-model.number="speed" type="range" min="0.5" max="2" step="0.05" /></label>
        <label><span>淡入 {{ fadeIn }}s</span><input v-model.number="fadeIn" type="range" min="0" :max="clipDuration" step="0.1" /></label>
        <label><span>淡出 {{ fadeOut }}s</span><input v-model.number="fadeOut" type="range" min="0" :max="clipDuration" step="0.1" /></label>
        <label><span>格式</span><select v-model="format"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="m4a">M4A</option></select></label>
      </div>

      <footer class="audio-editor-actions">
        <button class="secondary-btn" @click="emit('close')">×　截取</button>
        <span class="range-pill">{{ formatTime(startTime) }} - {{ formatTime(endTime) }}</span>
        <button class="generate-btn" :disabled="!canSubmit" @click="handleSubmit">生成</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.audio-editor-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .62); backdrop-filter: blur(8px); }
.audio-editor { width: min(640px, calc(100vw - 32px)); padding: 20px; border: 1px solid rgba(255,255,255,.5); border-radius: 24px; background: #242424; color: #f5f5f5; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
.audio-editor-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.audio-editor-kicker { color: #bcbcbc; font-size: 13px; }
.audio-editor-header h3 { margin: 5px 0 0; font-size: 20px; }
.audio-editor-header p { margin: 3px 0 0; color: #a1a1aa; font-size: 12px; }
.icon-btn { width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: #cfcfcf; font-size: 25px; cursor: pointer; }
.trim-timeline { position: relative; height: 196px; overflow: hidden; border: 10px solid #363636; border-radius: 20px; background: #1c1c1c; user-select: none; touch-action: none; }
.waveform { position: absolute; inset: 18px 8px; display: flex; align-items: center; justify-content: space-around; gap: 4px; }
.waveform i { width: 4px; min-height: 13px; border-radius: 999px; background: #4a4a4a; }
.trim-selection { position: absolute; top: 0; bottom: 0; min-width: 8px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid #e6e6e6; border-radius: 14px; background: rgba(255,255,255,.11); cursor: grab; }
.trim-timeline.dragging .trim-selection { cursor: grabbing; }
.trim-selection::before { content: ''; position: absolute; top: 0; bottom: 0; left: -2px; width: 4px; border-radius: 999px; background: #ff5d5d; }
.trim-handle { position: absolute; top: 0; bottom: 0; width: 18px; border: 0; background: transparent; cursor: ew-resize; }
.trim-handle-start { left: -9px; }.trim-handle-end { right: -9px; }
.trim-duration { padding: 10px 15px; border-radius: 18px; background: #161616; color: #fff; font-size: 28px; font-weight: 700; line-height: 1; pointer-events: none; }.trim-duration small { margin-left: 3px; font-size: 20px; }
.audio-status { display: flex; align-items: center; justify-content: space-between; min-height: 70px; padding: 0 8px; color: #d4d4d4; font-size: 22px; }.play-btn { display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid #5b5b5b; border-radius: 50%; background: #1d1d1d; color: #eee; cursor: pointer; }.play-btn svg { width: 25px; height: 25px; }
.advanced-toggle { display: block; margin: 0 auto 12px; border: 0; background: transparent; color: #a3a3a3; cursor: pointer; font-size: 12px; }
.advanced-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }.advanced-grid label { display: grid; gap: 6px; color: #d4d4d8; font-size: 12px; }.advanced-grid input, .advanced-grid select { min-height: 32px; padding: 0 8px; border: 1px solid #555; border-radius: 6px; background: #171717; color: #f4f4f5; }
.audio-editor-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 8px; border-radius: 18px; background: #303030; }.secondary-btn, .generate-btn { min-height: 46px; padding: 0 18px; border: 0; border-radius: 12px; font-size: 16px; cursor: pointer; }.secondary-btn { background: transparent; color: #f2f2f2; }.range-pill { padding: 10px 16px; border-radius: 12px; background: #494949; color: #f5f5f5; font-size: 15px; }.generate-btn { background: #f4f4f5; color: #1b1b1b; }.generate-btn:disabled { opacity: .45; cursor: not-allowed; }
@media (max-width: 640px) { .audio-editor { padding: 14px; border-radius: 18px; }.trim-timeline { height: 150px; }.trim-duration { font-size: 22px; }.audio-status { font-size: 18px; }.audio-editor-actions { gap: 6px; }.secondary-btn, .generate-btn { padding: 0 12px; }.range-pill { padding: 10px; font-size: 12px; }.advanced-grid { grid-template-columns: 1fr; } }
</style>
