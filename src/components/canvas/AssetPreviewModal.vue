<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import CachedImage from '@/components/CachedImage.vue'
import { getMediaUrl } from '@/config/tenant'
import { toSameOriginUrl } from '@/utils/canvasThumbnail'

const props = defineProps({
  visible: Boolean,
  asset: {
    type: Object,
    default: null
  },
  fileTypes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'apply', 'manage-tags', 'download', 'delete'])

const audioRef = ref(null)
const audioVisualizerRef = ref(null)
const audioError = ref(false)
let audioContext = null
let analyser = null
let audioSource = null
let animationId = null
let particles = []
let audioSourceConnected = false

const typeLabel = computed(() => {
  const fileType = props.fileTypes.find(f => f.key === props.asset?.type)
  return fileType?.label || fileType?.labelKey || props.asset?.type || '-'
})

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}

class Particle {
  constructor(canvas) {
    this.canvas = canvas
    this.reset()
  }

  reset() {
    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * 80 + 60
    this.x = centerX + Math.cos(angle) * distance
    this.y = centerY + Math.sin(angle) * distance
    this.size = Math.random() * 4 + 2
    this.speedX = (Math.random() - 0.5) * 2
    this.speedY = (Math.random() - 0.5) * 2
    this.life = 1
    this.decay = Math.random() * 0.02 + 0.01
    this.hue = Math.random() * 40 + 200
    this.brightness = Math.random() * 30 + 70
  }

  update(intensity) {
    this.x += this.speedX * (1 + intensity * 2)
    this.y += this.speedY * (1 + intensity * 2)
    this.life -= this.decay
    if (this.life <= 0) this.reset()
  }

  draw(ctx) {
    ctx.save()
    ctx.globalAlpha = this.life * 0.8
    ctx.fillStyle = `hsl(${this.hue}, 80%, ${this.brightness}%)`
    ctx.shadowColor = `hsl(${this.hue}, 100%, 60%)`
    ctx.shadowBlur = 15
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function initAudioVisualizer() {
  if (!audioRef.value || !audioVisualizerRef.value) return
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8

    if (!audioSourceConnected) {
      audioSource = audioContext.createMediaElementSource(audioRef.value)
      audioSource.connect(analyser)
      analyser.connect(audioContext.destination)
      audioSourceConnected = true
    }

    const canvas = audioVisualizerRef.value
    particles = []
    for (let i = 0; i < 50; i++) {
      particles.push(new Particle(canvas))
    }
    animateVisualizer()
  } catch (e) {
    console.error('[AssetPreviewModal] 音频可视化初始化失败:', e)
  }
}

function animateVisualizer() {
  if (!audioVisualizerRef.value || !analyser) return
  const canvas = audioVisualizerRef.value
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)

  let sum = 0
  for (let i = 0; i < bufferLength; i++) sum += dataArray[i]
  const avgIntensity = sum / bufferLength / 255

  ctx.fillStyle = 'rgba(15, 15, 25, 0.2)'
  ctx.fillRect(0, 0, width, height)
  drawWaveform(ctx, dataArray, width, height, avgIntensity)
  particles.forEach(particle => {
    particle.update(avgIntensity)
    particle.draw(ctx)
  })
  drawSpectrumBars(ctx, dataArray, width, height)
  animationId = requestAnimationFrame(animateVisualizer)
}

function drawWaveform(ctx, dataArray, width, height, intensity) {
  const centerX = width / 2
  const centerY = height / 2
  const radius = 50 + intensity * 30
  const points = 32

  ctx.save()
  ctx.strokeStyle = `hsla(210, 100%, 60%, ${0.6 + intensity * 0.4})`
  ctx.lineWidth = 2
  ctx.shadowColor = 'hsl(210, 100%, 60%)'
  ctx.shadowBlur = 20
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const dataIndex = Math.floor((i / points) * dataArray.length)
    const amplitude = dataArray[dataIndex] / 255
    const r = radius + amplitude * 40
    const x = centerX + Math.cos(angle) * r
    const y = centerY + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function drawSpectrumBars(ctx, dataArray, width, height) {
  const barCount = 64
  const barWidth = width / barCount - 2
  const barSpacing = 2
  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * dataArray.length)
    const amplitude = dataArray[dataIndex] / 255
    const barHeight = amplitude * 60
    const x = i * (barWidth + barSpacing)
    const y = height - barHeight
    const hue = 210 + (i / barCount) * 40
    ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + amplitude * 0.5})`
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`
    ctx.shadowBlur = 5
    ctx.fillRect(x, y, barWidth, barHeight)
  }
}

function cleanupAudioVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  particles = []
}

function destroyAudioVisualizer() {
  cleanupAudioVisualizer()
  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }
  analyser = null
  audioSource = null
  audioSourceConnected = false
}

function handleAudioPlay() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume()
  }
  if (!animationId && audioRef.value) {
    initAudioVisualizer()
  }
}

function handleAudioError() {
  audioError.value = true
  cleanupAudioVisualizer()
}

watch(() => props.visible, (visible) => {
  if (!visible) {
    destroyAudioVisualizer()
    audioError.value = false
  }
})

onUnmounted(destroyAudioVisualizer)
</script>

