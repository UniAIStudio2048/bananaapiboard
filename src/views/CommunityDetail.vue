<template>
  <div class="relative min-h-screen bg-black text-white overflow-hidden">
    <!-- 加载状态 -->
    <div v-if="loading" class="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-4">
      <p class="text-gray-400">{{ error }}</p>
      <button
        class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
        @click="goBack()"
      >
        返回
      </button>
    </div>

    <!-- 主内容 -->
    <template v-else-if="work">
      <!-- 背景层：封面图 / 静音预览视频 -->
      <div class="absolute inset-0 z-0">
        <transition name="fade">
          <img
            v-if="viewPhase === 'cover'"
            key="cover"
            :src="work.cover_url"
            :alt="work.title"
            class="w-full h-full object-cover"
          />
          <video
            v-else-if="viewPhase === 'preview' && work.media_type === 'video' && work.media_url"
            key="preview"
            ref="previewVideoRef"
            :src="work.media_url"
            class="w-full h-full object-cover"
            muted
            autoplay
            loop
            playsinline
          />
          <img
            v-else
            key="cover-fallback"
            :src="work.cover_url"
            :alt="work.title"
            class="w-full h-full object-cover"
          />
        </transition>
        <!-- 渐变遮罩 -->
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" />
        <div class="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
      </div>

      <!-- 正式观看模式（自定义播放器） -->
      <transition name="fade">
        <div
          v-if="viewPhase === 'fullview'"
          ref="playerContainerRef"
          class="absolute inset-0 z-30 bg-black select-none"
          @contextmenu.prevent
          @mousemove="showControls"
          @click="togglePlayPause"
        >
          <video
            v-if="work.media_type === 'video'"
            ref="fullVideoRef"
            :src="videoStreamUrl"
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
                v-if="work.workflow_id"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white transition"
                @click.stop="openWorkflowFromFullView(work.workflow_id)"
              >
                查看制作过程 →
              </button>
            </div>
          </transition>

          <!-- 底部控制栏 -->
          <transition name="ctrl-fade">
            <div v-show="controlsVisible" class="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/80 to-transparent pt-10 px-4 pb-4" @click.stop>
              <!-- 进度条 -->
              <div class="group relative h-1 bg-white/20 rounded-full mb-3 cursor-pointer" @click="seekVideo" ref="progressBarRef">
                <div class="absolute left-0 top-0 h-full bg-white rounded-full transition-all" :style="{ width: progressPercent + '%' }" />
                <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition" :style="{ left: progressPercent + '%', marginLeft: '-6px' }" />
              </div>
              <!-- 控制按钮行 -->
              <div class="flex items-center gap-3">
                <!-- 播放/暂停 -->
                <button class="w-8 h-8 flex items-center justify-center text-white hover:text-white/80 transition" @click.stop="togglePlayPause">
                  <svg v-if="videoPlaying" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
                  <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <!-- 时间 -->
                <span class="text-xs text-white/70 tabular-nums min-w-[90px]">{{ formatDuration(currentTime) }} / {{ formatDuration(duration) }}</span>
                <!-- 弹性空间 -->
                <div class="flex-1" />
                <!-- 倍速 -->
                <div class="relative" @mouseenter="showSpeedMenu = true" @mouseleave="showSpeedMenu = false">
                  <button class="px-2 py-1 text-xs text-white/80 hover:text-white bg-white/10 rounded transition" @click.stop>
                    {{ playbackRate === 1 ? '倍速' : playbackRate + 'x' }}
                  </button>
                  <div v-show="showSpeedMenu" class="absolute bottom-full right-0 mb-2 py-1 bg-gray-900/95 border border-white/10 rounded-lg shadow-xl min-w-[100px] backdrop-blur-sm">
                    <button
                      v-for="rate in speedOptions"
                      :key="rate"
                      class="block w-full px-4 py-1.5 text-xs text-left transition"
                      :class="playbackRate === rate ? 'text-blue-400' : 'text-white/70 hover:text-white hover:bg-white/10'"
                      @click.stop="setSpeed(rate)"
                    >{{ rate }}x{{ rate === 1 ? ' 默认' : '' }}</button>
                  </div>
                </div>
                <!-- 画质 -->
                <div class="relative" @mouseenter="showQualityMenu = true" @mouseleave="showQualityMenu = false">
                  <button class="px-2 py-1 text-xs text-white/80 hover:text-white bg-white/10 rounded transition" @click.stop>
                    {{ currentQualityLabel }}
                  </button>
                  <div v-show="showQualityMenu" class="absolute bottom-full right-0 mb-2 py-1 bg-gray-900/95 border border-white/10 rounded-lg shadow-xl min-w-[120px] backdrop-blur-sm">
                    <button
                      v-for="q in qualityOptions"
                      :key="q.value"
                      class="flex items-center justify-between w-full px-4 py-1.5 text-xs text-left transition"
                      :class="currentQuality === q.value ? 'text-blue-400' : 'text-white/70 hover:text-white hover:bg-white/10'"
                      @click.stop="setQuality(q.value)"
                    >
                      <span>{{ q.label }}</span>
                      <svg v-if="currentQuality === q.value" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </button>
                  </div>
                </div>
                <!-- 音量 -->
                <div class="flex items-center gap-1.5">
                  <button class="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white transition" @click.stop="toggleMute">
                    <svg v-if="isMuted || volume === 0" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                    <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                  </button>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    :value="volume"
                    class="w-16 h-1 accent-white appearance-none bg-white/20 rounded-full cursor-pointer volume-slider"
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
        <!-- 顶部栏：返回 + 作者信息 -->
        <div class="flex items-center justify-between px-5 py-4">
          <div class="flex items-center gap-3">
            <button
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="返回"
              @click="goBack()"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-white/10"
              :disabled="!authorId"
              @click="goToAuthorProfile"
            >
              <img
                v-if="work.author_avatar"
                :src="work.author_avatar"
                alt="作者头像"
                class="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
              <div v-else class="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <span class="text-gray-300 text-xs">{{ (work.author_name || '?')[0] }}</span>
              </div>
              <span class="text-sm text-white font-medium truncate max-w-[400px]">{{ work.author_name || '匿名用户' }}</span>
            </button>
            <FollowButton
              v-if="normalizedAuthorProfile && !normalizedAuthorProfile.is_self"
              :user-id="String(normalizedAuthorProfile.id)"
              :initial-following="!!normalizedAuthorProfile.is_following"
              :initial-mutual="!!normalizedAuthorProfile.is_mutual_follow"
              size="small"
              @changed="handleFollowChanged"
              @login-required="handleLoginRequired('follow')"
            />
          </div>
          <p class="text-xs text-gray-400 flex-shrink-0">
            {{ formatTime(work.updated_at || work.created_at) }}
          </p>
        </div>

        <!-- 弹性空间 -->
        <div class="flex-1" />

        <!-- 底部区域：标题 + 按钮 + 缩略图（居中排列，仿 Banner 风格） -->
        <div class="flex flex-col items-center pb-5">
          <!-- 标题 -->
          <h1 class="text-xl font-bold text-white mb-3 text-center max-w-[600px] px-4">
            {{ work.title || '无标题' }}
            <span v-if="projectInfo" class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-400 ml-2 font-normal align-middle">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
              项目
            </span>
          </h1>

          <!-- 操作按钮 -->
          <div class="mb-4 flex flex-wrap items-center justify-center gap-3 px-4">
            <!-- 立即观看 -->
            <button
              class="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              @click="handlePlay"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              立即观看
            </button>
            <!-- 查看制作过程 -->
            <button
              v-if="work.workflow_id"
              class="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              @click="handleWorkflowPreview(work.workflow_id)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              查看制作过程
            </button>
            <!-- 点赞 -->
            <button
              class="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm transition-colors"
              :class="work.is_liked ? 'text-red-400' : 'text-white hover:bg-white/20'"
              :disabled="isLiking"
              aria-label="点赞"
              @click="handleLike"
            >
              <svg class="w-4 h-4" :fill="work.is_liked ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
              </svg>
              点赞
            </button>
            <!-- 分享 -->
            <button
              class="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
              aria-label="分享"
              @click="handleShare"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
              分享
            </button>
          </div>


          <!-- 缩略图推荐列表 -->
          <div v-if="relatedWorks.length" class="relative w-full max-w-[1200px] mx-auto px-10">
            <button
              class="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              @click="scrollRecommend(-1)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div
              ref="stripRef"
              class="flex gap-2.5 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth justify-center py-2"
            >
              <router-link
                v-for="item in relatedWorks"
                :key="item.id"
                :to="`/community/${item.id}`"
                :data-active="item.id === work.id ? 'true' : 'false'"
                class="flex-shrink-0 w-[210px] h-[118px] rounded-lg cursor-pointer transition-all duration-300 border-2"
                :class="item.id === work.id ? 'border-white scale-105 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'"
              >
                <img
                  v-if="item.cover_url"
                  :src="item.cover_url"
                  :alt="item.title"
                  class="w-full h-full object-cover rounded-md"
                  loading="lazy"
                />
                <div v-else class="w-full h-full bg-neutral-800 flex items-center justify-center rounded-md">
                  <span class="text-neutral-500 text-[10px]">{{ item.title || '无图' }}</span>
                </div>
              </router-link>
            </div>
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              @click="scrollRecommend(1)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Toast 提示 -->
      <transition name="fade">
        <div
          v-if="showToast"
          class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-gray-800 text-sm text-gray-200 shadow-lg"
        >
          {{ toastMsg }}
        </div>
      </transition>

      <LoginModal v-model="communityStore.showLoginModal" @login-success="handleLoginSuccess" />

      <!-- 工作流预览弹窗 -->
      <WorkflowPreviewModal
        v-model="showWorkflowPreview"
        :workflow-id="previewWorkflowId"
        :work-id="work.id"
        :title="work.title"
        :is-paid="work.share_mode === 'paid'"
        :is-purchased="!!work.is_purchased"
        :is-own="isOwnWork"
        :price="work.price || 0"
        :work="work"
        :project-workflows="projectWorkflows"
        :project-info="projectInfo"
        @purchased="onWorkPurchased"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCommunityStore } from '@/stores/community'
