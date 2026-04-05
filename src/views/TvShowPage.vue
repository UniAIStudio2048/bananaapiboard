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
      <h1 class="text-3xl font-bold mb-6">{{ communityStore.sectionNames.tvshow }}</h1>

      <!-- 筛选栏 -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <button
            v-for="tab in categoryTabs" :key="tab.id"
            class="px-4 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap"
            :class="activeCategory === tab.id ? 'bg-white text-black font-medium' : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'"
            @click="setCategory(tab.id)"
          >{{ tab.name }}</button>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <div class="relative">
            <input
              v-model="searchKeyword" type="text" placeholder="请输入搜索内容"
              class="w-48 pl-9 pr-3 py-1.5 rounded-full bg-neutral-800 border-none text-sm text-gray-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-600 transition-colors"
              @keyup.enter="handleSearch"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <button
            v-for="opt in sortOptions" :key="opt.value"
            class="px-3 py-1.5 rounded-full text-xs transition-colors whitespace-nowrap"
            :class="activeSort === opt.value ? 'bg-white text-black font-medium' : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'"
            @click="setSort(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- 顶部作品（前3行，横屏优先，不足时竖屏补位） -->
      <section v-if="topWorks.length" class="mb-8">
        <h2 class="text-lg font-semibold mb-4 text-neutral-200">精选作品</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <WorkCard
            v-for="item in topWorks" :key="'top-' + item.id"
            :work="item" :landscape="item.orientation === 'landscape'"
            @click="goToWork" @like="handleLike"
          />
        </div>
      </section>

      <!-- 竖屏作品瀑布流 -->
      <section v-if="portraitWorks.length">
        <h2 class="text-lg font-semibold mb-4 text-neutral-200">更多作品</h2>
        <div class="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 [column-fill:_balance-all]">
          <div v-for="item in portraitWorks" :key="'pt-' + item.id" class="break-inside-avoid mb-3">
            <WorkCard :work="item" :landscape="false" @click="goToWork" @like="handleLike" />
          </div>
        </div>
      </section>

      <!-- 加载中 -->
      <div v-if="loadingMore" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>

      <!-- 空状态 -->
      <div v-if="!initialLoading && !topWorks.length && !portraitWorks.length" class="flex flex-col items-center py-20 text-neutral-600">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
        </svg>
        <p class="text-sm">暂无作品</p>
      </div>

      <!-- 没有更多 -->
      <div v-if="noMore && portraitWorks.length" class="text-center py-6 text-neutral-700 text-sm">已经到底了</div>

      <!-- 无限滚动哨兵 -->
      <div ref="sentinelRef" class="h-1" />
    </main>

    <!-- 登录弹窗 -->
    <LoginModal v-model="communityStore.showLoginModal" @login-success="onLoginSuccess" />

    <!-- 初始加载遮罩 -->
    <div v-if="initialLoading" class="fixed inset-0 z-40 bg-black flex items-center justify-center">
      <div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunityStore } from '@/stores/community'
import { getWorks, toggleLike, toggleFavorite } from '@/api/community'
import { getBrand } from '@/config/tenant'
import WorkCard from '@/components/community/WorkCard.vue'
import LoginModal from '@/components/community/LoginModal.vue'

const router = useRouter()
const communityStore = useCommunityStore()

// 模拟数据
const mockNames = [
  '星河画师', '像素猎人', '光影工坊', '数字梦境', '创意无限',
  '艺术小站', '幻想家', '色彩魔法', 'AI绘梦师', '未来视觉'
]
const mockTitles = [
  '赛博朋克城市之夜', '梦幻森林深处的精灵', '星际穿越号起航',
  '水墨山水画意境', '机械猫咪的冒险', '海底都市奇遇记',
  '未来都市黄昏', '魔法花园的秘密', '蒸汽朋克时钟塔',
  '极光下的北欧小镇', '沙漠中的绿洲城堡', '云端上的天空之城'
]

