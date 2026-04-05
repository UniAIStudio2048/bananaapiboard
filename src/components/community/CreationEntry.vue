<template>
  <div>
    <h2 class="text-xl font-bold text-white mb-4">{{ communityStore.sectionNames.features }}</h2>
    <div class="flex gap-3">
      <!-- 创建新项目 -->
      <div
        class="w-72 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600/60 via-blue-500/45 to-sky-400/25 border border-blue-400/25 p-5 flex flex-col justify-between cursor-pointer hover:border-blue-300/40 hover:shadow-lg hover:shadow-blue-500/20 transition-all group"
        @click="goCreate"
      >
        <div>
          <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/15 transition-colors">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h3 class="text-white font-semibold text-base">创建新项目</h3>
          <p class="text-blue-200/50 text-xs mt-1">发挥创意，开始你的 AI 创作</p>
        </div>
        <span class="text-xs text-blue-200/50 group-hover:text-blue-100/70 transition-colors">立即尝试 →</span>
      </div>

      <!-- 功能网格：4列2行，最多8个 -->
      <div class="flex-1 grid grid-cols-4 gap-2.5 content-start">
        <template v-if="featuresLoading">
          <div v-for="i in 8" :key="i" class="h-10 rounded-xl bg-neutral-800/50 animate-pulse" />
        </template>
        <template v-else-if="features.length">
          <div
            v-for="feat in visibleFeatures"
            :key="feat.id"
            class="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800/60 hover:bg-neutral-800 hover:border-neutral-700 cursor-pointer transition-all"
            @click="handleFeatureClick(feat)"
          >
            <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :style="{ background: getFeatureColor(feat.icon) }">
              <svg
                v-if="getIcon(feat.icon)"
                class="w-4 h-4 text-white"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                viewBox="0 0 24 24"
              >
                <path v-for="(d, i) in getIcon(feat.icon).paths || []" :key="'p'+i" :d="d" />
                <circle v-for="(c, i) in getIcon(feat.icon).circles || []" :key="'c'+i" :cx="c[0]" :cy="c[1]" :r="c[2]" />
                <rect v-for="(r, i) in getIcon(feat.icon).rects || []" :key="'r'+i" :x="r[0]" :y="r[1]" :width="r[2]" :height="r[3]" :rx="r[4] || 0" />
                <line v-for="(l, i) in getIcon(feat.icon).lines || []" :key="'l'+i" :x1="l[0]" :y1="l[1]" :x2="l[2]" :y2="l[3]" />
                <polyline v-for="(p, i) in getIcon(feat.icon).polylines || []" :key="'pl'+i" :points="p" fill="none" />
                <polygon v-for="(pg, i) in getIcon(feat.icon).polygons || []" :key="'pg'+i" :points="pg" fill="none" />
                <ellipse v-for="(e, i) in getIcon(feat.icon).ellipses || []" :key="'e'+i" :cx="e[0]" :cy="e[1]" :rx="e[2]" :ry="e[3]" />
              </svg>
              <svg v-else class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              </svg>
            </div>
            <span class="text-xs text-neutral-300 truncate">{{ feat.name }}</span>
          </div>
          <div
            v-if="features.length > maxVisible"
            class="flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-neutral-900/60 border border-neutral-800/40 hover:bg-neutral-800 hover:border-neutral-700 cursor-pointer transition-all text-xs text-neutral-400 hover:text-neutral-300"
            @click="showAllFeatures = true"
          >
            查看更多
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </template>
        <template v-else>
          <div class="col-span-4 flex items-center justify-center text-neutral-600 text-sm py-6">
            暂无特色功能
          </div>
        </template>
      </div>
    </div>

    <!-- 工作流预览弹窗 -->
    <WorkflowPreviewModal
      v-model="showPreview"
      :feature-id="selectedFeature?.id || 0"
      :workflow-id="selectedFeature?.workflow_id || ''"
      :title="selectedFeature?.name || ''"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunityStore } from '@/stores/community'
import { getFeatures } from '@/api/community'
import { getFeatureIcon } from '@/utils/feature-icons'
import WorkflowPreviewModal from './WorkflowPreviewModal.vue'

const router = useRouter()
const communityStore = useCommunityStore()

const features = ref([])
const featuresLoading = ref(true)
const showPreview = ref(false)
const selectedFeature = ref(null)
const showAllFeatures = ref(false)
const maxVisible = 8

const iconColors = [
  'rgba(99, 102, 241, 0.6)',
  'rgba(139, 92, 246, 0.6)',
  'rgba(236, 72, 153, 0.6)',
  'rgba(14, 165, 233, 0.6)',
  'rgba(34, 197, 94, 0.6)',
  'rgba(245, 158, 11, 0.6)',
  'rgba(168, 85, 247, 0.6)',
  'rgba(6, 182, 212, 0.6)',
]

const visibleFeatures = computed(() => {
  if (showAllFeatures.value) return features.value
  return features.value.slice(0, maxVisible)
})

function getFeatureColor(iconName) {
  const idx = features.value.findIndex(f => f.icon === iconName)
  return iconColors[idx % iconColors.length]
}

function getIcon(iconName) {
  if (!iconName) return null
  return getFeatureIcon(iconName)
}

async function loadFeatures() {
  featuresLoading.value = true
  try {
    const res = await getFeatures()
    const list = Array.isArray(res.data) ? res.data : (res.data?.features || res.features || [])
    features.value = list.map(f => ({ ...f, name: f.name || f.label }))
  } catch (e) {
    console.error('[CreationEntry] 加载特色功能失败:', e)
    features.value = []
  } finally {
    featuresLoading.value = false
  }
}

function goCreate() {
  if (!communityStore.requireLogin()) return
  router.push('/canvas')
}

function handleFeatureClick(feat) {
  if (!communityStore.requireLogin()) return
  if (feat.workflow_id) {
    selectedFeature.value = feat
    showPreview.value = true
  } else {
    router.push(feat.route || '/canvas')
  }
}

onMounted(loadFeatures)
</script>
