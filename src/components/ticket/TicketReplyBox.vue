<template>
  <div class="reply-box">
    <textarea
      v-model="content"
      class="reply-input"
      placeholder="输入回复内容..."
      rows="3"
      @keydown.ctrl.enter="handleSubmit"
      @keydown.meta.enter="handleSubmit"
    ></textarea>

    <div class="reply-actions">
      <div class="left-actions">
        <button
          type="button"
          class="action-btn"
          @click="triggerFileInput"
          title="添加附件"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          style="display: none"
          @change="handleFileSelect"
        />
      </div>

      <button
        type="button"
        class="send-btn"
        :disabled="!canSend || sending"
        @click="handleSubmit"
      >
        <span v-if="sending" class="spinner-small"></span>
        <span v-else>发送</span>
      </button>
    </div>

    <!-- 附件预览 -->
    <div v-if="attachments.length > 0" class="attachments-preview">
      <div v-for="(file, index) in attachments" :key="index" class="attachment-chip">
        <span class="attachment-name">{{ file.name }}</span>
        <button type="button" class="remove-btn" @click="removeAttachment(index)">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { uploadAttachment } from '@/api/ticket'

const props = defineProps({
  ticketId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['submit'])

const content = ref('')
const attachments = ref([])
const sending = ref(false)
const fileInput = ref(null)

const canSend = computed(() => {
  return content.value.trim().length > 0 || attachments.value.length > 0
})

// 触发文件选择
function triggerFileInput() {
  fileInput.value?.click()
}

// 处理文件选择
function handleFileSelect(event) {
  const files = Array.from(event.target.files)
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      alert(`文件 ${file.name} 超过10MB限制`)
      continue
    }
    attachments.value.push(file)
  }
  // 清空input，允许重复选择同一文件
  event.target.value = ''
}

// 移除附件
function removeAttachment(index) {
  attachments.value.splice(index, 1)
}

// 提交回复
async function handleSubmit() {
  if (!canSend.value || sending.value) return

  sending.value = true
  try {
    // 上传附件
    const attachmentUrls = []
    for (const file of attachments.value) {
      try {
        const url = await uploadAttachment(file)
        attachmentUrls.push(url)
      } catch (e) {
        console.error('上传附件失败:', file.name, e)
      }
    }

    // 提交回复
    emit('submit', {
      content: content.value.trim(),
      attachments: attachmentUrls
    })

    // 清空输入
    content.value = ''
    attachments.value = []
  } catch (e) {
    console.error('提交回复失败:', e)
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.reply-box {
  padding: 16px 24px;
  border-top: 1px solid #2a2a2a;
  background: transparent;
}

.reply-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.2s;
}

.reply-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.4);
}

.reply-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.reply-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.left-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
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

.action-btn:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #ffffff;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #111;
  background: linear-gradient(135deg, #fff 0%, #e8e8e8 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.15);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid #2a2a2a;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.attachments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  font-size: 12px;
  color: #ffffff;
}

.attachment-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: #888888;
  cursor: pointer;
  transition: color 0.2s;
}

.remove-btn:hover {
  color: rgb(239, 68, 68);
}
</style>

<style>
/* ========== TicketReplyBox 白昼模式 ========== */
html.canvas-theme-light .reply-box.reply-box {
  border-top-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .reply-box.reply-box .reply-input {
  color: #1c1917 !important;
  background: rgba(0,0,0,0.03) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .reply-box.reply-box .reply-input:focus {
  border-color: rgba(99,102,241,0.4) !important;
  background: #fff !important;
}
html.canvas-theme-light .reply-box.reply-box .reply-input::placeholder {
  color: rgba(0,0,0,0.35) !important;
}
html.canvas-theme-light .reply-box.reply-box .action-btn {
  border-color: rgba(0,0,0,0.1) !important;
  color: rgba(0,0,0,0.5) !important;
  background: transparent !important;
}
html.canvas-theme-light .reply-box.reply-box .action-btn:hover {
  background: rgba(0,0,0,0.05) !important;
  border-color: rgba(0,0,0,0.15) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .reply-box.reply-box .send-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}
html.canvas-theme-light .reply-box.reply-box .send-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(99,102,241,0.25) !important;
}
html.canvas-theme-light .reply-box.reply-box .spinner-small {
  border-color: rgba(255,255,255,0.3) !important;
  border-top-color: transparent !important;
}
html.canvas-theme-light .reply-box.reply-box .attachment-chip {
  background: rgba(0,0,0,0.03) !important;
  border-color: rgba(0,0,0,0.08) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .reply-box.reply-box .remove-btn {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .reply-box.reply-box .remove-btn:hover {
  color: #dc2626 !important;
}
</style>
