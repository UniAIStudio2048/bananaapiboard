<template>
  <div class="banner-carousel relative w-full overflow-hidden select-none py-4">
    <!-- 轮播内容区 -->
    <div class="banner-cards flex items-center justify-center gap-3">
      <!-- 左侧卡片 -->
      <div
        class="banner-card banner-card--side flex-shrink-0 relative cursor-pointer rounded-2xl overflow-hidden"
        :style="leftCardStyle"
        @click="openSideBanner('prev')"
        @mouseenter="leftCardHovered = true"
        @mouseleave="leftCardHovered = false"
      >
        <Transition :name="'slide-' + slideDirection">
          <div :key="prevBannerKey" class="absolute inset-0">
            <img
              v-if="prevBanner?.cover_url"
              :src="prevBanner.cover_url"
              :alt="prevBanner.title || ''"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-neutral-900 flex items-center justify-center">
              <span class="text-neutral-600 text-sm">暂无图片</span>
            </div>
            <div
              v-if="prevBanner?.title"
              class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-4 transition-opacity duration-300"
              :class="leftCardHovered ? 'opacity-100' : 'opacity-0'"
            >
              <p class="text-white text-base font-semibold truncate drop-shadow-lg">{{ prevBanner.title }}</p>
            </div>
          </div>
        </Transition>
      </div>

      <!-- 中间主卡片 -->
      <div
        class="banner-card banner-card--center flex-shrink-0 relative cursor-pointer rounded-2xl overflow-hidden"
        :style="centerCardStyle"
        @click="openFullPreview(currentBanner)"
        @mouseenter="centerCardHovered = true"
        @mouseleave="centerCardHovered = false"
      >
        <Transition :name="'slide-' + slideDirection">
          <div :key="activeIndex" class="absolute inset-0">
            <img
              v-if="currentBanner?.cover_url"
              :src="currentBanner.cover_url"
              :alt="currentBanner.title || ''"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-neutral-900 flex items-center justify-center">
              <span class="text-neutral-600">暂无轮播图</span>
            </div>
            <!-- 标题遮罩（hover 时显示） -->
            <div
              v-if="currentBanner?.title"
              class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 py-5 transition-opacity duration-300"
              :class="centerCardHovered ? 'opacity-100' : 'opacity-0'"
            >
              <p class="text-white text-xl font-semibold truncate drop-shadow-lg">{{ currentBanner.title }}</p>
            </div>
          </div>
        </Transition>
      </div>

      <!-- 右侧卡片 -->
      <div
        class="banner-card banner-card--side flex-shrink-0 relative cursor-pointer rounded-2xl overflow-hidden"
        :style="rightCardStyle"
        @click="openSideBanner('next')"
        @mouseenter="rightCardHovered = true"
        @mouseleave="rightCardHovered = false"
      >
        <Transition :name="'slide-' + slideDirection">
          <div :key="nextBannerKey" class="absolute inset-0">
            <img
              v-if="nextBanner?.cover_url"
              :src="nextBanner.cover_url"
              :alt="nextBanner.title || ''"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-neutral-900 flex items-center justify-center">
              <span class="text-neutral-600 text-sm">暂无图片</span>
            </div>
            <div
              v-if="nextBanner?.title"
              class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-4 transition-opacity duration-300"
              :class="rightCardHovered ? 'opacity-100' : 'opacity-0'"
            >
              <p class="text-white text-base font-semibold truncate drop-shadow-lg">{{ nextBanner.title }}</p>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 左右箭头 -->
    <button
      v-if="banners.length > 1"
      class="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/30 hover:bg-black/60 text-white/70 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm"
      aria-label="上一张"
      @click="prev"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
    </button>
    <button
      v-if="banners.length > 1"
      class="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/30 hover:bg-black/60 text-white/70 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm"
      aria-label="下一张"
      @click="next"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </button>

    <!-- 底部条形指示器 -->
    <div v-if="banners.length > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
      <button
        v-for="(_, idx) in banners"
        :key="idx"
        class="h-[3px] rounded-full transition-all duration-500"
        :class="idx === activeIndex ? 'w-7 bg-white' : 'w-3 bg-white/35 hover:bg-white/55'"
        :aria-label="'切换到第' + (idx + 1) + '张'"
        @click="goTo(idx)"
      />
    </div>

    <!-- 全屏预览（仿 CommunityDetail） -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showFullPreview && activeBanner" class="fixed inset-0 z-[9999] bg-black text-white overflow-hidden">
          <!-- 背景层：封面 / 静音预览视频 -->
          <div class="absolute inset-0 z-0">
            <transition name="fade">
              <img
                v-if="viewPhase === 'cover'"
                key="cover"
                :src="activeBanner.cover_url"
                :alt="activeBanner.title || ''"
                class="w-full h-full object-cover"
              />
              <video
                v-else-if="viewPhase === 'preview' && activeBanner.video_url"
                key="preview"
                ref="previewVideoRef"
                :src="activeBanner.video_url"
                class="w-full h-full object-cover"
                muted
                autoplay
                loop
                playsinline
              />
              <img
                v-else
                key="cover-fallback"
                :src="activeBanner.cover_url"
                :alt="activeBanner.title || ''"
                class="w-full h-full object-cover"
              />
            </transition>
            <!-- 渐变遮罩 -->
            <div class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" />
            <div class="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
          </div>

          <!-- 正式观看模式（全屏视频播放器） -->
          <transition name="fade">
            <div
              v-if="viewPhase === 'fullview'"
              class="absolute inset-0 z-30 bg-black select-none"
              @mousemove="showControls"
              @click="togglePlayPause"
            >
              <video
                ref="fullVideoRef"
                :src="activeBanner.video_url"
                class="w-full h-full object-contain"
                autoplay
                playsinline
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                @timeupdate="onTimeUpdate"
                @loadedmetadata="onVideoLoaded"
                @ended="exitFullView"
                @play="videoPlaying = true"
                @pause="videoPlaying = false"
                @contextmenu.prevent
              />

              <!-- 顶部栏 -->
              <transition name="ctrl-fade">
                <div v-show="controlsVisible" class="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
                  <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white transition" @click.stop="exitFullView">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                    返回
                  </button>
                  <button
                    v-if="activeBanner.workflow_id || activeBanner.work_id || parseWorkIdFromLink(activeBanner.external_link)"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white transition"
                    @click.stop="openWorkflowFromFullView"
                  >
                    查看制作过程 →
                  </button>
                </div>
              </transition>

              <!-- 底部控制栏 -->
              <transition name="ctrl-fade">
                <div v-show="controlsVisible" class="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/80 to-transparent pt-10 px-4 pb-4" @click.stop>
                  <!-- 进度条 -->
                  <div class="group relative h-1 bg-white/20 rounded-full mb-3 cursor-pointer" ref="progressBarRef" @click="seekVideo">
                    <div class="absolute left-0 top-0 h-full bg-white rounded-full transition-all" :style="{ width: progressPercent + '%' }" />
                    <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition" :style="{ left: progressPercent + '%', marginLeft: '-6px' }" />
                  </div>
                  <!-- 控制按钮行 -->
                  <div class="flex items-center gap-3">
                    <button class="w-8 h-8 flex items-center justify-center text-white hover:text-white/80 transition" @click.stop="togglePlayPause">
                      <svg v-if="videoPlaying" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
                      <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <span class="text-xs text-white/70 tabular-nums min-w-[90px]">{{ formatDuration(currentTime) }} / {{ formatDuration(duration) }}</span>
                    <div class="flex-1" />
                    <!-- 音量 -->
                    <div class="flex items-center gap-1.5">
                      <button class="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white transition" @click.stop="toggleMute">
                        <svg v-if="isMuted || volume === 0" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                        <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                      </button>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        :value="volume"
                        class="w-16 h-1 accent-white appearance-none bg-white/20 rounded-full cursor-pointer"
                        @input="setVolume($event.target.value)"
                        @click.stop
                      />
                    </div>
                    <!-- 全屏 -->
                    <button class="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white transition" @click.stop="toggleFullscreen">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                    </button>
                  </div>
                </div>
              </transition>
            </div>
          </transition>

          <!-- 前景内容层（正式观看时隐藏） -->
          <div v-show="viewPhase !== 'fullview'" class="relative z-20 h-screen flex flex-col overflow-hidden">
            <!-- 顶部栏：返回 + 标题 + 更新时间 -->
            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <button
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  @click="closeFullPreview"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  返回
                </button>
                <span class="text-sm text-white font-medium truncate max-w-[400px]">{{ activeBanner.title || '' }}</span>
              </div>
            </div>

            <!-- 弹性空间 -->
            <div class="flex-1" />

            <!-- 底部区域：标题 + 按钮 + 缩略图（紧凑排列） -->
            <div class="flex flex-col items-center pb-5">
              <!-- 标题 -->
              <h1 class="text-xl font-bold text-white mb-3 text-center max-w-[600px] px-4">{{ activeBanner.title || '' }}</h1>
              <!-- 操作按钮 -->
              <div class="flex items-center justify-center gap-3 mb-4">
                <button
                  v-if="activeBanner.video_url"
                  class="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white font-medium text-sm hover:bg-white/20 transition-colors"
                  @click="handlePlay"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  立即观看
                </button>
                <button
                  v-if="activeBanner.workflow_id || activeBanner.work_id || parseWorkIdFromLink(activeBanner.external_link)"
                  class="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm hover:bg-white/20 transition-colors"
                  @click="handleWorkflowPreview"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  查看制作过程
                </button>
                <a
                  v-if="activeBanner.external_link || activeBanner.link_url"
                  :href="activeBanner.external_link || activeBanner.link_url"
                  target="_blank"
                  class="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm hover:bg-white/20 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  查看链接
                </a>
              </div>
              <!-- 缩略图推荐列表 -->
              <div v-if="banners.length > 1" class="relative w-full max-w-[1200px] mx-auto px-10">
                <!-- 左箭头 -->
                <button
                  class="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                  @click="scrollRecommend(-1)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <!-- 缩略图 -->
                <div ref="recommendListRef" class="flex gap-2.5 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth justify-center py-2">
                  <div
                    v-for="(b, idx) in banners"
                    :key="b.id || idx"
                    class="flex-shrink-0 w-[210px] h-[118px] rounded-lg cursor-pointer transition-all duration-300 border-2"
                    :class="b === activeBanner ? 'border-white scale-105 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'"
                    @click="switchBanner(b, idx)"
                  >
                    <img
                      v-if="b.cover_url"
                      :src="b.cover_url"
                      :alt="b.title || ''"
                      class="w-full h-full object-cover rounded-md"
                    />
                    <div v-else class="w-full h-full bg-neutral-800 flex items-center justify-center rounded-md">
                      <span class="text-neutral-500 text-[10px]">{{ b.title || '无图' }}</span>
                    </div>
                  </div>
                </div>
                <!-- 右箭头 -->
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                  @click="scrollRecommend(1)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- 工作流预览弹窗 -->
          <WorkflowPreviewModal
            v-model="showWorkflowPreview"
            :workflow-id="previewWorkflowId"
            :work-id="bannerWorkId"
            :title="previewWorkflowTitle"
            :is-paid="bannerWork?.share_mode === 'paid'"
            :is-purchased="!!bannerWork?.is_purchased"
            :is-own="false"
            :price="bannerWork?.price || 0"
            :work="bannerWork || {}"
            :project-workflows="bannerProjectWorkflows"
            :project-info="bannerProjectInfo"
          />
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import WorkflowPreviewModal from './WorkflowPreviewModal.vue'
import { getWorkDetail, getProjectWorkflows } from '@/api/community'
import { useCommunityStore } from '@/stores/community'

