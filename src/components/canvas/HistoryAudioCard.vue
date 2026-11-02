<script>
// 同一历史列表只试听一条音频，组件销毁时释放引用。
let activePlayer = null
</script>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '' },
  duration: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
})
const audioRef = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const loadedDuration = ref(0)
const error = ref('')
const duration = computed(() => {
  const value = loadedDuration.value || props.duration
  return Number.isFinite(value) && value > 0 ? value : 0
})
const progress = computed(() => duration.value ? Math.min(100, currentTime.value / duration.value * 100) : 0)

function formatTime(value) {
  const seconds = Math.floor(Math.max(0, value || 0))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

async function togglePlayback() {
  const audio = audioRef.value
  if (!audio || !props.src || !props.active) return
  error.value = ''
  if (!audio.paused) {
    audio.pause()
    return
  }
  try {
    await audio.play()
  } catch (e) {
    if (e.name === 'AbortError') return
    error.value = '音频暂时无法播放，请重试'
    playing.value = false
  }
}

function handlePlay() {
  if (activePlayer && activePlayer !== audioRef.value) activePlayer.pause()
  activePlayer = audioRef.value
  playing.value = true
}

function seekTo(event) {
  if (!audioRef.value || !duration.value) return
  const nextTime = Number(event.target.value)
  if (!Number.isFinite(nextTime)) return
  audioRef.value.currentTime = Math.max(0, Math.min(duration.value, nextTime))
  currentTime.value = audioRef.value.currentTime
}

function resetPlayback() {
  audioRef.value?.pause()
  if (activePlayer === audioRef.value) activePlayer = null
  playing.value = false
}

watch(() => props.active, active => { if (!active) resetPlayback() })
watch(() => props.src, () => {
  resetPlayback()
  currentTime.value = 0
  loadedDuration.value = 0
  error.value = ''
})
onBeforeUnmount(resetPlayback)
</script>

<template>
  <div class="history-audio-card">
    <p class="history-audio-title" :title="title">{{ title || '音频' }}</p>
    <audio
      ref="audioRef"
      :src="src"
      preload="none"
      @loadedmetadata="loadedDuration = $event.target.duration"
      @timeupdate="currentTime = $event.target.currentTime"
      @play="handlePlay"
      @pause="playing = false"
      @ended="playing = false"
      @error="error = '音频暂时无法播放，请重试'; playing = false"
    />
    <div class="history-audio-visual" @click.stop @pointerdown.stop @keydown.stop @dragstart.prevent.stop>
      <!-- 与音频节点一致的示意波形，不额外下载整条音频进行解码。 -->
      <div class="history-audio-wave" :class="{ playing }" aria-hidden="true">
        <span v-for="i in 43" :key="i"></span>
      </div>
      <div class="history-audio-playhead" :style="{ left: progress + '%' }" aria-hidden="true"></div>
      <input
        class="history-audio-seek"
        type="range" min="0" :max="duration || 1" step="0.1" :value="currentTime"
        :disabled="!duration" :aria-label="`${title || '音频'}播放进度`"
        :aria-valuetext="`${formatTime(currentTime)} / ${duration ? formatTime(duration) : '--:--'}`"
        @input="seekTo"
      />
    </div>
    <div class="history-audio-controls">
      <span class="history-audio-time">{{ formatTime(currentTime) }} / {{ duration ? formatTime(duration) : '--:--' }}</span>
      <button
        type="button" class="history-audio-play" :disabled="!src"
        :aria-label="`${playing ? '暂停' : '播放'}${title || '音频'}`"
        @click.stop="togglePlayback" @pointerdown.stop @keydown.stop @dragstart.prevent.stop
      >
        <svg v-if="playing" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <span aria-hidden="true"></span>
    </div>
    <p v-if="error" class="history-audio-error" role="status">{{ error }}</p>
  </div>
</template>

<style scoped>
.history-audio-card {
  padding: 12px;
  background: var(--canvas-bg-secondary, #242424);
  color: var(--canvas-text-primary, #f2f2f2);
  border: 1px solid var(--canvas-border-default, #555);
  border-radius: 10px;
}
.history-audio-title {
  margin: 0 0 10px;
  padding: 0 28px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 20px;
  color: var(--canvas-text-secondary, #ccc);
}
.history-audio-visual {
  position: relative;
  display: flex;
  align-items: center;
  height: 96px;
  border-radius: 9px;
  background: #373737;
  overflow: hidden;
}
.history-audio-wave {
  display: flex;
  align-items: center;
  gap: 3px;
  width: calc(100% - 24px);
  margin: auto;
}
.history-audio-wave span {
  flex: 1;
  min-width: 1px;
  height: 18px;
  border-radius: 3px;
  background: #f2f2f2;
}
.history-audio-wave span:nth-child(7n + 2) { height: 38px; }
.history-audio-wave span:nth-child(7n + 3) { height: 26px; }
.history-audio-wave span:nth-child(7n + 4) { height: 48px; }
.history-audio-wave span:nth-child(7n + 5) { height: 34px; }
.history-audio-wave span:nth-child(7n + 6) { height: 30px; }
.history-audio-wave span:nth-child(11n + 3) { height: 10px; }
.history-audio-wave.playing span { animation: history-wave .6s ease-in-out infinite alternate; }
.history-audio-wave.playing span:nth-child(3n) { animation-delay: .2s; }
@keyframes history-wave { from { transform: scaleY(.72); } to { transform: scaleY(1.08); } }
.history-audio-playhead {
  position: absolute;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 3px;
  background: #ff4b4b;
  box-shadow: 0 0 8px #ff4b4b70;
  pointer-events: none;
}
.history-audio-seek {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.history-audio-visual:focus-within { outline: 2px solid var(--canvas-text-primary, #fff); outline-offset: 2px; }
.history-audio-controls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; padding-top: 8px; }
.history-audio-time { font-size: 10px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.history-audio-play {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--canvas-border-default, #555);
  border-radius: 50%;
  color: inherit;
  background: var(--canvas-bg-tertiary, #272727);
  cursor: pointer;
}
.history-audio-play:hover { background: var(--canvas-bg-elevated, #444); }
.history-audio-play:disabled { opacity: .4; cursor: not-allowed; }
.history-audio-play:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.history-audio-error { color: #f87171; font-size: 11px; margin: 6px 0 0; }
@media (prefers-reduced-motion: reduce) { .history-audio-wave.playing span { animation: none; } }
</style>
