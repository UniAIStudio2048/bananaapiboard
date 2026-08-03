<script setup>
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
  wand: '一键移除视频字幕与水印，成片更干净',
  infinity: '从图片反推提示词，复现你的灵感',
  globe: '全景视角创作，VR 场景一键生成',
  img2img: '以图生图，让已有画面继续延展',
  brain: '大模型驱动，理解更精准',
  sparkles: '旗舰模型加持，出图质量更高',
  layout: '多格分镜一次生成，故事板更高效',
  users: '多角色一致性创作，人物更统一',
  video: '智能视频生成，动起来更有冲击力',
  flame: '爆款内容复刻，紧跟热门趋势',
  portrait: 'AI 写真，人像创作更专业',
  'bg-remove': '一键抠图，背景随心替换',
  upscale: '超分辨率增强，细节更清晰',
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
    || `AI 智能创作，${label || '开启灵感之旅'}`
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
    label: (f.label || '').trim() || '智能创作',
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
    toastText.value = '提示词已复制，去创作吧'
  } catch (e) {
    toastText.value = '复制失败，请手动复制'
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
          AI 创作灵感中心
        </div>
        <h1 class="text-4xl sm:text-5xl font-semibold tracking-tight">
          <span class="gradient-text">灵感</span>，从第一步开始
        </h1>
        <p class="mt-4 text-base sm:text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
          发现平台特色功能，浏览精选作品，一键复制提示词，让每一次创作都有迹可循。
        </p>
        <div class="mt-8 flex items-center justify-center gap-3">
          <RouterLink to="/generate" class="btn-primary !px-6 !py-3 text-base">
            去创作
          </RouterLink>
          <RouterLink to="/community" class="btn-secondary !px-6 !py-3 text-base">
            逛社区
          </RouterLink>
        </div>
      </section>

      <!-- 特色功能宫格 -->
      <section class="mb-16 sm:mb-24">
        <div class="mb-6">
          <h2 class="text-2xl font-semibold tracking-tight">特色功能</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">一站式创作能力，选一个立刻开始</p>
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
              开始使用
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </RouterLink>
          </div>
        </div>

        <!-- 空态 -->
        <div v-else class="bg-surface-1 border border-hairline rounded-xl py-16 text-center">
          <IconSet name="zap" :size="40" class="mx-auto text-slate-300 dark:text-dark-500 mb-3" />
          <p class="text-sm text-slate-500 dark:text-slate-400">特色功能暂未配置</p>
        </div>
      </section>

      <!-- 灵感作品 -->
      <section class="mb-16 sm:mb-24">
        <div class="flex items-end justify-between mb-6">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">灵感作品</h2>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">来自社区作者的精选创作</p>
          </div>
          <RouterLink to="/community" class="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 whitespace-nowrap">
            查看更多 →
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
          <p class="text-sm text-slate-500 dark:text-slate-400">暂无精选作品，去社区逛逛吧</p>
        </div>
      </section>

      <!-- 提示词灵感 -->
      <section class="mb-16 sm:mb-24">
        <div class="mb-6">
          <h2 class="text-2xl font-semibold tracking-tight">提示词灵感</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">点击卡片一键复制，直接带入创作</p>
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
                去创作
              </RouterLink>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                @click="copyPrompt(prompt)"
              >
                <IconSet name="sparkles" :size="14" />
                复制
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 底部 CTA 横幅 -->
      <section class="bg-surface-1 border border-hairline rounded-xl px-6 py-12 sm:py-16 text-center">
        <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">准备好开始创作了吗？</h2>
        <p class="mt-3 text-sm sm:text-base text-slate-500 dark:text-slate-400">无需复杂操作，描述你的想法，AI 帮你实现</p>
        <RouterLink to="/generate" class="btn-primary !px-8 !py-3.5 text-base mt-8">
          去创作
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