const communityStore = useCommunityStore()

const props = defineProps({
  banners: { type: Array, default: () => [] }
})

const activeIndex = ref(0)
const slideDirection = ref('left')
let timer = null
let previewTimer = null
let controlsTimer = null

// 全屏预览
const showFullPreview = ref(false)
const activeBanner = ref(null)
const viewPhase = ref('cover') // 'cover' | 'preview' | 'fullview'

// 视频播放器
const recommendListRef = ref(null)
const previewVideoRef = ref(null)
const fullVideoRef = ref(null)
const videoPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const controlsVisible = ref(true)
const progressBarRef = ref(null)

// Banner hover 状态
const centerCardHovered = ref(false)
const leftCardHovered = ref(false)
const rightCardHovered = ref(false)

// 工作流预览
const showWorkflowPreview = ref(false)
const previewWorkflowId = ref('')
const previewWorkflowTitle = ref('')

// Banner 关联作品信息（用于工作流预览 + 克隆）
const bannerWork = ref(null)
const bannerWorkId = ref(0)
const bannerProjectInfo = ref(null)
const bannerProjectWorkflows = ref([])

const progressPercent = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0)

const currentBanner = computed(() => props.banners[activeIndex.value] || null)
const prevBanner = computed(() => {
  if (!props.banners.length) return null
  return props.banners[(activeIndex.value - 1 + props.banners.length) % props.banners.length]
})
const nextBanner = computed(() => {
  if (!props.banners.length) return null
  return props.banners[(activeIndex.value + 1) % props.banners.length]
})

