<script setup>
import { t as translateUi } from '@/i18n'

/**
 * 灵感中心 — 主站风格延伸的"创作灵感入口"
 *
 * 汇聚「特色功能能力展示 + 灵感作品精选 + 提示词灵感」，
 * 与社区（纯黑画廊风）互补：这里是"开始创作"，社区是"作品展示"。
 */
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import IconSet from '@/components/common/IconSet.vue'
import WorkCard from '@/components/community/WorkCard.vue'
import { getFeatures, getWorks } from '@/api/community'
import { getFeatureIcon } from '@/utils/feature-icons'

const router = useRouter()

// ==================== 特色功能宫格 ====================
const features = ref([])
const featuresLoading = ref(true)

// 接口 icon 字段不匹配 feature-icons 时的默认兜底图标
const FALLBACK_ICON = 'sparkles'

// 特色功能接口只返回 { id, label, icon, workflow_id }，无 description 字段，
// 这里按功能语义补齐一句话说明（icon 取不到时走兜底图标）
const FEATURE_DESCRIPTIONS = {
  get wand() { return translateUi('uiMessages.me7ab9c8d43a9') },
  get infinity() { return translateUi('uiMessages.m01a73abef93e') },
  get globe() { return translateUi('uiMessages.mb6c0dd9c4be3') },
  get img2img() { return translateUi('uiMessages.m32a9a9706c76') },
  get brain() { return translateUi('uiMessages.m942e39804afd') },
  get sparkles() { return translateUi('uiMessages.m07e0ed68f83f') },
  get layout() { return translateUi('uiMessages.mc88c878cf51f') },
  get users() { return translateUi('uiMessages.ma54b9bb52a57') },
  get video() { return translateUi('uiMessages.mc937c8806b29') },
  get flame() { return translateUi('uiMessages.m207a5d34fed3') },
  get portrait() { return translateUi('uiMessages.m568aa8aa171d') },
  'bg-remove': translateUi('uiMessages.m2d982d2ebf55'),
  get upscale() { return translateUi('uiMessages.mff3dc5978c7b') },
}

/** 解析接口 icon → feature-icons 可渲染的图标名 */
function resolveIconName(raw) {
  if (!raw) return FALLBACK_ICON
  return getFeatureIcon(raw) ? raw : FALLBACK_ICON
}

/** 生成一句话说明 */
function featureDescription(rawIcon, label) {
  const iconName = resolveIconName(rawIcon)
  return (
    FEATURE_DESCRIPTIONS[rawIcon]
    || FEATURE_DESCRIPTIONS[iconName]
    || translateUi('uiMessages.m25717c0f8801', { value1: (label || translateUi('uiMessages.mb2fedafc399a')) })
  )
}

/** 按功能语义映射「开始使用」的创作入口 */
function featureRoute(feature) {
  const text = `${feature.icon || ''} ${feature.label || ''}`.toLowerCase()
  if (/video|film|字幕|水印|视频/.test(text)) return '/video'
  if (/canvas|分镜|三视图|multi-angle|storyboard|九宫格|角色/.test(text)) return '/canvas'
  return '/generate'
}

const featureCards = computed(() =>
  features.value.map((f) => ({
    id: f.id,
    icon: resolveIconName(f.icon),
    label: (f.label || '').trim() || translateUi('uiMessages.me42af1eb7c7f'),
    description: featureDescription(f.icon, f.label),
    route: featureRoute(f),
  }))
)

async function loadFeatures() {
  featuresLoading.value = true
  try {
    const res = await getFeatures()
    const list = res?.data?.data || res?.data || []
    features.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('[Inspiration] 加载特色功能失败:', e)
    features.value = []
  } finally {
    featuresLoading.value = false
  }
}

// ==================== 灵感作品（复用社区作品接口） ====================
const works = ref([])
const worksLoading = ref(true)

