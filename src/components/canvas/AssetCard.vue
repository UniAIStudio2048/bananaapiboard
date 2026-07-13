<script setup>
import { computed, ref } from 'vue'
import CachedImage from '@/components/CachedImage.vue'
import { getMediaUrl } from '@/config/tenant'

const props = defineProps({
  asset: {
    type: Object,
    required: true
  },
  fileTypes: {
    type: Array,
    default: () => []
  },
  audioUnavailable: Boolean,
  videoThumbnail: {
    type: String,
    default: ''
  },
  formattedSize: {
    type: String,
    default: '-'
  },
  formattedDate: {
    type: String,
    default: '-'
  },
  characterStatus: {
    type: String,
    default: 'completed'
  },
  characterFailReason: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['click', 'dblclick', 'contextmenu', 'dragstart', 'mouseenter', 'mouseleave', 'favorite'])
const measuredAspectRatio = ref('')

function isImageThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return false
  const normalized = url.toLowerCase().split('?')[0]
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(normalized)) return false
  if (normalized.includes('/api/videos/file/')) return false
  return true
}

const typeIcon = computed(() => props.fileTypes.find(f => f.key === props.asset.type)?.icon || '◇')
const isCharacter = computed(() => ['sora-character', 'seedance-character', 'bytefor-character'].includes(props.asset.type))
const previewUrl = computed(() => {
  if (props.asset.type === 'video') {
    return props.asset.thumbnail_url || (isImageThumbnailUrl(props.videoThumbnail) ? props.videoThumbnail : '')
  }
  if (isCharacter.value) {
    const assetUrl = isImageThumbnailUrl(props.asset.url) ? props.asset.url : ''
    return props.asset.thumbnail_url || (isImageThumbnailUrl(props.videoThumbnail) ? props.videoThumbnail : '') || assetUrl
  }
  return props.asset.thumbnail_url || props.videoThumbnail || props.asset.url
})
const showVideoPoster = computed(() => {
  if (props.asset.type !== 'video') return false
  return !!(props.asset.thumbnail_url || isImageThumbnailUrl(props.videoThumbnail))
})
const thumbStyle = computed(() => ({
  '--asset-thumb-ratio': getAssetAspectRatio(props.asset)
}))

function getMetadataObject(asset) {
  if (!asset?.metadata) return {}
  if (typeof asset.metadata === 'string') {
    try {
      return JSON.parse(asset.metadata)
    } catch {
      return {}
    }
  }
  return asset.metadata
}

function getNumericDimension(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

function getAssetAspectRatio(asset) {
  if (!['image', 'video', 'sora-character', 'seedance-character', 'bytefor-character'].includes(asset?.type)) {
    return '1 / 1'
  }

  const metadata = getMetadataObject(asset)
  const width = getNumericDimension(
    asset.width,
    asset.image_width,
    asset.video_width,
    metadata.width,
    metadata.imageWidth,
    metadata.videoWidth,
    metadata.dimensions?.width
  )
  const height = getNumericDimension(
    asset.height,
    asset.image_height,
    asset.video_height,
    metadata.height,
    metadata.imageHeight,
    metadata.videoHeight,
    metadata.dimensions?.height
  )

  if (width && height) return `${width} / ${height}`
  return measuredAspectRatio.value || '1 / 1'
}

function updateMeasuredAspectRatio(width, height) {
  const numericWidth = Number(width)
  const numericHeight = Number(height)
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) return
  if (numericWidth <= 0 || numericHeight <= 0) return
  measuredAspectRatio.value = `${numericWidth} / ${numericHeight}`
}

function handleMediaImageLoad(payload = {}) {
  updateMeasuredAspectRatio(payload.naturalWidth, payload.naturalHeight)
}

function textPreview(asset) {
  const content = asset.content || ''
  return content.length > 100 ? `${content.substring(0, 100)}...` : content
}

function handleFavorite(event) {
  event.stopPropagation()
  emit('favorite', event, props.asset)
}
</script>

