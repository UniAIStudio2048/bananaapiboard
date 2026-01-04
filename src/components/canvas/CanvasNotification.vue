<script setup>
/**
 * CanvasNotification.vue - 画布模式通知铃铛组件
 * 在画布右上角显示一个白色铃铛图标，点击可查看通知公告
 */
import { ref, computed, onMounted, watch } from 'vue'
import { getTenantHeaders } from '@/config/tenant'

const props = defineProps({
  // 画布主题：dark / light
  theme: {
    type: String,
    default: 'dark'
  }
})

// 通知数据
const notification = ref(null)
const isVisible = ref(false)
const showPopup = ref(false)
const hasRead = ref(false)

// 是否显示未读红点
const showUnreadDot = computed(() => {
  return isVisible.value && !hasRead.value && notification.value?.content
})

// 解析内容中的链接
const parsedContent = computed(() => {
  if (!notification.value?.content) return ''
  let content = notification.value.content
  content = content.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g, 
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="canvas-notification-link">$1</a>'
  )
  return content
})

// 加载通知配置
async function loadNotification() {
  try {
    const r = await fetch('/api/tenant/notification', {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      // 只有当通知启用且 show_in_canvas 开启时才显示
      if (data.enabled && data.show_in_canvas && data.content) {
        notification.value = data
        isVisible.value = true
        // 检查本地存储的已读状态（根据内容哈希）
        const contentHash = hashCode(data.content)
        const readHash = localStorage.getItem('canvas_notification_read')
        hasRead.value = readHash === String(contentHash)
      }
    }
  } catch (e) {
    console.error('[CanvasNotification] 加载通知失败', e)
  }
}

// 简单的字符串哈希函数
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash
}

// 点击铃铛
function togglePopup() {
  showPopup.value = !showPopup.value
  if (showPopup.value && !hasRead.value) {
    // 标记为已读
    hasRead.value = true
    if (notification.value?.content) {
      const contentHash = hashCode(notification.value.content)
      localStorage.setItem('canvas_notification_read', String(contentHash))
    }
  }
}

// 关闭弹窗
function closePopup() {
  showPopup.value = false
}

// 点击弹窗外部关闭
function handleClickOutside(event) {
  if (showPopup.value) {
    const popup = document.querySelector('.canvas-notification-popup')
    const trigger = document.querySelector('.canvas-notification-trigger')
    if (popup && trigger && !popup.contains(event.target) && !trigger.contains(event.target)) {
      closePopup()
    }
  }
}

onMounted(() => {
  loadNotification()
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载时移除事件监听
import { onUnmounted } from 'vue'
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div v-if="isVisible" class="canvas-notification-wrapper">
    <!-- 铃铛按钮 -->
    <button
      class="canvas-notification-trigger"
      :class="{ 'theme-light': props.theme === 'light' }"
      @click.stop="togglePopup"
      title="查看公告"
    >
      <!-- 铃铛图标 -->
      <svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      <!-- 未读红点 -->
      <span v-if="showUnreadDot" class="unread-dot"></span>
    </button>

    <!-- 通知弹窗 -->
    <Transition name="popup-fade">
      <div 
        v-if="showPopup" 
        class="canvas-notification-popup"
        :class="{ 'theme-light': props.theme === 'light' }"
        @click.stop
      >
        <div class="popup-header">
          <div class="popup-title">
            <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span>公告通知</span>
          </div>
          <button class="popup-close" @click="closePopup">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="popup-content">
          <div v-html="parsedContent" class="notification-text"></div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.canvas-notification-wrapper {
  position: relative;
  z-index: 9001;
}

/* 铃铛按钮 - 深色主题（默认） */
.canvas-notification-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: rgba(18, 18, 18, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(20px);
  position: relative;
}

.canvas-notification-trigger:hover {
  background: rgba(30, 30, 30, 0.98);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.canvas-notification-trigger .bell-icon {
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.8);
  transition: color 0.2s ease;
}

.canvas-notification-trigger:hover .bell-icon {
  color: rgba(255, 255, 255, 0.95);
}

/* 未读红点 */
.unread-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
}

/* 亮色主题按钮 */
.canvas-notification-trigger.theme-light {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
}

.canvas-notification-trigger.theme-light:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(0, 0, 0, 0.15);
}

.canvas-notification-trigger.theme-light .bell-icon {
  color: rgba(28, 25, 23, 0.8);
}

.canvas-notification-trigger.theme-light:hover .bell-icon {
  color: rgba(28, 25, 23, 1);
}

/* 弹窗 - 深色主题（默认） */
.canvas-notification-popup {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-width: calc(100vw - 32px);
  background: rgba(24, 24, 24, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 12px 48px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.popup-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.title-icon {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.6);
}

.popup-close {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.popup-close svg {
  width: 14px;
  height: 14px;
}

.popup-content {
  padding: 16px;
  max-height: 280px;
  overflow-y: auto;
}

.notification-text {
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  word-break: break-word;
}

/* 链接样式 */
.notification-text :deep(.canvas-notification-link) {
  color: #60a5fa;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}

.notification-text :deep(.canvas-notification-link:hover) {
  color: #93c5fd;
}

/* 亮色主题弹窗 */
.canvas-notification-popup.theme-light {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.12),
    0 12px 48px rgba(0, 0, 0, 0.08);
}

.canvas-notification-popup.theme-light .popup-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

.canvas-notification-popup.theme-light .popup-title {
  color: #1c1917;
}

.canvas-notification-popup.theme-light .title-icon {
  color: #57534e;
}

.canvas-notification-popup.theme-light .popup-close {
  color: rgba(0, 0, 0, 0.4);
}

.canvas-notification-popup.theme-light .popup-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

.canvas-notification-popup.theme-light .notification-text {
  color: #292524;
}

.canvas-notification-popup.theme-light .notification-text :deep(.canvas-notification-link) {
  color: #2563eb;
}

.canvas-notification-popup.theme-light .notification-text :deep(.canvas-notification-link:hover) {
  color: #1d4ed8;
}

/* 弹窗动画 */
.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: all 0.2s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

/* 滚动条样式 */
.popup-content::-webkit-scrollbar {
  width: 4px;
}

.popup-content::-webkit-scrollbar-track {
  background: transparent;
}

.popup-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.canvas-notification-popup.theme-light .popup-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}
</style>

