<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { getMe } from '@/api/client'
import { getTheme, toggleTheme as toggleThemeUtil } from '@/utils/theme'
import { getTenantHeaders } from '@/config/tenant'

const me = ref(null)
const route = useRoute()
const router = useRouter()
const isMenuOpen = ref(false)
const isUserMenuOpen = ref(false)
const isGenerateMenuOpen = ref(false) // 生成菜单下拉状态
const currentTheme = ref(getTheme())
const isWidescreenMode = ref(false)
const inviteCode = ref('')
const copySuccess = ref(false)

// 备案号配置
const icpConfig = ref({
  enabled: false,
  icp_number: '',
  icp_link: 'https://beian.miit.gov.cn/'
})

// 切换主题
function toggleTheme() {
  const newTheme = toggleThemeUtil()
  currentTheme.value = newTheme
}

// 刷新用户信息
async function refreshUserInfo() {
  // 强制刷新，禁用缓存，确保获取最新数据
  me.value = await getMe(true)
  console.log('[App] 用户信息已刷新:', { 
    points: me.value?.points, 
    package_points: me.value?.package_points,
    balance: me.value?.balance 
  })
}

// 加载备案号配置
async function loadSiteConfig() {
  try {
    const r = await fetch('/api/site-config', {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      if (data.icp_config) {
        icpConfig.value = data.icp_config
      }
    }
  } catch (e) {
    console.error('加载网站配置失败', e)
  }
}

onMounted(async () => { 
  me.value = await getMe()
  await Promise.all([loadInviteCode(), loadSiteConfig()])
  
  // 点击外部关闭下拉菜单
  document.addEventListener('click', closeMenus)
  // 监听主题变化（从其他页面切换时同步）
  const handleThemeChange = () => {
    currentTheme.value = getTheme()
  }
  window.addEventListener('storage', handleThemeChange)
  // 自定义事件监听（同页面切换）
  window.addEventListener('theme-changed', handleThemeChange)
  
  // 监听布局模式变化
  const handleLayoutModeChange = (e) => {
    isWidescreenMode.value = e.detail === 'widescreen'
  }
  window.addEventListener('layout-mode-changed', handleLayoutModeChange)
  
  // 监听用户信息更新事件
  window.addEventListener('user-info-updated', refreshUserInfo)
  
  // 初始化时检查 localStorage
  const savedLayoutMode = localStorage.getItem('layoutMode')
  isWidescreenMode.value = savedLayoutMode === 'widescreen'
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenus)
})

// 生成下拉菜单项
const generateMenuItems = [
  { path: '/', label: '图片生成', icon: '🎨' },
  { path: '/video', label: '视频生成', icon: '🎬' },
]

const navItems = [
  // 其他导航项可以在这里添加
]

const isActive = (path) => route.path === path

function logout() {
  localStorage.removeItem('token')
  me.value = null
  isUserMenuOpen.value = false
  router.push('/auth')
}

function closeMenus(e) {
  // 如果点击的不是用户菜单按钮和下拉框，则关闭
  if (!e.target.closest('.user-menu-container')) {
    isUserMenuOpen.value = false
  }
  // 如果点击的不是生成菜单按钮和下拉框，则关闭
  if (!e.target.closest('.generate-menu-container')) {
    isGenerateMenuOpen.value = false
  }
}

// 获取当前生成模式的标签
const currentGenerateLabel = computed(() => {
  const currentItem = generateMenuItems.find(item => item.path === route.path)
  return currentItem ? currentItem.label : '生成'
})

// 获取当前生成模式的图标
const currentGenerateIcon = computed(() => {
  const currentItem = generateMenuItems.find(item => item.path === route.path)
  return currentItem ? currentItem.icon : '🎨'
})

function openVoucherModal() {
  // 触发自定义事件，通知Home组件打开兑换券模态框
  window.dispatchEvent(new CustomEvent('open-voucher-modal'))
}

// 加载邀请码
async function loadInviteCode() {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      inviteCode.value = ''
      return
    }
    const r = await fetch('/api/user/invite-code', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (r.ok) {
      const data = await r.json()
      inviteCode.value = data.invite_code
    } else {
      inviteCode.value = ''
    }
  } catch (e) {
    console.error('加载邀请码失败', e)
    inviteCode.value = ''
  }
}