<template>
  <div
    class="asset-card asset-card-v2"
    :class="[`type-${asset.type}`]"
    draggable="true"
    @click="emit('click', $event, asset)"
    @dblclick="emit('dblclick', asset)"
    @contextmenu="emit('contextmenu', $event, asset)"
    @dragstart="emit('dragstart', $event, asset)"
    @mouseenter="emit('mouseenter', $event, asset)"
    @mouseleave="emit('mouseleave', $event, asset)"
  >
    <div class="asset-card-thumb" :style="thumbStyle">
      <div v-if="asset.type === 'text'" class="text-preview">
        <p>{{ textPreview(asset) }}</p>
      </div>

      <template v-else-if="asset.type === 'image'">
        <div
          v-if="previewUrl"
          class="thumb-backdrop"
          :style="{ backgroundImage: `url(${getMediaUrl(previewUrl)})` }"
        ></div>
        <CachedImage
          v-if="previewUrl"
          :src="getMediaUrl(previewUrl)"
          :alt="asset.name"
          img-class="asset-card-media"
          wrapper-class="asset-card-media-wrap"
          loading="eager"
          @load="handleMediaImageLoad"
        />
      </template>

      <div v-else-if="asset.type === 'video'" class="video-preview">
        <div
          v-if="previewUrl"
          class="thumb-backdrop"
          :style="{ backgroundImage: `url(${getMediaUrl(previewUrl)})` }"
        ></div>
        <CachedImage
          v-if="showVideoPoster"
          :src="getMediaUrl(previewUrl)"
          :alt="asset.name"
          img-class="asset-card-media"
          wrapper-class="asset-card-media-wrap"
          loading="eager"
          @load="handleMediaImageLoad"
        />
        <div v-else class="video-placeholder" aria-hidden="true">
          <span class="video-placeholder-icon">▷</span>
        </div>
        <div class="video-play-icon">▶</div>
      </div>

      <div v-else-if="asset.type === 'audio'" class="audio-preview" :class="{ unavailable: audioUnavailable }">
        <div v-if="audioUnavailable" class="audio-unavailable-hint">
          <span class="unavailable-icon">!</span>
          <span>文件不可用</span>
        </div>
        <div v-else class="audio-wave">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </div>

      <div v-else-if="isCharacter" class="character-preview">
        <div v-if="characterStatus === 'failed'" class="character-state-overlay">
          <strong>创建失败</strong>
          <span v-if="characterFailReason">{{ characterFailReason }}</span>
        </div>
        <div v-else-if="characterStatus === 'pending' || characterStatus === 'processing'" class="character-state-overlay pending">
          <span class="pending-spinner"></span>
          <strong>创建中...</strong>
        </div>
        <div
          v-if="previewUrl"
          class="thumb-backdrop"
          :style="{ backgroundImage: `url(${getMediaUrl(previewUrl)})` }"
        ></div>
        <CachedImage
          v-if="previewUrl"
          :src="getMediaUrl(previewUrl)"
          :alt="asset.name"
          img-class="asset-card-media"
          wrapper-class="asset-card-media-wrap"
          loading="lazy"
          @load="handleMediaImageLoad"
        />
        <div v-else class="character-placeholder">{{ typeIcon }}</div>
      </div>
    </div>

    <button
      class="favorite-overlay"
      :class="{ active: asset.is_favorite }"
      type="button"
      :title="asset.is_favorite ? '取消收藏' : '收藏'"
      @click="handleFavorite"
    >
      {{ asset.is_favorite ? '★' : '☆' }}
    </button>

    <div class="asset-card-info">
      <div class="asset-card-title">{{ asset.name || asset.type }}</div>
      <div class="asset-card-meta">
        <span>{{ formattedSize }}</span>
        <span>·</span>
        <span>{{ formattedDate }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.asset-card.asset-card-v2 {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.asset-card.asset-card-v2:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.065);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}

.asset-card.asset-card-v2.type-sora-character {
  cursor: pointer;
}

.asset-card.asset-card-v2::before,
.asset-card.asset-card-v2::after {
  content: none;
}

