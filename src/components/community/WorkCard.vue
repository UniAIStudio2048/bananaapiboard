<template>
  <div
    class="group cursor-pointer"
    @click="$emit('click', work)"
    @mouseenter="playPreviewVideo"
    @mouseleave="resetPreviewVideo"
  >
    <!-- 封面图区域 -->
    <div class="relative overflow-hidden rounded-lg" :class="landscape ? 'aspect-video' : 'aspect-[3/4]'">
      <!-- 幻灯片模式 -->
      <template v-if="isSlideshow">
        <img
          :src="currentSlideUrl"
          :alt="work.title || ''"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <!-- 图片计数指示器 -->
        <div class="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          {{ currentSlideIndex + 1 }}/{{ mediaUrls.length }}
        </div>
        <!-- 底部点指示器 -->
        <div class="absolute bottom-10 left-0 right-0 flex justify-center gap-1">
          <div
            v-for="(_, idx) in mediaUrls"
            :key="idx"
            class="w-1 h-1 rounded-full transition-all"
            :class="idx === currentSlideIndex ? 'bg-white w-2.5' : 'bg-white/40'"
          />
        </div>
      </template>
      <!-- 普通封面 -->
      <template v-else>
        <img
          v-if="displayImageUrl"
          :src="displayImageUrl"
          :alt="work.title || ''"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <video
          v-if="isVideoPreviewActive && isVideoWork && videoPreviewUrl"
          ref="previewVideoRef"
          :src="videoPreviewUrl"
          :poster="displayImageUrl"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          muted
          loop
          playsinline
          preload="metadata"
        />
        <div v-if="!displayImageUrl" class="w-full h-full bg-neutral-900 flex items-center justify-center">
          <svg class="w-10 h-10 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
      </template>

      <!-- 付费标签 -->
      <div
        v-if="work.share_mode === 'paid' && work.price"
        class="community-work-card-paid-badge absolute top-2 left-2 px-2 py-0.5 rounded-md border border-white/35 bg-white/75 text-neutral-950 text-xs font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.22)] backdrop-blur-md"
      >
        {{ work.price }} 积分
      </div>

      <!-- 精选标签 -->
      <div
        v-if="work.is_featured"
        class="community-work-card-featured-badge absolute top-2 text-xs font-medium px-2 py-0.5 rounded-md border border-white/20 bg-black/45 text-white shadow-[0_4px_16px_rgba(0,0,0,0.24)] backdrop-blur-md"
        :class="work.share_mode === 'paid' && work.price ? 'left-16' : 'left-2'"
      >
        精选
      </div>

      <!-- 底部渐变遮罩 + 作者名 & 标题 + 点赞 -->
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-2.5 px-3 flex items-end justify-between gap-2">
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white font-medium truncate leading-snug drop-shadow-sm">{{ work.title || '无标题' }}</p>
          <span class="text-xs text-white/70 truncate block mt-0.5 drop-shadow-sm">@{{ work.author_name || '匿名用户' }}</span>
        </div>
        <button
          class="community-work-card-like flex flex-col items-center gap-0.5 shrink-0 opacity-0 pointer-events-none transition-all duration-200 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto hover:scale-110"
          :aria-label="work.is_liked ? '取消点赞' : '点赞'"
          @click.stop="$emit('like', work)"
        >
          <svg
            class="w-5 h-5 drop-shadow-sm transition-colors"
            :class="work.is_liked ? 'text-red-500 fill-red-500' : 'text-white/80 fill-transparent'"
            stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { getImageMediaUrls } from '@/utils/communityMedia'

const props = defineProps({
  work: { type: Object, required: true },
  landscape: { type: Boolean, default: true }
})

defineEmits(['click', 'like'])

const currentSlideIndex = ref(0)
const previewVideoRef = ref(null)
const isVideoPreviewActive = ref(false)
let slideTimer = null

const mediaUrls = computed(() => {
  return getImageMediaUrls(props.work)
})

const isSlideshow = computed(() => mediaUrls.value.length > 1)

const isVideoWork = computed(() => props.work?.media_type === 'video')

const displayImageUrl = computed(() => {
  return mediaUrls.value[0] || props.work.cover_url
})

const videoPreviewUrl = computed(() => {
  if (!isVideoWork.value) return ''
  return props.work.video_url || props.work.media_url || ''
})

const currentSlideUrl = computed(() => {
  if (!isSlideshow.value) return displayImageUrl.value
  return mediaUrls.value[currentSlideIndex.value] || props.work.cover_url
})

function startSlideshow() {
  stopSlideshow()
  if (!isSlideshow.value) return
  slideTimer = setInterval(() => {
    currentSlideIndex.value = (currentSlideIndex.value + 1) % mediaUrls.value.length
  }, 3000)
}

function stopSlideshow() {
  if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
}

async function playPreviewVideo() {
  if (!isVideoWork.value || !videoPreviewUrl.value) return
  isVideoPreviewActive.value = true
  await nextTick()
  const video = previewVideoRef.value
  if (!video) return
  video.play?.()?.catch?.(() => {})
}

function resetPreviewVideo() {
  const video = previewVideoRef.value
  if (video) {
    video.pause?.()
    video.currentTime = 0
  }
  isVideoPreviewActive.value = false
}

onMounted(() => {
  if (isSlideshow.value) startSlideshow()
})

onBeforeUnmount(() => {
  stopSlideshow()
  resetPreviewVideo()
})

watch(isSlideshow, (val) => {
  if (val) startSlideshow()
  else stopSlideshow()
})
</script>
