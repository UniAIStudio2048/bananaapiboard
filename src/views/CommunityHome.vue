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
            <img
              v-if="userAvatar"
              :src="userAvatar"
              alt="头像"
              class="w-8 h-8 rounded-full object-cover"
            />
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

    <!-- 轮播图 -->
    <section class="max-w-[1400px] mx-auto px-6 pt-6 pb-2">
      <BannerCarousel :banners="communityStore.banners" />
    </section>

    <!-- 开始创作 -->
    <section class="max-w-[1400px] mx-auto px-6 pt-8">
      <CreationEntry />
    </section>

    <!-- 模板库 -->
    <section class="max-w-[1400px] mx-auto px-6 pt-8">
      <TemplateGallery />
    </section>

    <!-- TV Show 区域 -->
    <section class="max-w-[1400px] mx-auto px-6 pt-8 pb-20">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-2xl font-bold">{{ communityStore.sectionNames.tvshow }}</h2>
        <router-link to="/community/tvshow" class="text-sm text-neutral-400 hover:text-white transition-colors">
          查看更多 >
        </router-link>
      </div>

      <!-- 筛选栏 -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <button
            v-for="tab in categoryTabs"
            :key="tab.id"
            class="px-4 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap"
            :class="activeCategory === tab.id
              ? 'bg-white text-black font-medium'
              : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'"
            @click="setCategory(tab.id)"
          >
            {{ tab.name }}
          </button>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <div class="relative">
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="请输入搜索内容"
              class="w-48 pl-9 pr-3 py-1.5 rounded-full bg-neutral-800 border-none text-sm text-gray-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-600 transition-colors"
              @keyup.enter="handleSearch"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- 横屏作品 (3行，每行可左右滚动) -->
      <div v-if="landscapeWorks.length" class="space-y-3 mb-6">
        <HorizontalScrollRow
          v-for="(row, idx) in landscapeRows"
          :key="'row-' + idx"
          :works="row"
          @click="goToWork"
          @like="handleLike"
        />
      </div>

      <!-- 混合瀑布流 -->
      <div
        v-if="mixedWorks.length"
        class="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 [column-fill:_balance-all]"
      >
        <div v-for="item in mixedWorks" :key="'mx-' + item.id" class="break-inside-avoid mb-3">
          <WorkCard
            :work="item"
            :landscape="item.orientation === 'landscape'"
            @click="goToWork"
            @like="handleLike"
          />
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loadingMore" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>

      <!-- 空状态 -->
      <div v-if="!initialLoading && !landscapeWorks.length && !mixedWorks.length" class="flex flex-col items-center py-20 text-neutral-600">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
        </svg>
        <p class="text-sm">暂无作品</p>
      </div>

      <!-- 没有更多 -->
      <div v-if="noMore && mixedWorks.length" class="text-center py-6 text-neutral-700 text-sm">
        已经到底了
      </div>

      <!-- 无限滚动哨兵 -->
      <div ref="sentinelRef" class="h-1" />
    </section>

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
import { clearAuthSession } from '@/api/client'
import { useCommunityStore } from '@/stores/community'
import { getWorks, toggleLike, toggleFavorite } from '@/api/community'
import { getBrand, loadBrandConfig } from '@/config/tenant'
import BannerCarousel from '@/components/community/BannerCarousel.vue'
import WorkCard from '@/components/community/WorkCard.vue'
import LoginModal from '@/components/community/LoginModal.vue'
import CreationEntry from '@/components/community/CreationEntry.vue'
import TemplateGallery from '@/components/community/TemplateGallery.vue'
import HorizontalScrollRow from '@/components/community/HorizontalScrollRow.vue'

const router = useRouter()
const communityStore = useCommunityStore()

// 模拟数据生成
const mockNames = [
  '星河画师', '像素猎人', '光影工坊', '数字梦境', '创意无限',
  '艺术小站', '幻想家', '色彩魔法', 'AI绘梦师', '未来视觉',
  '赛博画匠', '灵感收集者', '次元旅人', '调色盘', '影像诗人',
  '奇想工作室', '像素花园', '光子画廊', '虚拟笔触', '造梦空间'
]

