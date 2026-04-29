<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  audioUrl: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: '音频'
  },
  duration: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close', 'submit'])

const audioRef = ref(null)
const loadedDuration = ref(props.duration || 0)
const currentTime = ref(0)
const isPlaying = ref(false)
const showAdvanced = ref(false)

const startTime = ref(0)
const endTime = ref(Math.min(props.duration || 10, 10))
const volume = ref(1)
const pitch = ref(0)
const speed = ref(1)
const fadeIn = ref(0)
const fadeOut = ref(0)
const format = ref('mp3')

const maxDuration = computed(() => loadedDuration.value || props.duration || 0)
const clipDuration = computed(() => Math.max(0, endTime.value - startTime.value))
const canSubmit = computed(() => props.audioUrl && clipDuration.value > 0)

watch(maxDuration, value => {
  if (value > 0 && (!endTime.value || endTime.value > value)) {
    endTime.value = Math.min(value, 10)
  }
})

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function handleLoadedMetadata() {
  if (!audioRef.value) return
  loadedDuration.value = audioRef.value.duration || props.duration || 0
  if (!endTime.value || endTime.value > loadedDuration.value) {
    endTime.value = Math.min(loadedDuration.value, 10)
  }
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

function previewClip() {
  nextTick(() => togglePlay())
}

function clampRange(changed) {
  const max = maxDuration.value || 0
  startTime.value = Math.max(0, Math.min(Number(startTime.value) || 0, max))
  endTime.value = Math.max(0, Math.min(Number(endTime.value) || 0, max))
  if (changed === 'start' && startTime.value >= endTime.value) {
    endTime.value = Math.min(max, startTime.value + 1)
  }
  if (changed === 'end' && endTime.value <= startTime.value) {
    startTime.value = Math.max(0, endTime.value - 1)
  }
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
</script>

<template>
  <div class="audio-editor-overlay" @click.self="emit('close')">
    <div class="audio-editor">
      <div class="audio-editor-header">
        <div>
          <h3>音频编辑</h3>
          <p>{{ title }}</p>
        </div>
        <button class="icon-btn" title="关闭" @click="emit('close')">×</button>
      </div>

      <audio
        ref="audioRef"
        :src="audioUrl"
        @loadedmetadata="handleLoadedMetadata"
        @timeupdate="handleTimeUpdate"
        @pause="isPlaying = false"
        @ended="isPlaying = false"
      />

      <div class="wave-preview">
        <div v-for="i in 36" :key="i" class="wave-bar" :style="{ height: `${18 + ((i * 11) % 42)}px` }"></div>
      </div>

      <div class="range-row">
        <label>
          <span>开始</span>
          <input v-model.number="startTime" type="number" min="0" :max="maxDuration" step="0.1" @input="clampRange('start')" />
        </label>
        <label>
          <span>结束</span>
          <input v-model.number="endTime" type="number" min="0" :max="maxDuration" step="0.1" @input="clampRange('end')" />
        </label>
        <div class="duration-pill">{{ formatTime(clipDuration) }}</div>
      </div>

      <div class="timeline">
        <input v-model.number="startTime" type="range" min="0" :max="maxDuration" step="0.1" @input="clampRange('start')" />
        <input v-model.number="endTime" type="range" min="0" :max="maxDuration" step="0.1" @input="clampRange('end')" />
      </div>

      <div class="preview-row">
        <button class="primary-btn" @click="previewClip">{{ isPlaying ? '暂停' : '预览片段' }}</button>
        <span>{{ formatTime(currentTime) }} / {{ formatTime(maxDuration) }}</span>
      </div>

      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? '收起高级剪辑' : '高级剪辑' }}
      </button>

      <div v-if="showAdvanced" class="advanced-grid">
        <label>
          <span>音量 {{ volume }}x</span>
          <input v-model.number="volume" type="range" min="0" max="3" step="0.1" />
        </label>
        <label>
          <span>变调 {{ pitch }} 半音</span>
          <input v-model.number="pitch" type="range" min="-12" max="12" step="1" />
        </label>
        <label>
          <span>速度 {{ speed }}x</span>
          <input v-model.number="speed" type="range" min="0.5" max="2" step="0.05" />
        </label>
        <label>
          <span>淡入 {{ fadeIn }}s</span>
          <input v-model.number="fadeIn" type="range" min="0" :max="clipDuration" step="0.1" />
        </label>
        <label>
          <span>淡出 {{ fadeOut }}s</span>
          <input v-model.number="fadeOut" type="range" min="0" :max="clipDuration" step="0.1" />
        </label>
        <label>
          <span>格式</span>
          <select v-model="format">
            <option value="mp3">MP3</option>
            <option value="wav">WAV</option>
            <option value="m4a">M4A</option>
          </select>
        </label>
      </div>

      <div class="audio-editor-actions">
        <button class="secondary-btn" @click="emit('close')">取消</button>
        <button class="primary-btn" :disabled="!canSubmit" @click="handleSubmit">提交处理</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(8px);
}

.audio-editor {
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: #171717;
  color: #f4f4f5;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.audio-editor-header,
.preview-row,
.audio-editor-actions,
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-editor-header {
  justify-content: space-between;
  margin-bottom: 16px;
}

.audio-editor-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.audio-editor-header p {
  margin: 4px 0 0;
  color: #a1a1aa;
  font-size: 12px;
}

.icon-btn,
.secondary-btn,
.primary-btn,
.advanced-toggle {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: #242424;
  color: #f4f4f5;
  cursor: pointer;
}

.icon-btn {
  width: 32px;
  height: 32px;
  font-size: 22px;
  line-height: 1;
}

.primary-btn,
.secondary-btn,
.advanced-toggle {
  padding: 8px 12px;
  font-size: 13px;
}

.primary-btn {
  border-color: rgba(139, 92, 246, 0.55);
  background: #7c3aed;
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.wave-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 96px;
  margin-bottom: 16px;
  border: 1px solid rgba(139, 92, 246, 0.28);
  border-radius: 8px;
  background: #241f35;
}

.wave-bar {
  width: 4px;
  border-radius: 999px;
  background: #a78bfa;
}

.range-row {
  align-items: flex-end;
}

.range-row label,
.advanced-grid label {
  display: grid;
  gap: 6px;
  color: #d4d4d8;
  font-size: 12px;
}

.range-row label {
  flex: 1;
}

input,
select {
  min-height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: #101010;
  color: #f4f4f5;
  padding: 0 8px;
}

input[type="range"] {
  padding: 0;
}

.duration-pill {
  min-width: 64px;
  height: 34px;
  border-radius: 999px;
  background: #27272a;
  text-align: center;
  line-height: 34px;
  color: #c4b5fd;
  font-size: 12px;
}

.timeline {
  display: grid;
  gap: 6px;
  margin: 14px 0;
}

.preview-row {
  justify-content: space-between;
  color: #a1a1aa;
  font-size: 12px;
}

.advanced-toggle {
  width: 100%;
  margin-top: 14px;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.audio-editor-actions {
  justify-content: flex-end;
  margin-top: 18px;
}

@media (max-width: 640px) {
  .range-row,
  .advanced-grid {
    grid-template-columns: 1fr;
  }

  .range-row {
    display: grid;
  }
}
</style>
