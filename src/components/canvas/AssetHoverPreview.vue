<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import CachedImage from '@/components/CachedImage.vue'
import { getMediaUrl } from '@/config/tenant'
import { toSameOriginUrl } from '@/utils/canvasThumbnail'

const props = defineProps({
  visible: Boolean,
  asset: {
    type: Object,
    default: null
  },
  anchorRect: {
    type: Object,
    default: null
  }
})

defineEmits(['mouseenter', 'mouseleave'])

const previewRef = ref(null)
const mediaRef = ref(null)
const position = ref({ left: '0px', top: '0px' })

const previewUrl = computed(() => props.asset?.thumbnail_url || props.asset?.url || '')
const isCharacter = computed(() => ['sora-character', 'seedance-character', 'bytefor-character'].includes(props.asset?.type))
const hasVideo = computed(() => props.asset?.type === 'video')
const characterHasVideo = computed(() => {
  const url = props.asset?.url || ''
  return isCharacter.value && (url.includes('.mp4') || url.includes('/api/images/file/'))
})
const characterUsername = computed(() => {
  if (props.asset?.type !== 'sora-character') return ''
  return props.asset?.metadata?.username || props.asset?.name || ''
})

function updatePosition() {
  if (!props.anchorRect) return
  const width = previewRef.value?.offsetWidth || 360
  const height = previewRef.value?.offsetHeight || 260
  const gap = 12
  let left = props.anchorRect.right + gap
  let top = props.anchorRect.top

  if (left + width > window.innerWidth - gap) {
    left = props.anchorRect.left - width - gap
  }
  if (top + height > window.innerHeight - gap) {
    top = window.innerHeight - height - gap
  }

  position.value = {
    left: `${Math.max(gap, left)}px`,
    top: `${Math.max(gap, top)}px`
  }
}

function cleanupMedia() {
  const media = mediaRef.value
  if (!media) return
  media.pause?.()
  media.currentTime = 0
}

watch([() => props.visible, () => props.asset?.id], async ([visible]) => {
  cleanupMedia()
  if (visible) {
    await nextTick()
    updatePosition()
    mediaRef.value?.play?.().catch(() => {})
  }
})

watch(() => props.anchorRect, async () => {
  if (!props.visible) return
  await nextTick()
  updatePosition()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="asset-hover-preview">
      <div
        v-if="visible && asset"
        ref="previewRef"
        class="asset-hover-preview"
        :style="position"
        @mouseenter="$emit('mouseenter')"
        @mouseleave="$emit('mouseleave')"
      >
        <div v-if="asset.type === 'image'" class="hover-media">
          <CachedImage
            :src="getMediaUrl(asset.url)"
            :alt="asset.name"
            img-class="hover-image"
            loading="eager"
          />
        </div>

        <video
          v-else-if="hasVideo"
          :key="asset.id"
          ref="mediaRef"
          class="hover-video"
          :src="toSameOriginUrl(asset.url)"
          :poster="asset.thumbnail_url ? getMediaUrl(asset.thumbnail_url) : undefined"
          muted
          autoplay
          loop
          playsinline
        />

        <div v-else-if="asset.type === 'audio'" class="hover-audio">
          <div class="mini-wave">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <audio :key="asset.id" ref="mediaRef" :src="getMediaUrl(asset.url)" autoplay></audio>
          <strong>{{ asset.name }}</strong>
        </div>

        <div v-else-if="asset.type === 'text'" class="hover-text">
          <strong>{{ asset.name }}</strong>
          <div>{{ asset.content }}</div>
        </div>

        <div v-else-if="isCharacter" class="hover-character">
          <video
            v-if="characterHasVideo"
            :key="asset.id"
            ref="mediaRef"
            class="hover-video"
            :src="toSameOriginUrl(asset.url)"
            :poster="asset.thumbnail_url ? getMediaUrl(asset.thumbnail_url) : undefined"
            muted
            autoplay
            loop
            playsinline
          />
          <CachedImage
            v-else-if="previewUrl"
            :src="getMediaUrl(previewUrl)"
            :alt="asset.name"
            img-class="hover-image"
            loading="eager"
          />
          <strong>{{ asset.name }}</strong>
          <span v-if="characterUsername" class="hover-character-username">@{{ characterUsername }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.asset-hover-preview {
  position: fixed;
  z-index: 9999;
  width: max-content;
  max-width: 380px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(18, 18, 22, 0.96);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.hover-media,
.hover-character {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hover-image,
.hover-video {
  display: block;
  max-width: 360px;
  max-height: 360px;
  object-fit: contain;
  border-radius: 8px;
  background: #000;
}

.hover-audio {
  width: 260px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #fff;
}

.mini-wave {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 64px;
}

.mini-wave span {
  width: 6px;
  border-radius: 999px;
  background: rgba(147, 197, 253, 0.85);
  animation: mini-wave 0.76s ease-in-out infinite;
}

.mini-wave span:nth-child(1) { height: 18px; animation-delay: 0s; }
.mini-wave span:nth-child(2) { height: 38px; animation-delay: 0.1s; }
.mini-wave span:nth-child(3) { height: 58px; animation-delay: 0.2s; }
.mini-wave span:nth-child(4) { height: 38px; animation-delay: 0.3s; }
.mini-wave span:nth-child(5) { height: 18px; animation-delay: 0.4s; }

@keyframes mini-wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.48); }
}

.hover-text {
  width: 360px;
  max-height: 360px;
  overflow: auto;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.hover-text strong,
.hover-character strong {
  display: block;
  margin-bottom: 8px;
  color: #fff;
  font-size: 13px;
}

.hover-character-username {
  display: block;
  color: rgba(167, 139, 250, 0.92);
  font-size: 12px;
}

.asset-hover-preview-enter-active,
.asset-hover-preview-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.asset-hover-preview-enter-from,
.asset-hover-preview-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