.asset-card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: var(--asset-thumb-ratio, 1 / 1);
  flex: 0 0 auto;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.26);
}

.asset-card-media-wrap {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
}

.asset-card-media-wrap :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumb-backdrop {
  position: absolute;
  inset: -14px;
  background-size: cover;
  background-position: center;
  filter: blur(14px);
  opacity: 0.34;
  transform: scale(1.08);
}

.asset-card-media {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-preview,
.character-preview,
.audio-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.text-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 14px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.55;
  background: linear-gradient(135deg, rgba(63, 63, 70, 0.42), rgba(24, 24, 27, 0.82));
}

.text-preview p {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 8;
}

.video-placeholder {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(135deg, rgba(39, 39, 42, 0.8), rgba(9, 9, 11, 0.95)),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 8px);
  color: rgba(255, 255, 255, 0.58);
}

.video-placeholder-icon {
  font-size: 32px;
  transform: translateX(2px);
}

.video-play-icon {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 12px;
}

.audio-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(139, 92, 246, 0.18));
}

.audio-wave {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 54px;
}

.audio-wave span {
  width: 5px;
  border-radius: 999px;
  background: rgba(147, 197, 253, 0.78);
  animation: wave 0.8s ease-in-out infinite;
}

.audio-wave span:nth-child(1) { height: 18px; animation-delay: 0s; }
.audio-wave span:nth-child(2) { height: 32px; animation-delay: 0.1s; }
.audio-wave span:nth-child(3) { height: 48px; animation-delay: 0.2s; }
.audio-wave span:nth-child(4) { height: 32px; animation-delay: 0.3s; }
.audio-wave span:nth-child(5) { height: 18px; animation-delay: 0.4s; }

@keyframes wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.45); }
}

.audio-unavailable-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: rgba(248, 113, 113, 0.9);
  font-size: 12px;
}

.unavailable-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-weight: 700;
}

.character-placeholder {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.65);
  font-size: 36px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.24), rgba(124, 58, 237, 0.22));
}

.character-state-overlay {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  text-align: center;
  color: #fff;
  background: rgba(220, 38, 38, 0.82);
  font-size: 12px;
}

.character-state-overlay.pending {
  background: rgba(37, 99, 235, 0.76);
}

.pending-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.favorite-overlay {
  position: absolute;
  z-index: 5;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  backdrop-filter: blur(10px);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 0.16s ease, transform 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.asset-card.asset-card-v2:hover .favorite-overlay,
.asset-card.asset-card-v2:focus-within .favorite-overlay {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.favorite-overlay.active {
  color: #fbbf24;
}

.asset-card-info {
  padding: 10px 11px 11px;
  min-width: 0;
}

.asset-card-title {
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  white-space: nowrap;
}

:global(:root.canvas-theme-light) .asset-card,
:global(html.canvas-theme-light) .asset-card,
:global(body.canvas-theme-light) .asset-card,
:global(.canvas-theme-light) .asset-card {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.025);
}

:global(:root.canvas-theme-light) .asset-card:hover,
:global(html.canvas-theme-light) .asset-card:hover,
:global(body.canvas-theme-light) .asset-card:hover,
:global(.canvas-theme-light) .asset-card:hover {
  border-color: rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.045);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.1);
}

:global(:root.canvas-theme-light) .asset-card-title,
:global(html.canvas-theme-light) .asset-card-title,
:global(body.canvas-theme-light) .asset-card-title,
:global(.canvas-theme-light) .asset-card-title {
  color: #111827 !important;
}

:global(:root.canvas-theme-light) .asset-card-meta,
:global(html.canvas-theme-light) .asset-card-meta,
:global(body.canvas-theme-light) .asset-card-meta,
:global(.canvas-theme-light) .asset-card-meta {
  color: rgba(17, 24, 39, 0.56) !important;
}

:global(:root.canvas-theme-light) .text-preview,
:global(html.canvas-theme-light) .text-preview,
:global(body.canvas-theme-light) .text-preview,
:global(.canvas-theme-light) .text-preview {
  color: #111827 !important;
}
</style>
