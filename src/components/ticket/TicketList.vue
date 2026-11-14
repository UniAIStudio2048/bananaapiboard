<template>
  <div class="ticket-list">
    <!-- 头部 -->
    <div class="list-header">
      <h3 class="header-title">{{ translateUi('uiMessages.m33bc517653ac') }}</h3>
      <div class="header-actions">
        <button class="create-btn" @click="$emit('create')" :title="translateUi('uiMessages.m7f49b9561401')">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <button class="close-btn" @click="$emit('close')" :title="translateUi('common.close')">
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
        <p>{{ translateUi('common.loading') }}</p>
      </div>

      <div v-else-if="tickets.length === 0" class="empty-state">
        <svg class="w-12 h-12 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>{{ translateUi('uiMessages.m0a4d81a7d3ee') }}</p>
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
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

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
  { value: 'all', get label() { return translateUi('common.all') } },
  { value: 'pending', get label() { return translateUi('directorStudio.statusValues.idle') } },
  { value: 'processing', get label() { return translateUi('videoGen.processing') } },
  { value: 'resolved', get label() { return translateUi('uiMessages.mb7aae49b52a3') } },
  { value: 'closed', get label() { return translateUi('uiMessages.m6744b4c6a9aa') } }
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
    pending: translateUi('canvas.assetPanel.tagPending'),
    processing: translateUi('videoGen.processing'),
    resolved: translateUi('uiMessages.mb7aae49b52a3'),
    closed: translateUi('uiMessages.m6744b4c6a9aa')
  }
  return labels[status] || status
}

// 获取类型标签
function getTypeLabel(type) {
  const labels = {
    bug: translateUi('uiMessages.m55a2ce1324c1'),
    feature: translateUi('uiMessages.m118db8121c01'),
    invoice: translateUi('uiMessages.m7cc4ddd2fcde'),
    other: translateUi('uiMessages.md2909f1647e7')
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

  if (minutes < 1) return translateUi('time.justNow')
  if (minutes < 60) return translateUi('uiMessages.mab2c53a24038', { value1: (minutes) })
  if (hours < 24) return translateUi('uiMessages.maff25df598e8', { value1: (hours) })
  if (days < 7) return translateUi('uiMessages.m3b3082f1e94e', { value1: (days) })

  return date.toLocaleDateString(uiLanguage.value, { month: 'numeric', day: 'numeric' })
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
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

@media (max-width: 640px) {
  .ticket-items {
    grid-template-columns: 1fr;
  }
}

.ticket-item {
  padding: 16px;
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