// 获取邀请链接
function getInviteLink() {
  if (!inviteCode.value) return ''
  return `${window.location.origin}/auth?invite=${inviteCode.value}`
}

// 复制邀请链接
async function copyInviteLink() {
  const link = getInviteLink()
  if (!link) {
    return
  }
  try {
    await navigator.clipboard.writeText(link)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  } catch (err) {
    console.error('复制失败', err)
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- 导航栏 -->
    <nav class="glass sticky top-0 z-50 border-b border-slate-200/50 dark:border-dark-600/50">
      <div class="mx-auto" 
        :class="isWidescreenMode && route.path === '/' ? 'px-0' : 'max-w-7xl px-4 sm:px-6 lg:px-8'">
        <div class="flex justify-between items-center h-16"
          :class="isWidescreenMode && route.path === '/' ? 'px-4' : ''">
          <!-- Logo -->
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center">
              <span class="text-2xl">🍌</span>
            </div>
            <span class="text-xl font-bold gradient-text">Nanobanana</span>
          </div>

          <!-- 桌面端导航 -->
          <div class="hidden md:flex items-center space-x-2">
            <!-- 生成下拉菜单 -->
            <div class="relative generate-menu-container">
              <button
                @click.stop="isGenerateMenuOpen = !isGenerateMenuOpen"
                class="nav-link flex items-center"
                :class="{ active: isActive('/') || isActive('/video') }"
              >
                <span class="mr-2">{{ currentGenerateIcon }}</span>
                {{ currentGenerateLabel }}
                <svg class="w-4 h-4 ml-1 transition-transform" :class="{ 'rotate-180': isGenerateMenuOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              <!-- 下拉菜单 -->
              <div
                v-if="isGenerateMenuOpen"
                class="absolute left-0 mt-2 w-48 bg-white dark:bg-dark-700 rounded-xl shadow-xl border border-slate-200 dark:border-dark-600 py-2 z-50 animate-slide-up"
              >
                <RouterLink
                  v-for="item in generateMenuItems"
                  :key="item.path"
                  :to="item.path"
                  class="flex items-center px-4 py-2 text-sm transition-colors"
                  :class="isActive(item.path) ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600'"
                  @click="isGenerateMenuOpen = false"
                >
                  <span class="mr-3">{{ item.icon }}</span>
                  {{ item.label }}
                </RouterLink>
              </div>
            </div>
            
            <RouterLink
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              class="nav-link"
              :class="{ active: isActive(item.path) }"
            >
              <span class="mr-2">{{ item.icon }}</span>
              {{ item.label }}
            </RouterLink>
            
            <!-- 购买套餐入口 -->
            <RouterLink
              v-if="me"
              to="/packages"
              class="nav-link flex items-center"
            >
              <span class="mr-2">💎</span>
              购买套餐
            </RouterLink>
            
            <!-- 兑换券入口 -->
            <button
              v-if="me"
              @click="openVoucherModal"
              class="nav-link flex items-center"
            >
              <span class="mr-2">🎫</span>
              兑换券入口
            </button>
            
            <!-- 积分和余额显示 -->
            <div v-if="me" class="ml-4 flex items-center space-x-2">
              <!-- 套餐积分 -->
              <div class="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full text-white text-sm font-medium shadow-lg hover:shadow-xl transition-shadow" :title="`套餐内剩余积分（会到期）`">
                <span class="mr-1">💎</span>
                {{ me.package_points || 0 }} 积分
              </div>
              <!-- 永久积分 -->
              <div class="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full text-white text-sm font-medium shadow-lg hover:shadow-xl transition-shadow" :title="`永久积分（永不过期）`">
                <span class="mr-1">⭐</span>
                {{ me.points || 0 }} 积分
              </div>
              <!-- 余额 -->
              <div class="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 rounded-full text-white text-sm font-medium shadow-lg">
                <span class="mr-1">💰</span>
                ¥{{ ((me.balance || 0) / 100).toFixed(2) }}
              </div>
            </div>

            <!-- 主题切换按钮 -->
            <button
              @click="toggleTheme"
              class="ml-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
              :title="currentTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
            >
              <span v-if="currentTheme === 'dark'" class="text-xl">🌙</span>
              <span v-else class="text-xl">☀️</span>
            </button>

            <!-- 我的菜单（下拉） -->
            <div class="relative ml-2 user-menu-container">
              <button
                @click.stop="isUserMenuOpen = !isUserMenuOpen"
                class="nav-link flex items-center"
                :class="{ active: isActive('/user') || isActive('/auth') || isActive('/adminboard') }"
              >
                <span class="mr-2">⚡</span>
                我的
                <svg class="w-4 h-4 ml-1 transition-transform" :class="{ 'rotate-180': isUserMenuOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              <!-- 下拉菜单 -->
              <div
                v-if="isUserMenuOpen"
                class="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-700 rounded-xl shadow-xl border border-slate-200 dark:border-dark-600 py-2 z-50 animate-slide-up"
              >
                <!-- 已登录状态 -->
                <template v-if="me">
                  <div class="px-4 py-3 border-b border-slate-200 dark:border-dark-600">
                    <p class="text-sm font-medium text-slate-900 dark:text-slate-100">{{ me.username }}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">{{ me.email }}</p>
                  </div>
                  
                  <RouterLink
                    to="/user"
                    class="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                    @click="isUserMenuOpen = false"
                  >
                    <span class="mr-3">👤</span>
                    个人中心
                  </RouterLink>
                  
                  <button
                    @click="copyInviteLink"
                    class="w-full flex items-center px-4 py-2 text-sm transition-colors"
                    :class="copySuccess ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600'"
                  >
                    <span class="mr-3">{{ copySuccess ? '✅' : '🎉' }}</span>
                    {{ copySuccess ? '复制成功！' : '复制邀请链接' }}
                  </button>
                  
                  <RouterLink
                    v-if="me.role === 'admin'"
                    to="/adminboard"
                    class="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                    @click="isUserMenuOpen = false"
                  >
                    <span class="mr-3">🔧</span>
                    管理后台
                  </RouterLink>
                  
                  <div class="border-t border-slate-200 dark:border-dark-600 my-2"></div>
                  
                  <button
                    @click="logout"
                    class="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <span class="mr-3">🚪</span>
                    退出登录
                  </button>
                </template>

                <!-- 未登录状态 -->
                <template v-else>
                  <RouterLink
                    to="/auth"
                    class="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                    @click="isUserMenuOpen = false"
                  >
                    <span class="mr-3">🔑</span>
                    登录 / 注册
                  </RouterLink>
                </template>
              </div>
            </div>
          </div>

          <!-- 移动端菜单按钮 -->
          <div class="md:hidden">
            <button
              @click="isMenuOpen = !isMenuOpen"
              class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 移动端菜单 -->
      <div v-if="isMenuOpen" class="md:hidden glass border-t border-slate-200/50 dark:border-dark-600/50">
        <div class="px-4 py-3 space-y-2">
          <!-- 生成菜单项 -->
          <div class="space-y-1">
            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 px-2">生成</div>
            <RouterLink
              v-for="item in generateMenuItems"
              :key="item.path"
              :to="item.path"
              class="block nav-link"
              :class="{ active: isActive(item.path) }"
              @click="isMenuOpen = false"
            >
              <span class="mr-2">{{ item.icon }}</span>
              {{ item.label }}
            </RouterLink>
          </div>
          
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="block nav-link"
            :class="{ active: isActive(item.path) }"
            @click="isMenuOpen = false"
          >
            <span class="mr-2">{{ item.icon }}</span>
            {{ item.label }}
          </RouterLink>
          
          <!-- 移动端购买套餐入口 -->
          <RouterLink
            v-if="me"
            to="/packages"
            class="block nav-link"
            :class="{ active: isActive('/packages') }"
            @click="isMenuOpen = false"
          >
            <span class="mr-2">💎</span>
            购买套餐
          </RouterLink>
          
          <!-- 移动端兑换券入口 -->
          <button
            v-if="me"
            @click="openVoucherModal(); isMenuOpen = false"
            class="w-full text-left nav-link"
          >
            <span class="mr-2">🎫</span>
            兑换券入口
          </button>
          
          <!-- 移动端积分和余额显示 -->
          <div v-if="me" class="pt-2 mt-2 border-t border-slate-200/50 dark:border-dark-600/50 space-y-2">
            <div class="px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg text-white text-sm font-medium shadow-lg">
              <div class="flex items-center justify-between">
                <span><span class="mr-1">💎</span>套餐积分</span>
                <span class="font-bold">{{ me.package_points || 0 }}</span>
              </div>
              <div class="text-xs opacity-90 mt-1">
                套餐内剩余积分（会到期）
              </div>
            </div>
            <div class="px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg text-white text-sm font-medium shadow-lg">
              <div class="flex items-center justify-between">
                <span><span class="mr-1">⭐</span>永久积分</span>
                <span class="font-bold">{{ me.points || 0 }}</span>
              </div>
              <div class="text-xs opacity-90 mt-1">
                永久积分（永不过期）
              </div>
            </div>
            <div class="px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white text-sm font-medium shadow-lg">
              <div class="flex items-center justify-between">
                <span><span class="mr-1">💰</span>余额</span>
                <span class="font-bold">¥{{ ((me.balance || 0) / 100).toFixed(2) }}</span>
              </div>
            </div>
          </div>

          <!-- 移动端主题切换 -->
          <div class="pt-2 mt-2 border-t border-slate-200/50 dark:border-dark-600/50">
            <button
              @click="toggleTheme"
              class="w-full flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
            >
              <span class="mr-3">{{ currentTheme === 'dark' ? '🌙' : '☀️' }}</span>
              {{ currentTheme === 'dark' ? '深色模式' : '浅色模式' }}
            </button>
          </div>

          <!-- 移动端我的菜单 -->
          <div class="pt-2 mt-2 border-t border-slate-200/50 dark:border-dark-600/50">
            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 px-2">我的</div>
            
            <!-- 已登录状态 -->
            <template v-if="me">
              <div class="px-3 py-2 bg-slate-100 dark:bg-dark-600 rounded-lg mb-2">
                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">{{ me.username }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ me.email }}</p>
              </div>
              
              <RouterLink
                to="/user"
                class="block nav-link"
                :class="{ active: isActive('/user') }"
                @click="isMenuOpen = false"
              >
                <span class="mr-2">👤</span>
                个人中心
              </RouterLink>
              
              <button
                @click="copyInviteLink"
                class="w-full text-left nav-link transition-colors"
                :class="copySuccess ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : ''"
              >
                <span class="mr-2">{{ copySuccess ? '✅' : '🎉' }}</span>
                {{ copySuccess ? '复制成功！' : '复制邀请链接' }}
              </button>
              
              <RouterLink
                v-if="me.role === 'admin'"
                to="/adminboard"
                class="block nav-link"
                :class="{ active: isActive('/adminboard') }"
                @click="isMenuOpen = false"
              >
                <span class="mr-2">🔧</span>
                管理后台
              </RouterLink>
              
              <button
                @click="logout(); isMenuOpen = false"
                class="w-full text-left nav-link text-red-600 dark:text-red-400 mt-2"
              >
                <span class="mr-2">🚪</span>
                退出登录
              </button>
            </template>

            <!-- 未登录状态 -->
            <template v-else>
              <RouterLink
                to="/auth"
                class="block nav-link"
                :class="{ active: isActive('/auth') }"
                @click="isMenuOpen = false"
              >
                <span class="mr-2">🔑</span>
                登录 / 注册
              </RouterLink>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <!-- 主内容区 -->
    <main class="flex-1">
      <RouterView />
    </main>
    
    <!-- 底部备案号 - 固定在页面最底部 -->
    <footer v-if="icpConfig.enabled && icpConfig.icp_number" class="py-3 text-center border-t border-slate-200/50 dark:border-dark-600/50 bg-slate-50/80 dark:bg-dark-800/80 mt-auto">
      <a 
        :href="icpConfig.icp_link || 'https://beian.miit.gov.cn/'" 
        target="_blank" 
        rel="noopener noreferrer"
        class="text-xs text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        {{ icpConfig.icp_number }}
      </a>
    </footer>
  </div>
</template>

<style scoped>
.nav-link {
  @apply px-4 py-2 rounded-lg font-medium transition-all duration-200;
  @apply text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400;
  @apply hover:bg-primary-50 dark:hover:bg-primary-900/20;
}

.nav-link.active {
  @apply bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400;
}

.animate-slide-up {
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
