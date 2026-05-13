<template>
  <span class="prompt-media-tag prompt-media-tag-chip" :class="chipClass">
    <span class="prompt-media-tag-thumb" :class="thumbClass" aria-hidden="true">
      <img
        v-if="previewSrc && !hasPreviewError"
        :src="previewSrc"
        alt=""
        loading="lazy"
        decoding="async"
        @error="handlePreviewError"
      />
      <video
        v-else-if="videoSrc"
        :src="videoSrc"
        muted
        preload="metadata"
        playsinline
        @loadeddata="$event.target.currentTime = 0.1"
      ></video>
      <span v-else class="prompt-media-tag-fallback">{{ fallbackIcon }}</span>
    </span>
    <span class="prompt-media-tag-text">{{ displayText }}</span>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getMentionPreviewImageSrc, isBrowserRenderableUrl } from '@/utils/promptMention'

const props = defineProps({
  text: { type: String, default: '' },
  media: { type: Object, default: null }
})

const hasPreviewError = ref(false)
const previewSrc = computed(() => getMentionPreviewImageSrc(props.media))
const videoSrc = computed(() => {
  if (props.media?.type !== 'video') return ''
  const url = props.media?.url || ''
  return isBrowserRenderableUrl(url) ? url : ''
})
const thumbClass = computed(() => ({
  'is-video': props.media?.type === 'video',
  'is-audio': props.media?.type === 'audio',
  'is-file': props.media?.type === 'file'
}))
const chipClass = computed(() => ({
  'is-video': props.media?.type === 'video',
  'is-audio': props.media?.type === 'audio',
  'is-file': props.media?.type === 'file'
}))
const fallbackIcon = computed(() => {
  if (props.media?.type === 'video') return '▶'
  if (props.media?.type === 'audio') return '♪'
  return '□'
})

const displayText = computed(() => {
  const raw = String(props.text || '')
  return raw.replace(/^[【\u3010]?@/, '').replace(/[】\u3011]$/, '')
})

function handlePreviewError() {
  hasPreviewError.value = true
}

watch(() => props.media?.url, () => {
  hasPreviewError.value = false
})
</script>

<style scoped>
.prompt-media-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 3px !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.14) !important;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-bottom: 1px solid rgba(255, 255, 255, 0.18) !important;
  vertical-align: -3px;
  line-height: 18px;
  pointer-events: auto;
  user-select: none;
  box-shadow: none;
}

.prompt-media-tag-thumb {
  display: inline-block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.55);
  flex-shrink: 0;
}

.prompt-media-tag-thumb img,
.prompt-media-tag-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.prompt-media-tag-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  line-height: 1;
}

.prompt-media-tag-thumb.is-audio {
  background: rgba(48, 48, 50, 0.95);
}

.prompt-media-tag-thumb.is-file {
  background: rgba(64, 64, 66, 0.95);
}

.prompt-media-tag-text {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  color: var(--canvas-text-primary, #ffffff);
  letter-spacing: 0;
}

:root.canvas-theme-light .prompt-media-tag-chip {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .prompt-media-tag-text {
  color: #1a1a1a;
}
</style>