const mockTitles = [
  '赛博朋克城市之夜', '梦幻森林深处的精灵', '星际穿越号起航',
  '水墨山水画意境', '机械猫咪的冒险', '海底都市奇遇记',
  '未来都市黄昏', '魔法花园的秘密', '蒸汽朋克时钟塔',
  '极光下的北欧小镇', '沙漠中的绿洲城堡', '云端上的天空之城',
  '深海巨兽觉醒', '樱花季的京都', '废墟中的新生',
  '龙与骑士的传说', '银河列车旅途', '古堡月光曲',
  '赛博少女肖像', '量子花园', '时空裂缝', '霓虹都市',
  '月球基地', '深渊之瞳', '翡翠森林', '冰霜王座',
  '彩虹瀑布', '机甲战士', '浮空岛屿', '暗黑童话',
  '光之翼', '海市蜃楼', '星云漩涡', '魔女的房间',
  '末日黎明', '仙境迷踪', '钢铁之花', '极光之城',
  '梦境边界', '永恒花园', '暗夜精灵', '天空之镜',
  '幻境迷宫', '星辰大海', '月下独酌', '紫藤花开',
  '雪山飞鹰', '水晶宫殿', '火焰之舞', '冰雪奇境'
]

function generateMockWorks(count, orientationFilter = null) {
  const works = []
  for (let i = 0; i < count; i++) {
    const id = 10000 + Math.floor(Math.random() * 90000)
    const isLandscape = orientationFilter === 'landscape' ? true
      : orientationFilter === 'portrait' ? false
      : Math.random() > 0.4
    const width = isLandscape ? 800 : 400
    const height = isLandscape ? 450 : 600
    const seed = Math.floor(Math.random() * 1000)
    const nameIdx = Math.floor(Math.random() * mockNames.length)
    const titleIdx = Math.floor(Math.random() * mockTitles.length)

    works.push({
      id: `mock-${id}-${i}`,
      cover_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      title: mockTitles[titleIdx],
      media_type: Math.random() > 0.85 ? 'video' : 'image',
      share_mode: Math.random() > 0.9 ? 'paid' : 'free',
      price: Math.random() > 0.9 ? Math.floor(Math.random() * 50 + 5) : null,
      is_featured: Math.random() > 0.85,
      author_avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${mockNames[nameIdx]}`,
      author_name: mockNames[nameIdx],
      like_count: Math.floor(Math.random() * 500),
      is_liked: Math.random() > 0.7,
      orientation: isLandscape ? 'landscape' : 'portrait'
    })
  }
  return works
}

// 品牌信息（响应式，从租户端配置获取）
const brand = ref(getBrand())
const brandLogo = computed(() => brand.value?.logo || '/logo.png')
const brandName = computed(() => brand.value?.name || 'Nano Banana AI')

// 用户状态（全部响应式，登录后立即更新）
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
  const fixed = [
    { id: null, name: '全部分类' },
    { id: 'featured', name: '精选创作' }
  ]
  const dynamic = (communityStore.categories || []).map(c => ({ id: c.id, name: c.name }))
  return [...fixed, ...dynamic]
})

// 作品数据
const landscapeWorks = ref([])
const landscapeRows = computed(() => {
  const works = landscapeWorks.value
  if (!works.length) return []
  const perRow = Math.max(4, Math.ceil(works.length / 3))
  const rows = []
  for (let i = 0; i < 3; i++) {
    const row = works.slice(i * perRow, (i + 1) * perRow)
    if (row.length) rows.push(row)
  }
  return rows
})
const mixedWorks = ref([])
const mixedPage = ref(1)
const loadingMore = ref(false)
const noMore = ref(false)
const initialLoading = ref(true)

// 无限滚动
const sentinelRef = ref(null)
let observer = null

// 构建查询参数
function buildParams(extra = {}) {
  const params = { sort: activeSort.value, ...extra }
  if (activeCategory.value === 'featured') {
    params.featured = 1
  } else if (activeCategory.value) {
    params.category_id = activeCategory.value
  }
  if (searchKeyword.value.trim()) {
    params.keyword = searchKeyword.value.trim()
  }
  return params
}
// 加载横屏作品
async function loadLandscapeWorks() {
  try {
    const params = buildParams({ orientation: 'landscape', pageSize: 30, page: 1 })
    const res = await getWorks(params)
    const works = res.data?.works || res.works || []
    landscapeWorks.value = works.length > 0 ? works : generateMockWorks(24, 'landscape')
  } catch (e) {
    console.error('[CommunityHome] 加载横屏作品失败:', e)
    landscapeWorks.value = generateMockWorks(24, 'landscape')
  }
}

// 加载混合作品（瀑布流）
async function loadMixedWorks(reset = false) {
  if (loadingMore.value) return
  if (!reset && noMore.value) return

  if (reset) {
    mixedPage.value = 1
    mixedWorks.value = []
    noMore.value = false
  }

  loadingMore.value = true
  try {
    const params = buildParams({ page: mixedPage.value, pageSize: 20 })
    const res = await getWorks(params)
    const works = res.data?.works || res.works || []

    if (reset && works.length === 0) {
      mixedWorks.value = generateMockWorks(40, null)
      noMore.value = true
      return
    }

    const landscapeIds = new Set(landscapeWorks.value.map(w => w.id))
    const filtered = works.filter(w => !landscapeIds.has(w.id))

    if (reset) {
      mixedWorks.value = filtered
    } else {
      const existingIds = new Set(mixedWorks.value.map(w => w.id))
      const newItems = filtered.filter(w => !existingIds.has(w.id))
      mixedWorks.value = [...mixedWorks.value, ...newItems]
    }

    if (works.length < 20) {
      noMore.value = true
    } else {
      mixedPage.value++
    }
  } catch (e) {
    console.error('[CommunityHome] 加载混合作品失败:', e)
    if (reset && mixedWorks.value.length === 0) {
      mixedWorks.value = generateMockWorks(40, null)
      noMore.value = true
    }
  } finally {
    loadingMore.value = false
  }
}

// 初始加载
async function initLoad() {
  initialLoading.value = true
  try {
    await Promise.all([
      communityStore.loadBanners(),
      communityStore.loadCategories(),
      communityStore.loadTags(),
      communityStore.loadSectionNames(),
      loadLandscapeWorks(),
      loadMixedWorks(true)
    ])
  } finally {
    initialLoading.value = false
    await nextTick()
    setupObserver()
  }
}

// 筛选变更后重新加载
async function reloadWorks() {
  await Promise.all([loadLandscapeWorks(), loadMixedWorks(true)])
}

function setCategory(id) {
  if (activeCategory.value === id) return
  activeCategory.value = id
  reloadWorks()
}

function setSort(val) {
  if (activeSort.value === val) return
  activeSort.value = val
  reloadWorks()
}

function handleSearch() {
  reloadWorks()
}

function onLoginSuccess() {
  userToken.value = localStorage.getItem('token') || ''
  userName.value = localStorage.getItem('username') || ''
  userAvatar.value = localStorage.getItem('avatar') || ''
}

// 作品点击
function goToWork(work) {
  if (work?.id) router.push(`/community/${work.id}`)
}

// 点赞
async function handleLike(work) {
  if (!communityStore.requireLogin()) return
  try {
    const res = await toggleLike(work.id)
    const data = res.data || res
    work.is_liked = data.liked ?? !work.is_liked
    work.like_count = data.like_count ?? (work.is_liked ? (work.like_count || 0) + 1 : Math.max((work.like_count || 1) - 1, 0))
    toggleFavorite(work.id).catch(() => {})
  } catch (e) {
    console.error('[CommunityHome] 点赞失败:', e)
  }
}
// Intersection Observer 无限滚动
function setupObserver() {
  if (observer) observer.disconnect()
  if (!sentinelRef.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !loadingMore.value && !noMore.value) {
        loadMixedWorks()
      }
    },
    { rootMargin: '200px' }
  )
  observer.observe(sentinelRef.value)
}

onMounted(async () => {
  initLoad()
  document.addEventListener('click', onClickOutsideMenu)
  
  try {
    const freshBrand = await loadBrandConfig(true)
    brand.value = freshBrand
  } catch (e) {
    console.error('[CommunityHome] 品牌配置加载失败:', e)
  }
})

onUnmounted(() => {
  if (observer) observer.disconnect()
  document.removeEventListener('click', onClickOutsideMenu)
})
</script>
