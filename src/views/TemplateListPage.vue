<template>
  <div class="min-h-screen bg-black text-white">
    <!-- 顶部导航栏 -->
    <nav class="sticky top-0 z-50 bg-black/90 backdrop-blur-md">
      <div class="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2">
          <img v-if="brandLogo" :src="brandLogo" alt="Logo" class="h-8 w-auto" />
          <span class="text-lg font-semibold text-white">{{ brandName }}</span>
        </router-link>
        <div v-if="isLoggedIn" class="relative" ref="userMenuRef">
          <button
            class="flex items-center gap-2 hover:opacity-80 transition-opacity"
            @click="showUserMenu = !showUserMenu"
          >
            <img v-if="userAvatar" :src="userAvatar" alt="头像" class="w-8 h-8 rounded-full object-cover" />
            <div v-else class="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
              <span class="text-sm text-gray-300">{{ (userName || '?')[0] }}</span>
            </div>
            <span class="text-sm text-gray-300 hidden sm:inline">{{ userName }}</span>
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95 -translate-y-1"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 -translate-y-1"
          >
            <div
              v-if="showUserMenu"
              class="absolute right-0 top-full mt-2 w-44 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
            >
              <button
                class="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-neutral-800 flex items-center gap-2.5 transition-colors"
                @click="goToProfile"
              >
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                个人中心
              </button>
              <button
                class="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-neutral-800 flex items-center gap-2.5 transition-colors"
                @click="goToCanvas"
              >
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                开始创作
              </button>
              <div class="border-t border-neutral-700/60" />
              <button
                class="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-neutral-800 flex items-center gap-2.5 transition-colors"
                @click="handleLogout"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                退出登录
              </button>
            </div>
          </Transition>
        </div>
        <button
          v-else
          class="px-5 py-1.5 rounded-full border border-neutral-600 bg-neutral-900 hover:bg-neutral-800 text-sm text-neutral-300 hover:text-white font-medium transition-all"
          @click="communityStore.showLoginModal = true"
        >
          登录
        </button>
      </div>
    </nav>

    <!-- 主内容 -->
    <main class="max-w-[1400px] mx-auto px-6 pt-6 pb-20">
      <!-- 返回链接 + 标题 -->
      <router-link to="/community" class="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors mb-4">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        返回社区
      </router-link>
      <h1 class="text-3xl font-bold mb-6">{{ communityStore.sectionNames.templates }}</h1>

      <!-- 加载骨架屏 -->
      <div v-if="loading && !templates.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div v-for="i in 24" :key="i" class="aspect-video rounded-xl bg-neutral-800 animate-pulse" />
      </div>

      <!-- 模板网格 -->
      <div v-else-if="templates.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div v-for="tpl in templates" :key="tpl.id" class="group cursor-pointer" @click="handlePreview(tpl)">
          <div class="relative aspect-video rounded-xl overflow-hidden bg-neutral-800">
            <img v-if="tpl.cover_url" :src="tpl.cover_url" :alt="tpl.name"
                 class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
            <div v-else class="w-full h-full flex items-center justify-center text-neutral-600">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <!-- Hover overlay -->
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span class="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-full">
                预览工作流
              </span>
            </div>
          </div>
          <p class="mt-1.5 text-sm text-neutral-300 truncate">{{ tpl.name }}</p>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="flex flex-col items-center py-20 text-neutral-600">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <p class="text-sm">暂无模板</p>
      </div>

      <!-- 加载更多 -->
      <div v-if="loadingMore" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>

      <!-- 没有更多 -->
      <div v-if="noMore && templates.length" class="text-center py-6 text-neutral-700 text-sm">已经到底了</div>

      <!-- 无限滚动哨兵 -->
      <div ref="sentinelRef" class="h-1" />
    </main>

    <!-- WorkflowPreviewModal -->
    <WorkflowPreviewModal
      v-model="showPreview"
      :workflow-id="selectedTemplate?.workflow_id || ''"
      :template-id="selectedTemplate?.id || 0"
      :title="selectedTemplate?.name || ''"
    />

    <!-- 登录弹窗 -->
    <LoginModal v-model="communityStore.showLoginModal" @login-success="onLoginSuccess" />

    <!-- 初始加载遮罩 -->
    <div v-if="loading && !templates.length" class="fixed inset-0 z-40 bg-black flex items-center justify-center">
      <div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { clearAuthSession } from '@/api/client'
