<template>
  <div class="ticket-detail">
    <!-- 头部 -->
    <div class="detail-header">
      <button class="back-btn" @click="$emit('back')" title="返回">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h3 class="header-title">工单详情</h3>
      <button class="close-btn" @click="$emit('close')" title="关闭">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <!-- 工单内容 -->
    <div v-else-if="ticket" class="detail-content">
      <!-- 工单信息 -->
      <div class="ticket-info">
        <div class="info-row">
          <span class="info-label">工单编号</span>
          <span class="info-value">#{{ ticket.ticket_number }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">状态</span>
          <span class="ticket-status" :class="`status-${ticket.status}`">
            {{ getStatusLabel(ticket.status) }}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">类型</span>
          <span class="info-value">{{ getTypeLabel(ticket.category) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">创建时间</span>
          <span class="info-value">{{ formatDateTime(ticket.created_at) }}</span>
        </div>
      </div>

      <!-- 工单标题和描述 -->
      <div class="ticket-content">
        <h4 class="content-title">{{ ticket.subject }}</h4>
        <p class="content-description">{{ ticket.description }}</p>

        <!-- 附件 -->
        <div v-if="ticket.attachments && ticket.attachments.length > 0" class="attachments">
          <div class="attachments-title">附件</div>
          <div class="attachment-list">
            <a
              v-for="(url, index) in ticket.attachments"
              :key="index"
              :href="url"
              target="_blank"
              class="attachment-link"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
              附件 {{ index + 1 }}
            </a>
          </div>
        </div>
      </div>

      <!-- 对话记录 -->
      <div class="replies-section">
        <div class="section-title">对话记录</div>
        <div class="replies-list">
          <div
            v-for="reply in replies"
            :key="reply.id"
            class="reply-item"
            :class="{ 'is-admin': reply.author_type === 'admin' }"
          >
            <div class="reply-header">
              <span class="reply-author">
                {{ reply.author_type === 'admin' ? '客服' : '我' }}
              </span>
              <span class="reply-time">{{ formatDateTime(reply.created_at) }}</span>
            </div>
            <div class="reply-content">{{ reply.content }}</div>

            <!-- 回复附件 -->
            <div v-if="reply.attachments && reply.attachments.length > 0" class="reply-attachments">
              <a
                v-for="(url, index) in reply.attachments"
                :key="index"
                :href="url"
                target="_blank"
                class="attachment-link small"
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                附件{{ index + 1 }}
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div v-if="ticket.status === 'resolved' && !ticket.rating" class="action-buttons">
        <button class="btn-confirm" @click="handleConfirmResolve">
          确认解决
        </button>
        <button class="btn-rate" @click="showRatingDialog = true">
          评价
        </button>
      </div>

      <!-- 已评价显示 -->
      <div v-if="ticket.rating" class="rating-display">
        <div class="rating-stars">
          <svg
            v-for="i in 5"
            :key="i"
            class="star"
            :class="{ filled: i <= ticket.rating }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>
        <p v-if="ticket.rating_comment" class="rating-comment">{{ ticket.rating_comment }}</p>
      </div>
    </div>

    <!-- 回复输入框 -->
    <TicketReplyBox
      v-if="ticket && ticket.status !== 'closed'"
      :ticket-id="ticket.id"
      @submit="handleReply"
    />

    <!-- 评价对话框 -->
    <Transition name="fade">
      <div v-if="showRatingDialog" class="dialog-overlay" @click="showRatingDialog = false">
        <div class="dialog-content" @click.stop>
          <h3 class="dialog-title">评价工单</h3>

          <div class="rating-input">
            <div class="rating-stars-input">
              <svg
                v-for="i in 5"
                :key="i"
                class="star clickable"
                :class="{ filled: i <= ratingForm.rating }"
                viewBox="0 0 24 24"
                fill="currentColor"
                @click="ratingForm.rating = i"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <textarea
              v-model="ratingForm.comment"
              class="rating-textarea"
              placeholder="请输入您的评价（可选）"
              rows="4"
            ></textarea>
          </div>

          <div class="dialog-actions">
            <button class="btn-cancel" @click="showRatingDialog = false">取消</button>
            <button class="btn-submit" @click="handleRate" :disabled="ratingForm.rating === 0">
              提交评价
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { getTicketDetail, replyTicket, confirmResolve, rateTicket, markAsRead } from '@/api/ticket'
import TicketReplyBox from './TicketReplyBox.vue'

const props = defineProps({
  ticketId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['back', 'updated', 'close'])

const ticket = ref(null)
const replies = ref([])
const loading = ref(false)
const showRatingDialog = ref(false)
const ratingForm = ref({
  rating: 0,
  comment: ''
})

// 加载工单详情
async function loadDetail() {
  loading.value = true
  try {
    const data = await getTicketDetail(props.ticketId)
    ticket.value = data.ticket
    replies.value = data.replies || []

    // 标记为已读
    await markAsRead(props.ticketId)
  } catch (e) {
    console.error('加载工单详情失败:', e)
  } finally {
    loading.value = false
  }
}

// 处理回复
async function handleReply(data) {
  try {
    await replyTicket(props.ticketId, data)
    await loadDetail()
    emit('updated')
  } catch (e) {
    console.error('回复失败:', e)
    alert(e.message || '回复失败，请重试')
  }
}

// 确认解决
async function handleConfirmResolve() {
  try {
    await confirmResolve(props.ticketId)
    await loadDetail()
    emit('updated')
  } catch (e) {
    console.error('确认解决失败:', e)
    alert(e.message || '操作失败，请重试')
  }
}

// 提交评价
async function handleRate() {
  if (ratingForm.value.rating === 0) return

  try {
    await rateTicket(props.ticketId, ratingForm.value)
    showRatingDialog.value = false
    await loadDetail()
    emit('updated')
  } catch (e) {
    console.error('评价失败:', e)
    alert(e.message || '评价失败，请重试')
  }
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

// 格式化日期时间
function formatDateTime(time) {
  if (!time) return ''
  const date = new Date(time)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

watch(() => props.ticketId, () => {
  if (props.ticketId) {
    loadDetail()
  }
})

onMounted(() => {
  loadDetail()
})
</script>

<style scoped>
.ticket-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid #2a2a2a;
}

.back-btn {
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

.back-btn:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #ffffff;
}

.header-title {
  flex: 1;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
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

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
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

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.detail-content::-webkit-scrollbar {
  width: 6px;
}

.detail-content::-webkit-scrollbar-track {
  background: transparent;
}

.detail-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.ticket-info {
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.info-row:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.info-label {
  font-size: 13px;
  color: #888888;
}

.info-value {
  font-size: 13px;
  color: #ffffff;
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

.ticket-content {
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  margin-bottom: 16px;
}

.content-title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 12px 0;
}

.content-description {
  font-size: 14px;
  color: #cccccc;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.attachments {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.attachments-title {
  font-size: 13px;
  color: #888888;
  margin-bottom: 8px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachment-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.2s;
}

.attachment-link:hover {
  background: rgba(255, 255, 255, 0.12);
}

.attachment-link.small {
  padding: 4px 8px;
  font-size: 12px;
}

.replies-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 12px;
}

.replies-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reply-item {
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
}

.reply-item.is-admin {
  background: rgba(255, 255, 255, 0.08);
  border-color: #3a3a3a;
}

.reply-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.reply-author {
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
}

.reply-time {
  font-size: 12px;
  color: #666666;
}

.reply-content {
  font-size: 14px;
  color: #cccccc;
  line-height: 1.5;
  white-space: pre-wrap;
}

.reply-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.btn-confirm,
.btn-rate {
  flex: 1;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm {
  color: white;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
}

.btn-confirm:hover {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-rate {
  color: #ffffff;
  background: transparent;
  border: 1px solid #2a2a2a;
}

.btn-rate:hover {
  border-color: #3a3a3a;
  background: rgba(255, 255, 255, 0.04);
}

.rating-display {
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  margin-bottom: 16px;
}

.rating-stars {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.star {
  width: 20px;
  height: 20px;
  color: #3a3a3a;
}

.star.filled {
  color: rgb(251, 191, 36);
}

.star.clickable {
  cursor: pointer;
  transition: color 0.2s;
}

.star.clickable:hover {
  color: rgb(251, 191, 36);
}

.rating-comment {
  font-size: 13px;
  color: #cccccc;
  margin: 0;
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog-content {
  width: 90%;
  max-width: 400px;
  padding: 24px;
  background: linear-gradient(180deg, #1c1c1e 0%, #141416 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 20px 0;
}

.rating-input {
  margin-bottom: 20px;
}

.rating-stars-input {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.rating-stars-input .star {
  width: 32px;
  height: 32px;
}

.rating-textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  resize: vertical;
}

.rating-textarea:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.2);
}

.dialog-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel,
.btn-submit {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  color: rgba(255, 255, 255, 0.7);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.btn-cancel:hover {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.05);
}

.btn-submit {
  color: #111;
  background: linear-gradient(135deg, #fff 0%, #e8e8e8 100%);
  border: none;
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(255, 255, 255, 0.15);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style>
/* ========== TicketDetail 白昼模式 ========== */
html.canvas-theme-light .ticket-detail.ticket-detail .detail-header {
  border-bottom-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .header-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .back-btn,
html.canvas-theme-light .ticket-detail.ticket-detail .close-btn {
  border-color: rgba(0,0,0,0.1) !important;
  color: rgba(0,0,0,0.5) !important;
  background: transparent !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .back-btn:hover,
html.canvas-theme-light .ticket-detail.ticket-detail .close-btn:hover {
  background: rgba(0,0,0,0.05) !important;
  border-color: rgba(0,0,0,0.15) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .loading-state {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .spinner {
  border-color: rgba(0,0,0,0.1) !important;
  border-top-color: #6366f1 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .detail-content {
  scrollbar-color: rgba(0,0,0,0.15) transparent !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .detail-content::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.12) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .ticket-info {
  background: rgba(0,0,0,0.02) !important;
  border-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .info-row:not(:last-child) {
  border-bottom-color: rgba(0,0,0,0.06) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .info-label {
  color: rgba(0,0,0,0.5) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .info-value {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .status-pending {
  background: rgba(217,119,6,0.08) !important;
  color: #b45309 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .status-processing {
  background: rgba(99,102,241,0.08) !important;
  color: #4f46e5 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .status-resolved {
  background: rgba(22,163,74,0.08) !important;
  color: #16a34a !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .status-closed {
  background: rgba(0,0,0,0.04) !important;
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .ticket-content {
  background: rgba(0,0,0,0.02) !important;
  border-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .content-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .content-description {
  color: rgba(0,0,0,0.7) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .attachments {
  border-top-color: rgba(0,0,0,0.06) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .attachments-title {
  color: rgba(0,0,0,0.5) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .attachment-link {
  color: #1c1917 !important;
  background: rgba(0,0,0,0.04) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .attachment-link:hover {
  background: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .section-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .reply-item {
  background: rgba(0,0,0,0.02) !important;
  border-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .reply-item.is-admin {
  background: rgba(99,102,241,0.04) !important;
  border-color: rgba(99,102,241,0.12) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .reply-author {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .reply-time {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .reply-content {
  color: rgba(0,0,0,0.7) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .btn-rate {
  color: rgba(0,0,0,0.7) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .btn-rate:hover {
  border-color: rgba(0,0,0,0.15) !important;
  background: rgba(0,0,0,0.04) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .rating-display {
  background: rgba(0,0,0,0.02) !important;
  border-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .star {
  color: rgba(0,0,0,0.15) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .star.filled {
  color: rgb(251,191,36) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .rating-comment {
  color: rgba(0,0,0,0.7) !important;
}
/* 评价对话框 */
html.canvas-theme-light .ticket-detail.ticket-detail .dialog-overlay {
  background: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .dialog-content {
  background: linear-gradient(180deg, #fff 0%, #fafafa 100%) !important;
  border-color: rgba(0,0,0,0.1) !important;
  box-shadow: 0 24px 48px rgba(0,0,0,0.15) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .dialog-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .rating-textarea {
  color: #1c1917 !important;
  background: rgba(0,0,0,0.03) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .rating-textarea:focus {
  border-color: rgba(99,102,241,0.4) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .btn-cancel {
  color: rgba(0,0,0,0.65) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .btn-cancel:hover {
  border-color: rgba(0,0,0,0.15) !important;
  background: rgba(0,0,0,0.04) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .btn-submit {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}
html.canvas-theme-light .ticket-detail.ticket-detail .btn-submit:hover:not(:disabled) {
  box-shadow: 0 8px 20px rgba(99,102,241,0.25) !important;
}
</style>