import { getWorkDetail, getWorks, toggleLike as apiToggleLike, toggleFavorite as apiToggleFavorite, getProjectWorkflows, getCommunityUserProfile } from '@/api/community'
import WorkflowPreviewModal from '@/components/community/WorkflowPreviewModal.vue'
import FollowButton from '@/components/community/FollowButton.vue'
import LoginModal from '@/components/community/LoginModal.vue'

const route = useRoute()
const router = useRouter()
const communityStore = useCommunityStore()

function goBack() {
  const backPath = router.options.history.state?.back
  if (backPath && typeof backPath === 'string' &&
      (backPath === '/' || backPath === '/community')) {
    router.back()
  } else {
    router.replace('/')
  }
}

function goToAuthorProfile() {
  if (!authorId.value) return
  router.push(`/community/users/${authorId.value}`)
}

// 状态
const work = ref(null)
const loading = ref(true)
const error = ref('')
const viewPhase = ref('cover')
const isLiking = ref(false)
const showToast = ref(false)
const toastMsg = ref('')
const relatedWorks = ref([])
const authorProfile = ref(null)
const authorProfileLoading = ref(false)
const authorProfileError = ref('')
const pendingAction = ref('')
const previewVideoRef = ref(null)
const fullVideoRef = ref(null)
const playerContainerRef = ref(null)
const progressBarRef = ref(null)
const stripRef = ref(null)
const showWorkflowPreview = ref(false)
const previewWorkflowId = ref('')
let previewTimer = null