async function loadWorks() {
  worksLoading.value = true
  try {
    // 优先取精选作品，为空则回退到最新作品
    let list = []
    const featuredRes = await getWorks({ page: 1, pageSize: 12, featured: 1 })
    list = featuredRes?.data?.works || featuredRes?.works || []
    if (!list.length) {
      const res = await getWorks({ page: 1, pageSize: 12 })
      list = res?.data?.works || res?.works || []
    }
    works.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('[Inspiration] 加载灵感作品失败:', e)
    works.value = []
  } finally {
    worksLoading.value = false
  }
}

function goToWork(work) {
  if (work?.id) router.push(`/community/${work.id}`)
}

// ==================== 提示词灵感 ====================
const promptIdeas = [
  '赛博朋克城市夜景，霓虹灯光反射在潮湿的街道上，电影级光影氛围',
  '水墨山水画风格，云雾缭绕的群山，大量留白，意境悠远',
  '一只戴着宇航头盔的橘猫，皮克斯风格，柔和光线，高细节',
  '未来主义概念汽车设计草图，流线型车身，干净利落的线稿',
  '奇幻森林中发光的蘑菇小屋，童话绘本插画风，温暖色调',
  '落日时分的海边灯塔，胶片颗粒质感，复古电影色调',
]

const toastVisible = ref(false)
const toastText = ref('')
let toastTimer = null

async function copyPrompt(text) {
  try {
    await navigator.clipboard.writeText(text)
    toastText.value = translateUi('uiMessages.m0aaba293d401')
  } catch (e) {
    toastText.value = translateUi('uiMessages.m97f4308501ff')
  }
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2000)
}

onMounted(() => {
  loadFeatures()
  loadWorks()
})
</script>

