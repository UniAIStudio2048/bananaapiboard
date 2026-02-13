<template>
  <div class="ticket-list">
    <!-- 头部 -->
    <div class="list-header">
      <h3 class="header-title">我的工单</h3>
      <div class="header-actions">
        <button class="create-btn" @click="$emit('create')" title="创建工单">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <button class="close-btn" @click="$emit('close')" title="关闭">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div class="status-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-btn"
        :class="{ active: currentStatus === tab.value }"
        @click="changeStatus(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 工单列表 -->
    <div class="list-content">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>

      <div v-else-if="tickets.length === 0" class="empty-state">
        <svg class="w-12 h-12 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>暂无工单</p>
      </div>

      <div v-else class="ticket-items">
        <div
          v-for="ticket in tickets"
          :key="ticket.id"
          class="ticket-item"
          :class="{ unread: ticket.has_unread_replies }"
          @click="$emit('select', ticket)"
        >
          <div class="ticket-header">
            <span class="ticket-number">#{{ ticket.ticket_number }}</span>
            <span class="ticket-status" :class="`status-${ticket.status}`">
              {{ getStatusLabel(ticket.status) }}
            </span>
          </div>
          <h4 class="ticket-title">{{ ticket.subject }}</h4>
          <p class="ticket-type">{{ getTypeLabel(ticket.category) }}</p>
          <div class="ticket-footer">
            <span class="ticket-time">{{ formatTime(ticket.created_at) }}</span>
            <span v-if="ticket.has_unread_replies" class="unread-dot"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { getTickets } from '@/api/ticket'

const props = defineProps({
  status: {
    type: String,
    default: 'all'
  }
})

const emit = defineEmits(['select', 'create', 'close'])

const tabs = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' }
]

const currentStatus = ref(props.status)
const tickets = ref([])
const loading = ref(false)

// 加载工单列表
async function loadTickets() {
  loading.value = true
  try {
    const params = currentStatus.value === 'all' ? {} : { status: currentStatus.value }
    const data = await getTickets(params)
    tickets.value = data.tickets || []
  } catch (e) {
    console.error('加载工单列表失败:', e)
    tickets.value = []
  } finally {
    loading.value = false
  }
}

// 切换状态
function changeStatus(status) {
  currentStatus.value = status
  loadTickets()
}

// 获取状态标签
function getStatusLabel(status) {
  const labels = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已解决',
    closed: '已关闭'
  }
  return labels[status] || status
}

// 获取类型标签
function getTypeLabel(type) {
  const labels = {
    bug: '问题反馈',
    feature: '功能建议',
    invoice: '开票申请',
    other: '其他'
  }
  return labels[type] || type
}

// 格式化时间
function formatTime(time) {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

watch(() => props.status, (newStatus) => {
  currentStatus.value = newStatus
  loadTickets()
})

onMounted(() => {
  loadTickets()
})

// 暴露刷新方法
defineExpose({
  refresh: loadTickets
})
</script>

<style scoped>
.ticket-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 20px;
  border-bottom: 1px solid #2a2a2a;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.create-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: transparent;
  color: #888888;
  cursor: pointer;
  transition: all 0.2s;
}

.create-btn:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #ffffff;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: transparent;
  color: #888888;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #ffffff;
}

.status-tabs {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid #2a2a2a;
  overflow-x: auto;
}

.tab-btn {
  padding: 6px 14px;
  font-size: 13px;
  color: #888888;
  background: transparent;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab-btn:hover {
  color: #ffffff;
  border-color: #3a3a3a;
}

.tab-btn.active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
  border-color: #3a3a3a;
}

.list-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.list-content::-webkit-scrollbar {
  width: 6px;
}

.list-content::-webkit-scrollbar-track {
  background: transparent;
}

.list-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666666;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #2a2a2a;
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.ticket-items {
  padding: 12px;
}

