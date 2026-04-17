<script setup>
/**
 * CanvasNotification.vue - 画布模式通知铃铛组件
 * 支持多条公告消息，按日期分组显示
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getTenantHeaders, getApiUrl } from '@/config/tenant'

const props = defineProps({
  theme: {
    type: String,
    default: 'dark'
  }
})

// 公告数据
const announcements = ref([])
const isVisible = ref(false)
const showPopup = ref(false)
const loading = ref(false)
const activeTab = ref('platform') // 'interactive' | 'platform'
const showInCanvasEnabled = ref(false) // 是否启用画布模式显示

// 已读公告ID集合
const readIds = ref(new Set())

// 未读数量
const unreadCount = computed(() => {
  return announcements.value.filter(a => !readIds.value.has(a.id)).length
})

// 按日期分组的公告
const groupedAnnouncements = computed(() => {
  const filtered = announcements.value.filter(a => {
    if (activeTab.value === 'interactive') return a.type === 'interactive'
    return a.type === 'platform' || !a.type
  })
  
  const groups = {}
  filtered.forEach(item => {
    const date = formatDate(item.published_at)
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(item)
  })
  
  // 转换为数组并按日期倒序
  return Object.entries(groups)
    .sort((a, b) => {
      const dateA = new Date(a[0].replace(/\//g, '-'))
      const dateB = new Date(b[0].replace(/\//g, '-'))
      return dateB - dateA
    })
    .map(([date, items]) => ({ date, items }))
})

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

// 加载通知配置（检查是否启用画布模式显示）
async function loadNotificationConfig() {
  try {
    const r = await fetch(getApiUrl('/api/tenant/notification'), {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      // MySQL 返回数字 1/0，需要用 !! 转换为布尔值
      showInCanvasEnabled.value = !!data.show_in_canvas
    }
  } catch (e) {
    console.error('[CanvasNotification] 加载通知配置失败', e)
    showInCanvasEnabled.value = false
  }
}

// 加载公告
async function loadAnnouncements() {
  // 先检查是否启用画布模式显示
  await loadNotificationConfig()
  
  // 如果未启用，不加载公告
  if (!showInCanvasEnabled.value) {
    isVisible.value = false
    return
  }
  
  loading.value = true
  try {
    const r = await fetch(getApiUrl('/api/tenant/announcements'), {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      announcements.value = data.announcements || []
      isVisible.value = announcements.value.length > 0
      
      // 从localStorage加载已读状态
      const savedReadIds = localStorage.getItem('canvas_announcement_read_ids')
      if (savedReadIds) {
        try {
          readIds.value = new Set(JSON.parse(savedReadIds))
        } catch (e) {
          readIds.value = new Set()
        }
      }
    }
  } catch (e) {
    console.error('[CanvasNotification] 加载公告失败', e)
  } finally {
    loading.value = false
  }
}

// 点击铃铛
function togglePopup() {
  showPopup.value = !showPopup.value
  if (showPopup.value) {
    // 标记所有可见的公告为已读
    markAllAsRead()
  }
}

// 标记所有为已读
function markAllAsRead() {
  announcements.value.forEach(a => {
    readIds.value.add(a.id)
  })
  localStorage.setItem('canvas_announcement_read_ids', JSON.stringify([...readIds.value]))
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

// 切换tab
function switchTab(tab) {
  activeTab.value = tab
}

// 点击公告
function handleAnnouncementClick(item) {
  if (item.link) {
    window.open(item.link, '_blank')
  }
}

onMounted(() => {
  loadAnnouncements()
  document.addEventListener('click', handleClickOutside)
})

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
      <svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      <!-- 未读红点 -->
      <span v-if="unreadCount > 0" class="unread-dot"></span>
    </button>

    <!-- 通知弹窗 -->
    <Transition name="popup-fade">
      <div 
        v-if="showPopup" 
        class="canvas-notification-popup"
        :class="{ 'theme-light': props.theme === 'light' }"
        @click.stop
      >
        <!-- 标题栏 -->
        <div class="popup-header">
          <div class="popup-tabs">
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'interactive' }"
              @click="switchTab('interactive')"
            >
              互动消息
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'platform' }"
              @click="switchTab('platform')"
            >
              平台消息
            </button>
          </div>
          <div class="header-actions">
            <button class="action-btn close-btn" @click="closePopup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 公告内容 -->
        <div class="popup-content">
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
            <span>加载中...</span>
          </div>
          
          <div v-else-if="groupedAnnouncements.length === 0" class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span>暂无消息</span>
          </div>
          
          <div v-else class="announcement-list">
            <div v-for="group in groupedAnnouncements" :key="group.date" class="date-group">
              <!-- 日期标签 -->
              <div class="date-label">{{ group.date }}</div>
              
              <!-- 公告项 -->
              <div 
                v-for="item in group.items" 
                :key="item.id" 
                class="announcement-item"
                :class="{ 'has-link': item.link }"
                @click="handleAnnouncementClick(item)"
              >
                <div class="item-icon">
                  <svg v-if="!readIds.has(item.id)" class="unread-indicator" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <svg v-else class="read-indicator" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div class="item-content">
                  <div class="item-title">
                    <span v-if="item.icon" class="title-icon">{{ item.icon }}</span>
                    {{ item.title }}
                  </div>
                  <div v-if="item.content" class="item-desc">{{ item.content }}</div>
                </div>
              </div>
            </div>
          </div>
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
  width: 380px;
  max-width: calc(100vw - 32px);
  max-height: 520px;
  background: rgba(28, 28, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 12px 48px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.popup-tabs {
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.1);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  width: 28px;
  height: 28px;
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

.action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 20px;
  gap: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.empty-icon {
  width: 40px;
  height: 40px;
  opacity: 0.5;
}

/* 公告列表 */
.announcement-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-group {
  margin-bottom: 8px;
}