<template>
  <div class="min-h-screen bg-canvas text-slate-900 dark:text-slate-100">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">

      <!-- Hero -->
      <section class="text-center max-w-3xl mx-auto mb-16 sm:mb-24">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 border border-primary-200/60 dark:border-primary-800/40 text-primary-700 dark:text-primary-300 text-xs font-medium mb-6">
          <IconSet name="sparkles" :size="14" />
          {{ translateUi('uiMessages.mb3dda47906d5') }}
        </div>
        <h1 class="text-4xl sm:text-5xl font-semibold tracking-tight">
          <span class="gradient-text">{{ translateUi('uiMessages.m674a5c6c5653') }}</span>{{ translateUi('uiMessages.ma3542f8b86d2') }}
        </h1>
        <p class="mt-4 text-base sm:text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
          {{ translateUi('uiMessages.m0671368c2050') }}
        </p>
        <div class="mt-8 flex items-center justify-center gap-3">
          <RouterLink to="/generate" class="btn-primary !px-6 !py-3 text-base">
            {{ translateUi('uiMessages.m056a3838b1fb') }}
          </RouterLink>
          <RouterLink to="/community" class="btn-secondary !px-6 !py-3 text-base">
            {{ translateUi('uiMessages.m0927c89ec76d') }}
          </RouterLink>
        </div>
      </section>

      <!-- 特色功能宫格 -->
      <section class="mb-16 sm:mb-24">
        <div class="mb-6">
          <h2 class="text-2xl font-semibold tracking-tight">{{ translateUi('uiMessages.m04f57c8d1063') }}</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.me830c8eb61d8') }}</p>
        </div>

        <!-- 加载态 -->
        <div v-if="featuresLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="i in 8" :key="i" class="bg-surface-1 border border-hairline rounded-xl p-6 animate-pulse">
            <div class="w-12 h-12 rounded-lg bg-slate-200 dark:bg-dark-700 mb-4" />
            <div class="h-4 w-2/3 bg-slate-200 dark:bg-dark-700 rounded mb-2" />
            <div class="h-3 w-full bg-slate-100 dark:bg-dark-700/60 rounded" />
          </div>
        </div>

        <!-- 数据态 -->
        <div v-else-if="featureCards.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="card in featureCards"
            :key="card.id"
            class="group bg-surface-1 border border-hairline rounded-xl p-6 flex flex-col hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700/60 transition-all duration-200"
          >
            <div class="w-12 h-12 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-4">
              <IconSet :name="card.icon" :size="24" class="text-primary-600 dark:text-primary-400" />
            </div>
            <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ card.label }}</h3>
            <p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{{ card.description }}</p>
            <RouterLink
              :to="card.route"
              class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {{ translateUi('uiMessages.m715ee9dc842f') }}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </RouterLink>
          </div>
        </div>

        <!-- 空态 -->
        <div v-else class="bg-surface-1 border border-hairline rounded-xl py-16 text-center">
          <IconSet name="zap" :size="40" class="mx-auto text-slate-300 dark:text-dark-500 mb-3" />
          <p class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m0141ff049a65') }}</p>
        </div>
      </section>

      <!-- 灵感作品 -->
      <section class="mb-16 sm:mb-24">
        <div class="flex items-end justify-between mb-6">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">{{ translateUi('uiMessages.m9f65c68f1a11') }}</h2>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mce98874d935d') }}</p>
          </div>
          <RouterLink to="/community" class="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 whitespace-nowrap">
            {{ translateUi('uiMessages.md104c383641c') }}
          </RouterLink>
        </div>

        <!-- 加载态 -->
        <div v-if="worksLoading" class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          <div v-for="i in 8" :key="i" class="break-inside-avoid mb-4 rounded-xl overflow-hidden animate-pulse">
            <div class="aspect-[3/4] bg-slate-200 dark:bg-dark-700" />
          </div>
        </div>

        <!-- 数据态 -->
        <div v-else-if="works.length" class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          <div v-for="item in works" :key="item.id" class="break-inside-avoid mb-4">
            <WorkCard
              :work="item"
              :landscape="item.orientation === 'landscape'"
              @click="goToWork"
            />
          </div>
        </div>

        <!-- 空态 -->
        <div v-else class="bg-surface-1 border border-hairline rounded-xl py-16 text-center">
          <IconSet name="image" :size="40" class="mx-auto text-slate-300 dark:text-dark-500 mb-3" />
          <p class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m87f9df425c3f') }}</p>
        </div>
      </section>

      <!-- 提示词灵感 -->
      <section class="mb-16 sm:mb-24">
        <div class="mb-6">
          <h2 class="text-2xl font-semibold tracking-tight">{{ translateUi('uiMessages.m02d15adf1dc4') }}</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mfaee28843920') }}</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="prompt in promptIdeas"
            :key="prompt"
            class="group bg-surface-1 border border-hairline rounded-xl p-5 hover:border-primary-300 dark:hover:border-primary-700/60 hover:shadow-md transition-all duration-200"
          >
            <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{{ prompt }}</p>
            <div class="mt-4 flex items-center justify-between">
              <RouterLink
                :to="{ path: '/generate', query: { prompt } }"
                class="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <IconSet name="wand" :size="14" />
                {{ translateUi('uiMessages.m056a3838b1fb') }}
              </RouterLink>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                @click="copyPrompt(prompt)"
              >
                <IconSet name="sparkles" :size="14" />
                {{ translateUi('common.copy') }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 底部 CTA 横幅 -->
      <section class="bg-surface-1 border border-hairline rounded-xl px-6 py-12 sm:py-16 text-center">
        <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">{{ translateUi('uiMessages.mf9eb46d0b4b4') }}</h2>
        <p class="mt-3 text-sm sm:text-base text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m74b661669fe0') }}</p>
        <RouterLink to="/generate" class="btn-primary !px-8 !py-3.5 text-base mt-8">
          {{ translateUi('uiMessages.m056a3838b1fb') }}
        </RouterLink>
      </section>
    </div>

    <!-- Toast 复制提示 -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition ease-in duration-150"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="toastVisible"
        class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm shadow-lg"
      >
        {{ toastText }}
      </div>
    </Transition>
  </div>
</template>
