<template>
  <button
    class="canvas-icon-btn ticket-btn"
    @click="$emit('open')"
    title="客服工单"
  >
    <!-- 工单图标：信封 -->
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>

    <!-- 未读红点 -->
    <span v-if="hasUnread" class="unread-dot"></span>
  </button>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getUnreadCount } from '@/api/ticket'

const hasUnread = ref(false)
let pollTimer = null

// 加载未读数量
async function loadUnreadCount() {
  try {
    const count = await getUnreadCount()
    hasUnread.value = count > 0
  } catch (e) {
    console.error('获取未读数量失败:', e)
  }
}

// 开始轮询
function startPolling() {
  loadUnreadCount()
  pollTimer = setInterval(loadUnreadCount, 30000)
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})

// 暴露刷新方法给父组件
defineExpose({
  refresh: loadUnreadCount
})
</script>

<style scoped>
.ticket-btn {
  position: relative;
}

.unread-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  background: rgb(239, 68, 68);
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(18, 18, 18, 0.95);
  pointer-events: none;
}
</style>

<style>
/* ========== TicketButton 白昼模式 ========== */
:root.canvas-theme-light .ticket-btn .unread-dot {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95) !important;
}
</style>