// 项目信息
const projectInfo = ref(null)
const projectWorkflows = ref([])

// 自定义播放器状态
const videoPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const playbackRate = ref(1)
const currentQuality = ref('1080p')
const controlsVisible = ref(true)
const showSpeedMenu = ref(false)
const showQualityMenu = ref(false)
let controlsTimer = null

const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2]
const qualityOptions = [
  { label: '自动', value: 'auto' },
  { label: '480p 流畅', value: '480p' },
  { label: '720p 高清', value: '720p' },
  { label: '1080p 原画质', value: '1080p' }
]
const currentQualityLabel = computed(() => qualityOptions.find(q => q.value === currentQuality.value)?.label || '1080p 原画质')
const progressPercent = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0)

const videoStreamUrl = computed(() => {
  if (!work.value?.id) return ''
  return `/api/community/works/${work.value.id}/stream`
})

const authorId = computed(() => work.value?.author_id || work.value?.user_id || '')

const currentUserId = computed(() => {
  return localStorage.getItem('user_id') || localStorage.getItem('userId') || ''
})

const normalizedAuthorProfile = computed(() => {
  if (!authorProfile.value) return null

  const currentId = String(currentUserId.value || '')
  const profileId = String(authorProfile.value?.id || authorProfile.value?.user_id || '')
  const workAuthorId = String(authorId.value || '')
  const isSelf = !!currentId && (currentId === profileId || currentId === workAuthorId)

  return {
    ...authorProfile.value,
    is_self: isSelf || !!authorProfile.value?.is_self
  }
})

const isOwnWork = computed(() => {
  return !!currentUserId.value && !!work.value?.user_id && String(work.value.user_id) === String(currentUserId.value)
})

async function onWorkPurchased() {
  await loadWork(route.params.id)
}