function generateMockWorks(count, orientationFilter = null) {
  const works = []
  for (let i = 0; i < count; i++) {
    const id = 10000 + Math.floor(Math.random() * 90000)
    const isLandscape = orientationFilter === 'landscape' ? true : orientationFilter === 'portrait' ? false : Math.random() > 0.4
    const width = isLandscape ? 800 : 400
    const height = isLandscape ? 450 : 600
    const seed = Math.floor(Math.random() * 1000)
    const nameIdx = Math.floor(Math.random() * mockNames.length)
    const titleIdx = Math.floor(Math.random() * mockTitles.length)
    works.push({
      id: `mock-${id}-${i}`, cover_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      title: mockTitles[titleIdx], media_type: Math.random() > 0.85 ? 'video' : 'image',
      share_mode: Math.random() > 0.9 ? 'paid' : 'free', price: Math.random() > 0.9 ? Math.floor(Math.random() * 50 + 5) : null,
      is_featured: Math.random() > 0.85, author_avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${mockNames[nameIdx]}`,
      author_name: mockNames[nameIdx], like_count: Math.floor(Math.random() * 500),
      is_liked: Math.random() > 0.7, orientation: isLandscape ? 'landscape' : 'portrait'
    })
  }
  return works
}

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
  localStorage.removeItem('token')
  localStorage.removeItem('userMode')
  localStorage.removeItem('username')
  localStorage.removeItem('avatar')
  userToken.value = ''
  userName.value = ''
  userAvatar.value = ''
}

function onClickOutsideMenu(e) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    showUserMenu.value = false
  }
}

// 筛选状态
const activeCategory = ref(null)
const activeSort = ref('latest')
const searchKeyword = ref('')

const sortOptions = [
  { label: '最新', value: 'latest' },
  { label: '最热', value: 'popular' },
  { label: '最多点赞', value: 'most_liked' }
]

const categoryTabs = computed(() => {
  const fixed = [{ id: null, name: '全部分类' }, { id: 'featured', name: '精选创作' }]
  const dynamic = (communityStore.categories || []).map(c => ({ id: c.id, name: c.name }))
  return [...fixed, ...dynamic]
})

// 顶部区域（前3行，最多12个，横屏优先，不足时竖屏补位到前2行）
const topWorks = ref([])
const MAX_TOP_SLOTS = 12  // 4列 x 3行

// 下方竖屏瀑布流（无限滚动）
const portraitWorks = ref([])
const portraitPage = ref(1)
const loadingMore = ref(false)
const noMore = ref(false)
const initialLoading = ref(true)

const sentinelRef = ref(null)
let observer = null

function buildParams(extra = {}) {
  const params = { sort: activeSort.value, ...extra }
  if (activeCategory.value === 'featured') params.featured = 1
  else if (activeCategory.value) params.category_id = activeCategory.value
  if (searchKeyword.value.trim()) params.keyword = searchKeyword.value.trim()
  return params
}

async function loadTopWorks() {
  try {
    const landscapeParams = buildParams({ orientation: 'landscape', pageSize: MAX_TOP_SLOTS, page: 1 })
    const lRes = await getWorks(landscapeParams)
    const landscapeItems = lRes.data?.works || lRes.works || []

    let top = [...landscapeItems.slice(0, MAX_TOP_SLOTS)]

    // 横屏不足以填满前2行（8个位置）时，用竖屏补位
    if (top.length < 8) {
      const fillCount = 8 - top.length
      const portraitParams = buildParams({ orientation: 'portrait', pageSize: fillCount, page: 1 })
      const pRes = await getWorks(portraitParams)
      const portraitItems = pRes.data?.works || pRes.works || []
      top = [...top, ...portraitItems.slice(0, fillCount)]
    }

    topWorks.value = top.length > 0 ? top : generateMockWorks(12, 'landscape')
  } catch (e) {
    console.error('[TvShowPage] 加载顶部作品失败:', e)
    topWorks.value = generateMockWorks(12, 'landscape')
  }
}

async function loadPortraitWorks(reset = false) {
  if (loadingMore.value) return
  if (!reset && noMore.value) return
  if (reset) { portraitPage.value = 1; portraitWorks.value = []; noMore.value = false }
  loadingMore.value = true
  try {
    const params = buildParams({ orientation: 'portrait', page: portraitPage.value, pageSize: 20 })
    const res = await getWorks(params)
    const works = res.data?.works || res.works || []

    const topIds = new Set(topWorks.value.map(w => w.id))
    const filtered = works.filter(w => !topIds.has(w.id))

    if (reset && filtered.length === 0 && works.length === 0) {
      portraitWorks.value = generateMockWorks(20, 'portrait')
      noMore.value = true
      return
    }

    if (reset) { portraitWorks.value = filtered }
    else {
      const existingIds = new Set(portraitWorks.value.map(w => w.id))
      portraitWorks.value = [...portraitWorks.value, ...filtered.filter(w => !existingIds.has(w.id))]
    }
    if (works.length < 20) noMore.value = true
    else portraitPage.value++
  } catch (e) {
    console.error('[TvShowPage] 加载竖屏作品失败:', e)
    if (reset && portraitWorks.value.length === 0) {
      portraitWorks.value = generateMockWorks(20, 'portrait')
      noMore.value = true
    }
  } finally { loadingMore.value = false }
}

async function initLoad() {
  initialLoading.value = true
  try {
    await Promise.all([communityStore.loadCategories(), communityStore.loadTags(), communityStore.loadSectionNames(), loadTopWorks()])
    await loadPortraitWorks(true)
  } finally {
    initialLoading.value = false
    await nextTick()
    setupObserver()
  }
}

async function reloadWorks() {
  await loadTopWorks()
  await loadPortraitWorks(true)
}

function setCategory(id) { if (activeCategory.value === id) return; activeCategory.value = id; reloadWorks() }
function setSort(val) { if (activeSort.value === val) return; activeSort.value = val; reloadWorks() }
function handleSearch() { reloadWorks() }
function onLoginSuccess() { userToken.value = localStorage.getItem('token') || ''; userName.value = localStorage.getItem('username') || ''; userAvatar.value = localStorage.getItem('avatar') || '' }
function goToWork(work) { if (work?.id) router.push(`/community/${work.id}`) }

async function handleLike(work) {
  if (!communityStore.requireLogin()) return
  try {
    const res = await toggleLike(work.id)
    const data = res.data || res
    work.is_liked = data.liked ?? !work.is_liked
    work.like_count = data.like_count ?? (work.is_liked ? (work.like_count || 0) + 1 : Math.max((work.like_count || 1) - 1, 0))
    toggleFavorite(work.id).catch(() => {})
  } catch (e) { console.error('[TvShowPage] 点赞失败:', e) }
}

function setupObserver() {
  if (observer) observer.disconnect()
  if (!sentinelRef.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && !loadingMore.value && !noMore.value) loadPortraitWorks()
  }, { rootMargin: '200px' })
  observer.observe(sentinelRef.value)
}

onMounted(() => {
  initLoad()
  document.addEventListener('click', onClickOutsideMenu)
})
onUnmounted(() => {
  if (observer) observer.disconnect()
  document.removeEventListener('click', onClickOutsideMenu)
})
</script>
