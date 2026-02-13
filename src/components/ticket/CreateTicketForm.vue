<template>
  <div class="create-form">
    <!-- 头部 -->
    <div class="form-header">
      <button class="back-btn" @click="$emit('back')" title="返回">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h3 class="header-title">创建工单</h3>
      <button class="close-btn" @click="$emit('close')" title="关闭">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- 表单内容 -->
    <div class="form-content">
      <form @submit.prevent="handleSubmit">
        <!-- 工单类型 -->
        <div class="form-group">
          <label class="form-label">工单类型 <span class="required">*</span></label>
          <select v-model="form.type" class="form-select" required>
            <option value="">请选择</option>
            <option value="bug">问题反馈</option>
            <option value="feature">功能建议</option>
            <option value="invoice">开票申请</option>
            <option value="other">其他</option>
          </select>
        </div>

        <!-- 标题 -->
        <div class="form-group">
          <label class="form-label">标题 <span class="required">*</span></label>
          <input
            v-model="form.title"
            type="text"
            class="form-input"
            placeholder="请简要描述问题"
            required
            maxlength="100"
          />
        </div>

        <!-- 优先级 -->
        <div class="form-group">
          <label class="form-label">优先级</label>
          <select v-model="form.priority" class="form-select">
            <option value="low">低</option>
            <option value="normal">中</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
        </div>

        <!-- 详细描述 -->
        <div class="form-group">
          <label class="form-label">详细描述 <span class="required">*</span></label>
          <textarea
            v-model="form.description"
            class="form-textarea"
            placeholder="请详细描述您的问题或建议"
            required
            rows="6"
          ></textarea>
        </div>

        <!-- 附件上传 -->
        <div class="form-group">
          <label class="form-label">附件</label>
          <div
            class="upload-area"
            :class="{ dragging: isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
            @click="triggerFileInput"
          >
            <input
              ref="fileInput"
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              style="display: none"
              @change="handleFileSelect"
            />
            <svg class="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <p class="upload-text">点击或拖拽文件到此处上传</p>
            <p class="upload-hint">支持图片、PDF、Word文档</p>
          </div>

          <!-- 附件列表 -->
          <div v-if="attachments.length > 0" class="attachment-list">
            <div v-for="(file, index) in attachments" :key="index" class="attachment-item">
              <span class="attachment-name">{{ file.name }}</span>
              <button type="button" class="remove-btn" @click="removeAttachment(index)">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 提交按钮 -->
        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="$emit('back')">
            取消
          </button>
          <button type="submit" class="btn-submit" :disabled="submitting">
            <span v-if="submitting" class="spinner-small"></span>
            {{ submitting ? '提交中...' : '提交工单' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { createTicket, uploadAttachment } from '@/api/ticket'

const emit = defineEmits(['back', 'success', 'close'])

const form = ref({
  type: '',
  title: '',
  priority: 'normal',
  description: ''
})

const attachments = ref([])
const isDragging = ref(false)
const submitting = ref(false)
const fileInput = ref(null)

// 触发文件选择
function triggerFileInput() {
  fileInput.value?.click()
}

// 处理文件选择
function handleFileSelect(event) {
  const files = Array.from(event.target.files)
  addFiles(files)
}

// 处理拖拽上传
function handleDrop(event) {
  isDragging.value = false
  const files = Array.from(event.dataTransfer.files)
  addFiles(files)
}

// 添加文件
function addFiles(files) {
  for (const file of files) {
    // 检查文件大小（限制10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert(`文件 ${file.name} 超过10MB限制`)
      continue
    }
    attachments.value.push(file)
  }
}

// 移除附件
function removeAttachment(index) {
  attachments.value.splice(index, 1)
}

// 提交表单
async function handleSubmit() {
  if (submitting.value) return

  submitting.value = true
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

    // 创建工单（前端字段映射到后端字段）
    await createTicket({
      subject: form.value.title,
      category: form.value.type,
      priority: form.value.priority,
      description: form.value.description,
      attachments: attachmentUrls
    })

    // 重置表单
    form.value = {
      type: '',
      title: '',
      priority: 'normal',
      description: ''
    }
    attachments.value = []

    emit('success')
  } catch (e) {
    console.error('创建工单失败:', e)
    alert(e.message || '创建工单失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.create-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.form-header {
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

.form-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.form-content::-webkit-scrollbar {
  width: 6px;
}

.form-content::-webkit-scrollbar-track {
  background: transparent;
}

.form-content::-webkit-scrollbar-thumb {
  background: ra(255, 255, 255, 0.2);
  border-radius: 3px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 8px;
}

.required {
  color: rgb(239, 68, 68);
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  transition: all 0.2s;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.4);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.form-textarea {
  resize: vertical;
  min-height: 120px;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  border: 2px dashed #2a2a2a;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: all 0.2s;
}

.upload-area:hover,
.upload-area.dragging {
  border-color: #3a3a3a;
  background: rgba(255, 255, 255, 0.08);
}

.upload-area svg {
  color: #666666;
}

.upload-text {
  font-size: 14px;
  color: #ffffff;
  margin: 0;
}

.upload-hint {
  font-size: 12px;
  color: #666666;
  margin: 4px 0 0 0;
}

.attachment-list {
  margin-top: 12px;
}

.attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a2a2a;
  border-radius: 8px;
}

.attachment-name {
  font-size: 13px;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #888888;
  cursor: pointer;
  transition: color 0.2s;
}

.remove-btn:hover {
  color: rgb(239, 68, 68);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
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
  color: #ffffff;
}

.btn-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
</style>

<style>
/* ========== CreateTicketForm 白昼模式 ========== */
html.canvas-theme-light .create-form.create-form .form-header {
  border-bottom-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .create-form.create-form .header-title {
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .back-btn,
html.canvas-theme-light .create-form.create-form .close-btn {
  border-color: rgba(0,0,0,0.1) !important;
  color: rgba(0,0,0,0.5) !important;
  background: transparent !important;
}
html.canvas-theme-light .create-form.create-form .back-btn:hover,
html.canvas-theme-light .create-form.create-form .close-btn:hover {
  background: rgba(0,0,0,0.05) !important;
  border-color: rgba(0,0,0,0.15) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .form-content {
  scrollbar-color: rgba(0,0,0,0.15) transparent !important;
}
html.canvas-theme-light .create-form.create-form .form-content::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.12) !important;
}
html.canvas-theme-light .create-form.create-form .form-label {
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .form-input,
html.canvas-theme-light .create-form.create-form .form-select,
html.canvas-theme-light .create-form.create-form .form-textarea {
  color: #1c1917 !important;
  background: rgba(0,0,0,0.03) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .create-form.create-form .form-input:focus,
html.canvas-theme-light .create-form.create-form .form-select:focus,
html.canvas-theme-light .create-form.create-form .form-textarea:focus {
  border-color: rgba(99,102,241,0.4) !important;
  background: #fff !important;
}
html.canvas-theme-light .create-form.create-form .form-input::placeholder,
html.canvas-theme-light .create-form.create-form .form-textarea::placeholder {
  color: rgba(0,0,0,0.35) !important;
}
html.canvas-theme-light .create-form.create-form .form-select option {
  background: #fff !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .upload-area {
  border-color: rgba(0,0,0,0.15) !important;
  background: rgba(0,0,0,0.02) !important;
}
html.canvas-theme-light .create-form.create-form .upload-area:hover,
html.canvas-theme-light .create-form.create-form .upload-area.dragging {
  border-color: rgba(99,102,241,0.4) !important;
  background: rgba(99,102,241,0.04) !important;
}
html.canvas-theme-light .create-form.create-form .upload-area svg {
  color: rgba(0,0,0,0.3) !important;
}
html.canvas-theme-light .create-form.create-form .upload-text {
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .upload-hint {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .create-form.create-form .attachment-item {
  background: rgba(0,0,0,0.02) !important;
  border-color: rgba(0,0,0,0.08) !important;
}
html.canvas-theme-light .create-form.create-form .attachment-name {
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .remove-btn {
  color: rgba(0,0,0,0.4) !important;
}
html.canvas-theme-light .create-form.create-form .remove-btn:hover {
  color: #dc2626 !important;
}
html.canvas-theme-light .create-form.create-form .btn-cancel {
  color: rgba(0,0,0,0.65) !important;
  border-color: rgba(0,0,0,0.1) !important;
}
html.canvas-theme-light .create-form.create-form .btn-cancel:hover {
  border-color: rgba(0,0,0,0.15) !important;
  background: rgba(0,0,0,0.04) !important;
  color: #1c1917 !important;
}
html.canvas-theme-light .create-form.create-form .btn-submit {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}
html.canvas-theme-light .create-form.create-form .btn-submit:hover:not(:disabled) {
  box-shadow: 0 8px 20px rgba(99,102,241,0.25) !important;
}
html.canvas-theme-light .create-form.create-form .spinner-small {
  border-color: rgba(255,255,255,0.3) !important;
  border-top-color: transparent !important;
}
</style>