const prevBannerKey = computed(() => {
  if (!props.banners.length) return 'banner-prev-empty'
  return (activeIndex.value - 1 + props.banners.length) % props.banners.length
})
const nextBannerKey = computed(() => {
  if (!props.banners.length) return 'banner-next-empty'
  return (activeIndex.value + 1) % props.banners.length
})

const centerCardStyle = computed(() => ({
  width: '34%',
  aspectRatio: '16 / 9',
  zIndex: 2,
}))

const leftCardStyle = computed(() => ({
  width: '30%',
  aspectRatio: '16 / 9',
  transform: 'perspective(1000px) rotateY(4deg)',
  transformOrigin: 'right center',
  filter: leftCardHovered.value ? 'brightness(0.85)' : 'brightness(0.7)',
  transition: 'filter 0.3s ease',
}))

const rightCardStyle = computed(() => ({
  width: '30%',
  aspectRatio: '16 / 9',
  transform: 'perspective(1000px) rotateY(-4deg)',
  transformOrigin: 'left center',
  filter: rightCardHovered.value ? 'brightness(0.85)' : 'brightness(0.7)',
  transition: 'filter 0.3s ease',
}))

function next() {
  if (!props.banners.length) return
  slideDirection.value = 'left'
  activeIndex.value = (activeIndex.value + 1) % props.banners.length
  resetTimer()
}