import { useCommunityStore } from '@/stores/community'
import { getTemplates } from '@/api/community'
import { getBrand } from '@/config/tenant'
import WorkflowPreviewModal from '@/components/community/WorkflowPreviewModal.vue'
import LoginModal from '@/components/community/LoginModal.vue'

const router = useRouter()
const communityStore = useCommunityStore()

// 品牌信息
const brand = getBrand()
const brandLogo = computed(() => brand?.logo || '/logo.png')
const brandName = computed(() => brand?.name || 'Nano Banana AI')

// 用户状态（全部响应式）
const userToken = ref(localStorage.getItem('token') || '')
const userName = ref(localStorage.getItem('username') || '')
const userAvatar = ref(localStorage.getItem('avatar') || '')
const userId = computed(() => localStorage.getItem('user_id') || localStorage.getItem('userId') || '')
const isLoggedIn = computed(() => !!(userToken.value && userName.value))

// 用户菜单
const showUserMenu = ref(false)
const userMenuRef = ref(null)

function goToProfile() {
  showUserMenu.value = false
  if (userId.value) {
    router.push(`/community/users/${userId.value}`)
  }
}

function goToCanvas() {
  showUserMenu.value = false
  router.push('/canvas')
}

function handleLogout() {
  showUserMenu.value = false
  clearAuthSession()
  localStorage.removeItem('userMode')
  userToken.value = ''
  userName.value = ''
  userAvatar.value = ''
}

function onClickOutsideMenu(e) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    showUserMenu.value = false
  }
}

// 模板数据
const templates = ref([])
const page = ref(1)
const pageSize = 24
const loading = ref(true)
const loadingMore = ref(false)
const noMore = ref(false)

// 预览弹窗
const showPreview = ref(false)
const selectedTemplate = ref(null)

// 无限滚动
const sentinelRef = ref(null)
let observer = null

async function loadTemplates(reset = false) {
  if (loadingMore.value) return
  if (!reset && noMore.value) return
  if (reset) { page.value = 1; templates.value = []; noMore.value = false; loading.value = true }
  else loadingMore.value = true
  try {
    const res = await getTemplates({ page: page.value, pageSize })
    const list = res.data?.templates || res.templates || []
    if (reset) templates.value = list
    else {
      const existingIds = new Set(templates.value.map(t => t.id))
      templates.value = [...templates.value, ...list.filter(t => !existingIds.has(t.id))]
    }
    if (list.length < pageSize) noMore.value = true
    else page.value++
  } catch (e) {
    console.error('[TemplateListPage] 加载模板失败:', e)
  } finally { loading.value = false; loadingMore.value = false }
}

function handlePreview(tpl) {
  if (!communityStore.requireLogin()) return
  selectedTemplate.value = tpl
  showPreview.value = true
}

function onLoginSuccess() {
  userToken.value = localStorage.getItem('token') || ''
  userName.value = localStorage.getItem('username') || ''
  userAvatar.value = localStorage.getItem('avatar') || ''
}

function setupObserver() {
  if (observer) observer.disconnect()
  if (!sentinelRef.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && !loadingMore.value && !noMore.value) loadTemplates()
  }, { rootMargin: '200px' })
  observer.observe(sentinelRef.value)
}

onMounted(async () => {
  await Promise.all([loadTemplates(true), communityStore.loadSectionNames()])
  await nextTick()
  setupObserver()
  document.addEventListener('click', onClickOutsideMenu)
})

onUnmounted(() => {
  if (observer) observer.disconnect()
  document.removeEventListener('click', onClickOutsideMenu)
})
</script>