.date-label {
  padding: 8px 10px 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.announcement-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  transition: all 0.2s ease;
  cursor: default;
}

.announcement-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.announcement-item.has-link {
  cursor: pointer;
}

.announcement-item.has-link:hover {
  background: rgba(255, 255, 255, 0.08);
}

.item-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}

.item-icon svg {
  width: 18px;
  height: 18px;
}

.unread-indicator {
  color: rgba(255, 255, 255, 0.8);
}

.read-indicator {
  color: rgba(255, 255, 255, 0.35);
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.title-icon {
  flex-shrink: 0;
}

.item-desc {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.5;
  word-break: break-word;
}

/* 亮色主题弹窗 */
.canvas-notification-popup.theme-light {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.1),
    0 12px 48px rgba(0, 0, 0, 0.06);
}

.canvas-notification-popup.theme-light .popup-header {
  border-bottom-color: rgba(0, 0, 0, 0.05);
  background: rgba(0, 0, 0, 0.02);
}

.canvas-notification-popup.theme-light .tab-btn {
  color: rgba(0, 0, 0, 0.45);
}

.canvas-notification-popup.theme-light .tab-btn:hover {
  color: rgba(0, 0, 0, 0.65);
  background: rgba(0, 0, 0, 0.04);
}

.canvas-notification-popup.theme-light .tab-btn.active {
  color: rgba(0, 0, 0, 0.9);
  background: rgba(0, 0, 0, 0.08);
}

.canvas-notification-popup.theme-light .action-btn {
  color: rgba(0, 0, 0, 0.4);
}

.canvas-notification-popup.theme-light .action-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.8);
}

.canvas-notification-popup.theme-light .loading-state,
.canvas-notification-popup.theme-light .empty-state {
  color: rgba(0, 0, 0, 0.45);
}

.canvas-notification-popup.theme-light .loading-spinner {
  border-color: rgba(0, 0, 0, 0.08);
  border-top-color: rgba(0, 0, 0, 0.5);
}

.canvas-notification-popup.theme-light .date-label {
  color: rgba(0, 0, 0, 0.4);
}

.canvas-notification-popup.theme-light .announcement-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.canvas-notification-popup.theme-light .announcement-item.has-link:hover {
  background: rgba(0, 0, 0, 0.06);
}

.canvas-notification-popup.theme-light .item-icon {
  background: rgba(0, 0, 0, 0.04);
}

.canvas-notification-popup.theme-light .unread-indicator {
  color: rgba(0, 0, 0, 0.7);
}

.canvas-notification-popup.theme-light .read-indicator {
  color: rgba(0, 0, 0, 0.3);
}

.canvas-notification-popup.theme-light .item-title {
  color: rgba(0, 0, 0, 0.85);
}

.canvas-notification-popup.theme-light .item-desc {
  color: rgba(0, 0, 0, 0.55);
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
  width: 5px;
}

.popup-content::-webkit-scrollbar-track {
  background: transparent;
}

.popup-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

.popup-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.canvas-notification-popup.theme-light .popup-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

.canvas-notification-popup.theme-light .popup-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.18);
}

/* 响应式 */
@media (max-width: 480px) {
  .canvas-notification-popup {
    width: calc(100vw - 24px);
    right: -8px;
  }
}
</style>