function prev() {
  if (!props.banners.length) return
  slideDirection.value = 'right'
  activeIndex.value = (activeIndex.value - 1 + props.banners.length) % props.banners.length
  resetTimer()
}

function goTo(idx) {
  if (idx === activeIndex.value) return
  slideDirection.value = idx > activeIndex.value ? 'left' : 'right'
  activeIndex.value = idx
  resetTimer()
}

function openSideBanner(direction) {
  const banner = direction === 'prev' ? prevBanner.value : nextBanner.value
  if (!banner) return
  if (direction === 'prev') {
    slideDirection.value = 'right'
    activeIndex.value = (activeIndex.value - 1 + props.banners.length) % props.banners.length
  } else {
    slideDirection.value = 'left'
    activeIndex.value = (activeIndex.value + 1) % props.banners.length
  }
  openFullPreview(banner)
}

// --- 全屏预览 ---
function openFullPreview(banner) {
  if (!banner) return
  activeBanner.value = banner
  viewPhase.value = 'cover'
  showFullPreview.value = true
  stopTimer()
  document.body.style.overflow = 'hidden'
  startPreviewTimer()
}

function closeFullPreview() {
  clearTimeout(previewTimer)
  clearTimeout(controlsTimer)
  viewPhase.value = 'cover'
  showFullPreview.value = false
  activeBanner.value = null
  videoPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  document.body.style.overflow = ''
  resetTimer()
}

function startPreviewTimer() {
  clearTimeout(previewTimer)
  if (activeBanner.value?.video_url) {
    previewTimer = setTimeout(() => {
      if (viewPhase.value === 'cover') {
        viewPhase.value = 'preview'
      }
    }, 3000)
  }
}

// --- 视频正式播放 ---
function handlePlay() {
  if (!activeBanner.value?.video_url) return
  clearTimeout(previewTimer)
  viewPhase.value = 'fullview'
  controlsVisible.value = true
  nextTick(() => {
    if (fullVideoRef.value) {
      fullVideoRef.value.volume = volume.value
      fullVideoRef.value.play?.()
    }
    showControls()
  })
}

function exitFullView() {
  viewPhase.value = 'cover'
  videoPlaying.value = false
  currentTime.value = 0
  startPreviewTimer()
}

function togglePlayPause() {
  const v = fullVideoRef.value
  if (!v) return
  if (v.paused) v.play()
  else v.pause()
}

function onTimeUpdate() {
  if (fullVideoRef.value) {
    currentTime.value = fullVideoRef.value.currentTime
  }
}

function onVideoLoaded() {
  if (fullVideoRef.value) {
    duration.value = fullVideoRef.value.duration
  }
}