<template>
  <Teleport to="body">
    <Transition name="preview">
      <div v-if="visible && asset" class="asset-preview-overlay" @click.self="emit('close')">
        <div class="asset-preview-modal">
          <button class="preview-back-btn" type="button" @click="emit('close')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5"/>
              <path d="M12 19l-7-7 7-7"/>
            </svg>
            <span>返回</span>
          </button>

          <button class="preview-close-btn" @click="emit('close')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <div class="preview-content">
            <div v-if="asset.type === 'text'" class="preview-text">
              <h3>{{ asset.name }}</h3>
              <div class="text-content">{{ asset.content }}</div>
            </div>

            <CachedImage
              v-else-if="asset.type === 'image'"
              :src="getMediaUrl(asset.url)"
              :alt="asset.name"
              img-class="preview-image"
            />

            <video
              v-else-if="asset.type === 'video'"
              :src="toSameOriginUrl(asset.url)"
              controls
              autoplay
              class="preview-video"
            ></video>

            <div v-else-if="asset.type === 'audio'" class="preview-audio">
              <div v-if="audioError" class="audio-error-container">
                <div class="audio-error-icon">!</div>
                <div class="audio-error-text">音频文件不可用，源文件可能已被删除</div>
              </div>
              <template v-else>
                <div class="audio-visualizer-container">
                  <canvas ref="audioVisualizerRef" class="audio-visualizer-canvas" width="400" height="300"></canvas>
                  <div class="audio-icon">♪</div>
                </div>
                <h3 class="audio-title">{{ asset.name }}</h3>
                <audio
                  ref="audioRef"
                  :src="getMediaUrl(asset.url)"
                  controls
                  autoplay
                  crossorigin="anonymous"
                  class="audio-player"
                  @play="handleAudioPlay"
                  @pause="cleanupAudioVisualizer"
                  @ended="cleanupAudioVisualizer"
                  @error="handleAudioError"
                ></audio>
              </template>
            </div>

            <div v-else class="preview-character">
              <video
                v-if="asset.url && (asset.url.includes('.mp4') || asset.url.includes('/api/images/file/'))"
                :src="toSameOriginUrl(asset.url)"
                :poster="asset.thumbnail_url ? getMediaUrl(asset.thumbnail_url) : undefined"
                controls
                autoplay
                loop
                muted
                playsinline
                class="preview-video"
              ></video>
              <CachedImage
                v-else-if="asset.thumbnail_url || asset.url"
                :src="getMediaUrl(asset.thumbnail_url || asset.url)"
                :alt="asset.name"
                img-class="preview-image"
              />
              <h3>{{ asset.name }}</h3>
            </div>
          </div>

          <div class="preview-info">
            <div class="info-row">
              <span class="info-label">名称</span>
              <span class="info-value">{{ asset.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">类型</span>
              <span class="info-value">{{ typeLabel }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">大小</span>
              <span class="info-value">{{ formatFileSize(asset.size) }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ formatDate(asset.created_at) }}</span>
            </div>
          </div>

          <div class="preview-toolbar">
            <button class="toolbar-btn primary" @click="emit('apply', asset)">添加到画布</button>
            <button class="toolbar-btn" @click="emit('manage-tags', asset)">管理标签</button>
            <button class="toolbar-btn" @click="emit('download', asset)">下载</button>
            <button class="toolbar-btn danger" @click="emit('delete', asset)">删除</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.asset-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: clamp(12px, 4vw, 40px);
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(16px);
}

.asset-preview-modal {
  position: relative;
  width: min(96vw, 1400px);
  max-width: 96vw;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(12px, 2vh, 20px);
}

.preview-close-btn {
  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
  z-index: 1;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.preview-back-btn {
  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  left: max(16px, env(safe-area-inset-left));
  z-index: 1;
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.84);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.preview-back-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  transform: translateX(-2px);
}

.preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-height: 85vh;
  overflow: hidden;
}

.preview-image,
.preview-video {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.preview-content :deep(.cached-image-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  max-height: 85vh;
  overflow: visible;
}

.preview-content :deep(img.preview-image) {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.preview-text {
  width: min(700px, 92vw);
  max-height: 85vh;
  overflow-y: auto;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}

.preview-text h3,
.preview-character h3 {
  margin: 0 0 16px;
  color: #fff;
  font-size: 18px;
}

.text-content {
  color: rgba(255, 255, 255, 0.82);
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.preview-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  padding: 32px 48px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.08));
}

.audio-visualizer-container {
  position: relative;
  width: 400px;
  height: 300px;
  max-width: 76vw;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 16px;
  background: radial-gradient(ellipse at center, rgba(30, 64, 175, 0.3), rgba(15, 15, 25, 0.8) 70%);
}

.audio-visualizer-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.audio-icon {
  position: relative;
  z-index: 1;
  color: rgba(59, 130, 246, 0.65);
  font-size: 48px;
  text-shadow: 0 0 30px rgba(59, 130, 246, 0.8);
}

.audio-title {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.audio-player {
  width: 400px;
  max-width: 76vw;
}

.audio-error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 20px;
  color: rgba(248, 113, 113, 0.9);
}

.audio-error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 28px;
  font-weight: 700;
}

.preview-character {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.preview-info {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px 28px;
  max-width: 100%;
  padding: 14px 22px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
}

.info-value {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.toolbar-btn {
  padding: 11px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
}

.toolbar-btn.primary {
  border-color: transparent;
  background: #7c3aed;
  color: #fff;
}

.toolbar-btn.danger {
  color: #fecaca;
}

.preview-enter-active,
.preview-leave-active {
  transition: opacity 0.16s ease;
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

@media (max-height: 720px), (max-width: 640px) {
  .asset-preview-modal {
    max-height: calc(100vh - 24px);
    gap: 10px;
  }

  .preview-close-btn {
    top: max(8px, env(safe-area-inset-top));
    right: max(8px, env(safe-area-inset-right));
  }

  .preview-back-btn {
    top: max(8px, env(safe-area-inset-top));
    left: max(8px, env(safe-area-inset-left));
  }

  .preview-back-btn:hover {
    transform: translateX(-2px);
  }
}
</style>