.ticket-item {
  padding: 16px;
  margin-bottom: 8px;
  background: linear-gradient(180deg, #1f1f1f 0%, #1a1a1a 100%);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.ticket-item:hover {
  border-color: #3a3a3a;
  background: #2a2a2a;
}

.ticket-item.unread {
  border-color: rgba(99, 102, 241, 0.5);
}

.ticket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ticket-number {
  font-size: 12px;
  color: #888888;
  font-family: monospace;
}

.ticket-status {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 6px;
  font-weight: 500;
}

.status-pending {
  background: rgba(251, 191, 36, 0.1);
  color: rgb(251, 191, 36);
}

.status-processing {
  background: rgba(99, 102, 241, 0.1);
  color: rgb(129, 140, 248);
}

.status-resolved {
  background: rgba(34, 197, 94, 0.1);
  color: rgb(34, 197, 94);
}

.status-closed {
  background: rgba(255, 255, 255, 0.06);
  color: #666666;
}

.ticket-title {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  margin: 0 0 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-type {
  font-size: 12px;
  color: #888888;
  margin: 0 0 8px 0;
}

.ticket-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ticket-time {
  font-size: 12px;
  color: #666666;
}

.unread-dot {
  width: 8px;
  height: 8px;
  background: rgb(239, 68, 68);
  border-radius: 50%;
}
</style>

<style>
/* ========== TicketList 白昼模式 ========== */
/* 双写类名提升特异性，确保覆盖 scoped 样式 */
html.canvas-theme-light .ticket-list.ticket-list .list-header {
  border-bottom-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .header-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-list.ticket-list .create-btn,
html.canvas-theme-light .ticket-list.ticket-list .close-btn {
  border-color: rgba(0,0,0,0.1) !important;
  color: rgba(0,0,0,0.5) !important;
  background: transparent !important;
}
html.canvas-theme-light .ticket-list.ticket-list .create-btn:hover,
html.canvas-theme-light .ticket-list.ticket-list .close-btn:hover {
  background: rgba(0,0,0,0.05) !important;
  border-color: rgba(0,0,0,0.15) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-list.ticket-list .status-tabs {
  border-bottom-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .tab-btn {
  color: rgba(0,0,0,0.5) !important;
  border-color: rgba(0,0,0,0.1) !important;
  background: transparent !important;
}
html.canvas-theme-light .ticket-list.ticket-list .tab-btn:hover {
  color: #1c1917 !important;
  border-color: rgba(0,0,0,0.15) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .tab-btn.active {
  color: #1c1917 !important;
  background: rgba(0,0,0,0.05) !important;
  border-color: rgba(0,0,0,0.15) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .list-content {
  scrollbar-color: rgba(0,0,0,0.15) transparent !important;
}
html.canvas-theme-light .ticket-list.ticket-list .list-content::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.12) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .loading-state,
html.canvas-theme-light .ticket-list.ticket-list .empty-state {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .empty-state svg {
  color: rgba(0,0,0,0.3) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .spinner {
  border-color: rgba(0,0,0,0.1) !important;
  border-top-color: #6366f1 !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-item.ticket-item {
  background: #fff !important;
  border-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-item.ticket-item:hover {
  border-color: rgba(0,0,0,0.15) !important;
  background: rgba(245,245,244,1) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-item.unread {
  border-color: rgba(99,102,241,0.4) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-number {
  color: rgba(0,0,0,0.45) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-type {
  color: rgba(0,0,0,0.5) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .ticket-time {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .ticket-list.ticket-list .status-pending {
  background: rgba(217,119,6,0.08) !important;
  color: #b45309 !important;
}
html.canvas-theme-light .ticket-list.ticket-list .status-processing {
  background: rgba(99,102,241,0.08) !important;
  color: #4f46e5 !important;
}
html.canvas-theme-light .ticket-list.ticket-list .status-resolved {
  background: rgba(22,163,74,0.08) !important;
  color: #16a34a !important;
}
html.canvas-theme-light .ticket-list.ticket-list .status-closed {
  background: rgba(0,0,0,0.04) !important;
  color: rgba(0,0,0,0.4) !important;
}
</style>