function seekVideo(e) {
  const bar = progressBarRef.value
  const v = fullVideoRef.value
  if (!bar || !v) return
  const rect = bar.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  v.currentTime = ratio * v.duration
}

function showControls() {
  controlsVisible.value = true
  clearTimeout(controlsTimer)
  controlsTimer = setTimeout(() => {
    if (videoPlaying.value) controlsVisible.value = false
  }, 3000)
}

function toggleMute() {
  if (fullVideoRef.value) {
    isMuted.value = !isMuted.value
    fullVideoRef.value.muted = isMuted.value
  }
}

function setVolume(val) {
  volume.value = parseFloat(val)
  if (fullVideoRef.value) {
    fullVideoRef.value.volume = volume.value
    isMuted.value = volume.value === 0
    fullVideoRef.value.muted = isMuted.value
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen?.()
  }
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseWorkIdFromLink(link) {
  if (!link) return 0
  const match = link.match(/\/community\/(?:work\/)?(\d+)/)
  return match ? parseInt(match[1]) : 0
}

// --- 工作流预览 ---
async function handleWorkflowPreview() {
  const banner = activeBanner.value
  if (!banner?.workflow_id && !banner?.work_id && !parseWorkIdFromLink(banner?.external_link)) return

  previewWorkflowId.value = banner.workflow_id || ''
  previewWorkflowTitle.value = banner.title || '工作流预览'
  bannerWork.value = null
  bannerWorkId.value = 0
  bannerProjectInfo.value = null
  bannerProjectWorkflows.value = []

  const workId = banner.work_id || parseWorkIdFromLink(banner.external_link)
  if (workId) {
    bannerWorkId.value = workId
    try {
      const res = await getWorkDetail(workId)
      bannerWork.value = res.work || res.data || res
      if (!previewWorkflowId.value && bannerWork.value.workflow_id) {
        previewWorkflowId.value = bannerWork.value.workflow_id
      }
      if (bannerWork.value.project_id) {
        try {
          const projRes = await getProjectWorkflows(workId)
          if (projRes.data?.project) {
            bannerProjectInfo.value = projRes.data.project
            bannerProjectWorkflows.value = projRes.data.workflows || []
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[BannerCarousel] 加载作品信息失败:', e)
    }
  }

  showWorkflowPreview.value = true
}

function openWorkflowFromFullView() {
  exitFullView()
  nextTick(handleWorkflowPreview)
}

// --- 底部推荐切换 ---
function switchBanner(banner, idx) {
  if (banner === activeBanner.value) return
  clearTimeout(previewTimer)
  viewPhase.value = 'cover'
  activeBanner.value = banner
  activeIndex.value = idx
  videoPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  startPreviewTimer()
}

function scrollRecommend(direction) {
  const el = recommendListRef.value
  if (!el) return
  el.scrollBy({ left: direction * 260, behavior: 'smooth' })
}

// ESC 键处理
function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showWorkflowPreview.value) return
    if (viewPhase.value === 'fullview') {
      exitFullView()
    } else if (showFullPreview.value) {
      closeFullPreview()
    }
  }
}

// --- 轮播定时器 ---
function startTimer() {
  stopTimer()
  if (props.banners.length > 1) {
    timer = setInterval(next, 5000)
  }
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

function resetTimer() {
  stopTimer()
  startTimer()
}

watch(() => props.banners.length, () => {
  activeIndex.value = 0
  resetTimer()
})

onMounted(() => {
  startTimer()
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  stopTimer()
  clearTimeout(previewTimer)
  clearTimeout(controlsTimer)
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.banner-carousel {
  perspective: 1200px;
}
.banner-cards {
  transform-style: preserve-3d;
}
.banner-card--center {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  z-index: 2;
}
.banner-card--side {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  z-index: 1;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.ctrl-fade-enter-active, .ctrl-fade-leave-active {
  transition: opacity 0.3s ease;
}
.ctrl-fade-enter-from, .ctrl-fade-leave-to {
  opacity: 0;
}
/* 向左滑动（next） */
.slide-left-enter-from {
  transform: translateX(100%);
}
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.slide-left-leave-to {
  transform: translateX(-100%);
}
/* 向右滑动（prev） */
.slide-right-enter-from {
  transform: translateX(-100%);
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.slide-right-leave-to {
  transform: translateX(100%);
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