async function loadAuthorProfile(userId) {
  if (!userId) {
    authorProfile.value = null
    authorProfileError.value = ''
    return
  }

  authorProfileLoading.value = true
  authorProfileError.value = ''
  try {
    const response = await getCommunityUserProfile(userId)
    authorProfile.value = response?.data || response?.profile || response || null
  } catch (e) {
    console.error('[CommunityDetail] 加载作者信息失败:', e)
    authorProfile.value = null
    authorProfileError.value = e?.message || '加载作者信息失败'
  } finally {
    authorProfileLoading.value = false
  }
}

// 格式化时间
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${day}日 ${h}:${min}`
}

// Toast 工具
let toastTimer = null
function toast(msg) {
  toastMsg.value = msg
  showToast.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { showToast.value = false }, 2000)
}

// 加载作品详情
async function loadWork(id) {
  loading.value = true
  error.value = ''
  viewPhase.value = 'cover'
  clearTimeout(previewTimer)
  authorProfile.value = null
  authorProfileError.value = ''
  try {
    const res = await getWorkDetail(id)
    work.value = res.work || res.data || res
    await loadAuthorProfile(authorId.value)
    // 加载项目信息
    projectInfo.value = null
    projectWorkflows.value = []
    if (work.value.project_id) {
      try {
        const projRes = await getProjectWorkflows(work.value.id)
        if (projRes.data?.project) {
          projectInfo.value = projRes.data.project
          projectWorkflows.value = projRes.data.workflows || []
        }
      } catch (e) {
        console.error('[CommunityDetail] 加载项目信息失败:', e)
      }
    }
    nextTick(() => startPreviewTimer())
  } catch (e) {
    error.value = e.message || '加载作品失败'
    work.value = null
  } finally {
    loading.value = false
  }
}

// 加载相关作品
async function loadRelated() {
  try {
    const res = await getWorks({ pageSize: 20 })
    relatedWorks.value = (res.data?.works || res.works || []).map(normalizeRelatedWork)
  } catch {
    relatedWorks.value = []
  }
}

function startPreviewTimer() {
  clearTimeout(previewTimer)
  if (work.value?.media_type === 'video' && work.value?.media_url) {
    previewTimer = setTimeout(() => {
      if (viewPhase.value === 'cover') {
        viewPhase.value = 'preview'
      }
    }, 3000)
  }
}

function handlePlay() {
  clearTimeout(previewTimer)
  viewPhase.value = 'fullview'
  controlsVisible.value = true
  nextTick(() => {
    if (fullVideoRef.value) {
      fullVideoRef.value.playbackRate = playbackRate.value
      fullVideoRef.value.volume = volume.value
      fullVideoRef.value.play?.()
    }
    showControls()
  })
}

function exitFullView() {
  viewPhase.value = 'preview'
  clearTimeout(controlsTimer)
  if (fullVideoRef.value) {
    fullVideoRef.value.pause()
    fullVideoRef.value.currentTime = 0
  }
}

function togglePlayPause(e) {
  if (e?.target?.closest?.('button, a, input, [data-no-toggle]')) return
  const v = fullVideoRef.value
  if (!v) return
  if (v.paused) { v.play() } else { v.pause() }
}

function onTimeUpdate() {
  const v = fullVideoRef.value
  if (v) currentTime.value = v.currentTime
}

function onVideoLoaded() {
  const v = fullVideoRef.value
  if (v) {
    duration.value = v.duration
    v.playbackRate = playbackRate.value
  }
}

function seekVideo(e) {
  const v = fullVideoRef.value
  const bar = progressBarRef.value
  if (!v || !bar) return
  const rect = bar.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  v.currentTime = ratio * v.duration
}

function setSpeed(rate) {
  playbackRate.value = rate
  if (fullVideoRef.value) fullVideoRef.value.playbackRate = rate
  showSpeedMenu.value = false
}

function setQuality(q) {
  currentQuality.value = q
  showQualityMenu.value = false
}

function setVolume(val) {
  volume.value = Number(val)
  isMuted.value = val == 0
  if (fullVideoRef.value) {
    fullVideoRef.value.volume = volume.value
    fullVideoRef.value.muted = isMuted.value
  }
}

function toggleMute() {
  isMuted.value = !isMuted.value
  if (fullVideoRef.value) fullVideoRef.value.muted = isMuted.value
}

function toggleFullscreen() {
  const el = playerContainerRef.value
  if (!el) return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    el.requestFullscreen?.()
  }
}

function showControls() {
  controlsVisible.value = true
  clearTimeout(controlsTimer)
  controlsTimer = setTimeout(() => {
    if (videoPlaying.value) controlsVisible.value = false
  }, 3000)
}

function formatDuration(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function scrollRecommend(direction) {
  const el = stripRef.value
  if (!el) return
  el.scrollBy({ left: direction * 260, behavior: 'smooth' })
}

function handleLoginRequired(action = '') {
  pendingAction.value = action
  communityStore.showLoginModal = true
}

function handleMessageClick(userId) {
  if (!userId) return
  router.push(`/community/messages?userId=${userId}`)
}

function handleFollowChanged(payload) {
  if (!authorProfile.value) return

  const wasFollowing = !!authorProfile.value.is_following
  const nextFollowing = !!(payload?.isFollowing ?? payload?.is_following)
  const nextMutual = !!(payload?.isMutual ?? payload?.is_mutual_follow)

  authorProfile.value = {
    ...authorProfile.value,
    is_following: nextFollowing,
    is_mutual_follow: nextMutual,
    follower_count: Math.max(
      0,
      Number(authorProfile.value.follower_count || 0) + (wasFollowing === nextFollowing ? 0 : (nextFollowing ? 1 : -1))
    )
  }
}


function handleLoginSuccess() {
  if (pendingAction.value === 'message' && authorId.value) {
    router.push(`/community/messages?userId=${authorId.value}`)
  }
  pendingAction.value = ''
}

function normalizeRelatedWork(item) {
  if (!item) return item
  if (!work.value) return item

  return {
    ...item,
    author_name: item.author_name || work.value.author_name,
    author_avatar: item.author_avatar || work.value.author_avatar
  }
}

function syncRelatedWorkState(workId, patch) {
  relatedWorks.value = relatedWorks.value.map(item => {
    if (String(item.id) !== String(workId)) return item
    return {
      ...item,
      ...patch
    }
  })
}

function updateLikeState(targetWork, data) {
  const nextLiked = data.liked ?? !targetWork.is_liked
  const baseCount = Number(targetWork.like_count || 0)
  const fallbackCount = baseCount + (nextLiked ? 1 : -1)

  return {
    ...targetWork,
    is_liked: nextLiked,
    like_count: Math.max(0, Number(data.like_count ?? fallbackCount))
  }
}

function handleWorkflowPreview(workflowId) {
  if (!workflowId) return
  previewWorkflowId.value = workflowId
  showWorkflowPreview.value = true
}

function openWorkflowFromFullView(workflowId) {
  exitFullView()
  nextTick(() => handleWorkflowPreview(workflowId))
}

onBeforeUnmount(() => {
  clearTimeout(previewTimer)
  clearTimeout(controlsTimer)
})

// 点赞
async function handleLike() {
  if (!communityStore.requireLogin()) return
  if (isLiking.value) return
  isLiking.value = true
  try {
    const res = await apiToggleLike(work.value.id)
    const data = res.data || res
    work.value = updateLikeState(work.value, data)
    syncRelatedWorkState(work.value.id, {
      is_liked: work.value.is_liked,
      like_count: work.value.like_count
    })
    apiToggleFavorite(work.value.id).catch(() => {})
  } catch (e) {
    toast(e.message || '操作失败')
  } finally {
    isLiking.value = false
  }
}

// 分享
async function handleShare() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast('链接已复制到剪贴板')
  } catch {
    toast('复制失败，请手动复制链接')
  }
}

// 监听路由变化
watch(() => route.params.id, async (id) => {
  if (id) {
    pendingAction.value = ''
    await loadWork(id)
    await loadRelated()
    // 滚动缩略图条到当前作品
    nextTick(() => {
      const active = stripRef.value?.querySelector('[data-active="true"]')
      active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    })
  }
}, { immediate: true })

watch(authorProfile, (nextProfile) => {
  if (!nextProfile || !work.value) return

  work.value = {
    ...work.value,
    author_name: nextProfile.username || nextProfile.nickname || work.value.author_name,
    author_avatar: nextProfile.avatar_url || nextProfile.avatar || work.value.author_avatar
  }

  relatedWorks.value = relatedWorks.value.map(normalizeRelatedWork)
})

// watch immediate: true 已在挂载时触发加载，无需 onMounted 重复调用
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.ctrl-fade-enter-active,
.ctrl-fade-leave-active {
  transition: opacity 0.3s ease;
}
.ctrl-fade-enter-from,
.ctrl-fade-leave-to {
  opacity: 0;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
video::-webkit-media-controls-enclosure {
  display: none !important;
}
video::-webkit-media-controls {
  display: none !important;
}
.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: white;
  cursor: pointer;
}
.volume-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: white;
  border: none;
  cursor: pointer;
}
</style>
