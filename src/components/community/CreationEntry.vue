<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-white">个人最近项目</h2>
      <button
        class="text-sm text-neutral-400 hover:text-white transition-colors"
        type="button"
        @click="openAllProjects"
      >
        全部项目 <span aria-hidden="true">›</span>
      </button>
    </div>

    <div class="flex items-stretch gap-3 min-w-0">
      <!-- 创建新项目 -->
      <button
        class="w-56 sm:w-64 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600/60 via-blue-500/45 to-sky-400/25 border border-blue-400/25 p-5 flex flex-col justify-between text-left cursor-pointer hover:border-blue-300/40 hover:shadow-lg hover:shadow-blue-500/20 transition-all group"
        type="button"
        @click="goCreate"
      >
        <span>
          <span class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/15 transition-colors">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14m-7-7h14" />
            </svg>
          </span>
          <span class="block text-white font-semibold text-base">开始创作</span>
          <span class="block text-blue-200/60 text-xs mt-1">发挥创意，开始你的 AI 创作</span>
        </span>
        <span class="text-xs text-blue-200/60 group-hover:text-blue-100/80 transition-colors">立即尝试 →</span>
      </button>

      <!-- 最近项目横向滚动区 -->
      <div
        ref="projectScroller"
        class="flex-1 min-w-0 flex gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
        tabindex="0"
        role="list"
        aria-label="个人最近项目"
        @wheel="handleWheel"
        @keydown="handleKeydown"
      >
        <template v-if="projectsLoading">
          <div v-for="i in 3" :key="`project-skeleton-${i}`" class="w-52 sm:w-56 shrink-0 rounded-2xl bg-neutral-900 border border-neutral-800/60 overflow-hidden animate-pulse">
            <div class="h-28 bg-neutral-800" />
            <div class="p-3 space-y-2">
              <div class="h-4 w-3/4 rounded bg-neutral-800" />
              <div class="h-3 w-1/2 rounded bg-neutral-800" />
            </div>
          </div>
        </template>

        <template v-else-if="recentProjects.length">
          <button
            v-for="project in recentProjects"
            :key="project.id"
            class="w-52 sm:w-56 shrink-0 rounded-2xl bg-neutral-900 border border-neutral-800/70 overflow-hidden text-left hover:border-neutral-600 hover:bg-neutral-800 transition-colors group"
            type="button"
            role="listitem"
            @click="openProject(project)"
          >
            <div class="h-28 bg-neutral-800 relative overflow-hidden">
              <img
                v-if="project.cover_url"
                :src="project.cover_url"
                :alt="`${project.name} 封面`"
                class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-neutral-600" aria-hidden="true">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 19.5V6.8A2.8 2.8 0 016.8 4h10.4A2.8 2.8 0 0120 6.8v12.7M4 19.5A2.5 2.5 0 006.5 22h11A2.5 2.5 0 0020 19.5M4 19.5h16" />
                </svg>
              </div>
              <span v-if="Number(project.workflow_count || 0) > 0" class="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-neutral-200">
                {{ project.workflow_count }} 个工作流
              </span>
            </div>
            <div class="p-3">
              <h3 class="text-sm font-medium text-white truncate">{{ project.name || '未命名项目' }}</h3>
              <p class="mt-1 text-xs text-neutral-500">{{ formatProjectDate(project.updated_at) }}</p>
            </div>
          </button>
        </template>

        <div v-else class="min-w-[240px] flex-1 rounded-2xl border border-dashed border-neutral-800 flex flex-col items-center justify-center px-5 text-center text-neutral-500">
          <svg class="w-8 h-8 mb-2 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7.5A2.5 2.5 0 016.5 5h3l1.5 2h6.5A2.5 2.5 0 0120 9.5v7A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5z" />
          </svg>
          <p v-if="isLoggedIn" class="text-sm">还没有项目，开始创建你的第一个项目吧</p>
          <template v-else>
            <p class="text-sm">登录后查看最近项目</p>
            <button type="button" class="mt-2 text-xs text-blue-300 hover:text-blue-200" @click="communityStore.showLoginModal = true">立即登录</button>
          </template>
        </div>
      </div>

      <!-- 固定在右侧的全部项目入口 -->
      <button
        class="w-52 sm:w-56 shrink-0 rounded-2xl bg-neutral-900 border border-neutral-800/70 hover:border-neutral-600 hover:bg-neutral-800 transition-colors flex flex-col items-center justify-center gap-2 text-neutral-300 hover:text-white"
        type="button"
        @click="openAllProjects"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5zM8 8h8M8 12h8M8 16h5" />
        </svg>
        <span class="text-xs">全部项目</span>
      </button>
    </div>

    <p v-if="projectsError && isLoggedIn" class="mt-2 text-xs text-neutral-600">最近项目加载失败，请稍后重试</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunityStore } from '@/stores/community'
import { getProjectList } from '@/api/canvas/project'

const props = defineProps({
  isLoggedIn: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()
const communityStore = useCommunityStore()
const projectScroller = ref(null)
const projects = ref([])
const projectsLoading = ref(false)
const projectsError = ref(false)

const recentProjects = ref([])

function normalizeProjects(list) {
  return (Array.isArray(list) ? list : [])
    .slice()
    .sort((a, b) => Number(b?.created_at || 0) - Number(a?.created_at || 0))
    .slice(0, 5)
}

async function loadProjects() {
  if (!props.isLoggedIn) {
    projects.value = []
    recentProjects.value = []
    return
  }

  projectsLoading.value = true
  projectsError.value = false
  try {
    const result = await getProjectList({ spaceType: 'personal' })
    projects.value = Array.isArray(result?.data) ? result.data : []
    recentProjects.value = normalizeProjects(projects.value)
  } catch (error) {
    console.error('[CreationEntry] 加载最近项目失败:', error)
    projects.value = []
    recentProjects.value = []
    projectsError.value = true
  } finally {
    projectsLoading.value = false
  }
}

function formatProjectDate(value) {
  if (!value) return '暂无创建时间'
  const numeric = Number(value)
  const date = new Date(Number.isFinite(numeric) && numeric > 0 ? (numeric < 1e12 ? numeric * 1000 : numeric) : value)
  if (Number.isNaN(date.getTime())) return '暂无创建时间'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function goCreate() {
  if (!communityStore.requireLogin()) return
  router.push('/canvas')
}

function openProject(project) {
  if (!communityStore.requireLogin() || !project?.id) return
  const projectId = String(project.id)
  if (Number(project.workflow_count || 0) > 0) {
    router.push({ path: '/workflows', query: { projectId } })
  } else {
    router.push({ path: '/canvas', query: { projectId } })
  }
}

function openAllProjects() {
  if (!communityStore.requireLogin()) return
  router.push('/workflows')
}

function handleWheel(event) {
  const element = projectScroller.value
  if (!element || !event.deltaY || element.scrollWidth <= element.clientWidth) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  event.preventDefault()
  element.scrollLeft += event.deltaY
}

function handleKeydown(event) {
  const element = projectScroller.value
  if (!element) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    element.scrollLeft += event.key === 'ArrowRight' ? 220 : -220
  }
}

watch(() => props.isLoggedIn, loadProjects, { immediate: true })
</script>
