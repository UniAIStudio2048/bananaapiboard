<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { getTenantHeaders } from '@/config/tenant'

const notification = ref(null)
const isVisible = ref(false)
const isCollapsed = ref(false)
const isMobile = ref(false)
const scrollSpeed = ref(50)

// 移动端双击检测
let lastTapTime = 0
let touchStartY = 0

// 检测是否为移动端
function checkMobile() {
  isMobile.value = window.innerWidth <= 768
}

// 加载通知配置
async function loadNotification() {
  try {
    const r = await fetch('/api/tenant/notification', {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      if (data.enabled && data.content) {
        notification.value = data
        scrollSpeed.value = data.scroll_speed || 50
        isVisible.value = true
        // 检查本地存储的收起状态
        const collapsed = localStorage.getItem('notification_collapsed')
        if (collapsed === 'true') {
          isCollapsed.value = true
        }
      }
    }
  } catch (e) {
    console.error('加载通知栏失败', e)
  }
}

// 解析内容中的链接
const parsedContent = computed(() => {
  if (!notification.value?.content) return ''
  let content = notification.value.content
  content = content.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g, 
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="notification-link">$1</a>'
  )
  return content
})

// 计算滚动动画时长
const animationDuration = computed(() => {
  if (!notification.value?.content) return 15
  // 根据内容长度和速度计算动画时长
  const contentLength = notification.value.content.length
  const baseWidth = contentLength * 14 + 200 // 估算内容宽度
  return Math.max(8, baseWidth / scrollSpeed.value)
})

// 计算样式
const barStyle = computed(() => {
  if (!notification.value) return {}
  return {
    '--bg-color': notification.value.background_color || '#FEF3C7',
    '--text-color': notification.value.text_color || '#92400E',
    '--scroll-duration': `${animationDuration.value}s`
  }
})

// 点击收起
function handleBarClick(e) {
  // 如果点击的是链接，不收起
  if (e.target.tagName === 'A') return
  toggleCollapse()
}

// 切换收起/展开状态
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('notification_collapsed', isCollapsed.value.toString())
}

// 移动端触摸事件处理
function handleTouchStart(e) {
  touchStartY = e.touches[0].clientY
}

function handleTouchEnd(e) {
  const touchEndY = e.changedTouches[0].clientY
  const deltaY = touchEndY - touchStartY
  
  // 下拉手势展开（收起状态下）
  if (isCollapsed.value && deltaY > 30) {
    isCollapsed.value = false
    localStorage.setItem('notification_collapsed', 'false')
    return
  }
  
  // 双击收起（展开状态下）
  if (!isCollapsed.value) {
    const currentTime = new Date().getTime()
    const tapLength = currentTime - lastTapTime
    if (tapLength < 300 && tapLength > 0) {
      isCollapsed.value = true
      localStorage.setItem('notification_collapsed', 'true')
    }
    lastTapTime = currentTime
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadNotification()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<template>
  <Transition name="notification">
    <div 
      v-if="isVisible && notification" 
      class="notification-wrapper"
      :style="barStyle"
      :class="{ 'is-collapsed': isCollapsed }"
    >
      <!-- 展开状态 -->
      <div 
        v-show="!isCollapsed"
        class="notification-bar"
        @click="handleBarClick"
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
        :title="isMobile ? '双击收起' : '点击收起'"
      >
        <div class="notification-track">
          <div class="notification-scroll">
            <span v-html="parsedContent" class="notification-text"></span>
            <span class="spacer">•</span>
            <span v-html="parsedContent" class="notification-text"></span>
            <span class="spacer">•</span>
          </div>
        </div>
      </div>
      
      <!-- 收起状态的把手 -->
      <div 
        v-show="isCollapsed"
        class="notification-handle"
        @click="toggleCollapse"
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
        :title="isMobile ? '下拉展开' : '点击展开'"
      >
        <div class="handle-pill">
          <svg class="handle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
          </svg>
          <span class="handle-dot"></span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.notification-wrapper {
  position: relative;
  z-index: 30;
  --bg-color: #FEF3C7;
  --text-color: #92400E;
  --scroll-duration: 15s;
  display: flex;
  justify-content: center;
  padding: 6px 0;
  pointer-events: none;
}

/* 展开状态的通知栏 */
.notification-bar {
  display: inline-flex;
  align-items: center;
  background: var(--bg-color);
  color: var(--text-color);
  padding: 0.5rem 1.5rem;
  min-height: 36px;
  width: 520px;
  max-width: calc(100vw - 40px);
  overflow: hidden;
  position: relative;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  pointer-events: auto;
}

.notification-bar:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  transform: translateY(-0.5px);
}

.notification-bar:active {
  transform: translateY(0);
}

/* 滚动轨道 */
.notification-track {
  overflow: hidden;
  flex: 1;
  mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
}

/* 滚动容器 */
.notification-scroll {
  display: inline-flex;
  align-items: center;
  animation: scroll-marquee var(--scroll-duration) linear infinite;
  white-space: nowrap;
}

.notification-bar:hover .notification-scroll {
  animation-play-state: paused;
}

.spacer {
  padding: 0 2em;
  opacity: 0.5;
  flex-shrink: 0;
}

@keyframes scroll-marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.notification-text {
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.5;
  flex-shrink: 0;
}

/* 链接样式 */
.notification-bar :deep(.notification-link) {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.notification-bar :deep(.notification-link:hover) {
  opacity: 0.75;
}

/* 收起状态的把手 */
.notification-handle {
  display: flex;
  justify-content: center;
  padding: 2px 0;
  cursor: pointer;
  pointer-events: auto;
}

.handle-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  padding: 6px 16px;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;
  position: relative;
}

.handle-pill:hover {
  padding: 7px 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}

.handle-icon {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}

.handle-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
  opacity: 0.8;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

/* 过渡动画 */
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateY(-100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .notification-wrapper {
    padding: 4px 8px;
  }
  
  .notification-bar {
    padding: 0.4rem 1rem;
    min-height: 32px;
    max-width: calc(100% - 16px);
    border-radius: 6px;
  }
  
  .notification-text {
    font-size: 0.8125rem;
  }
  
  .spacer {
    padding: 0 1.5em;
  }
  
  .handle-pill {
    padding: 3px 10px;
  }
  
  .handle-icon {
    width: 12px;
    height: 12px;
  }
  
  .handle-dot {
    width: 5px;
    height: 5px;
  }
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .notification-bar {
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.25);
  }
  
  .handle-pill {
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
  }
}
</style>
