<script setup>
/**
 * SaveWorkflowDialog.vue - 保存工作流对话框
 * 
 * 🔧 优化：点击保存后立即关闭对话框，后台异步处理保存请求
 * 通过 emit('saving') 和 emit('saved')/emit('error') 通知父组件显示状态
 */
import { ref, computed, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { saveWorkflow, getStorageQuota } from '@/api/canvas/workflow'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'saved', 'saving', 'error'])

const canvasStore = useCanvasStore()

// 表单数据
const workflowName = ref('')
const workflowDescription = ref('')
const isSaving = ref(false)
const saveError = ref('')

// 用户配额信息
const quota = ref(null)
const loadingQuota = ref(false)

// 当前工作流ID（如果是更新）
const currentWorkflowId = ref(null)

// 是否是更新现有工作流
const isUpdate = computed(() => !!currentWorkflowId.value)

// 按钮文字
const saveButtonText = computed(() => {
  if (isSaving.value) return t('canvas.saving')
  return isUpdate.value ? t('canvas.updateWorkflow') : t('canvas.saveWorkflow')
})

// 监听对话框打开
watch(() => props.visible, async (visible) => {
  if (visible) {
    // 🔧 重置状态
    isSaving.value = false
    saveError.value = ''

    // 加载配额信息
    await loadQuota()

    // 如果有当前工作流ID，加载名称和描述
    const workflowMeta = canvasStore.workflowMeta
    if (workflowMeta) {
      currentWorkflowId.value = workflowMeta.id
      workflowName.value = workflowMeta.name || ''
      workflowDescription.value = workflowMeta.description || ''
    } else {
      currentWorkflowId.value = null
      workflowName.value = ''
      workflowDescription.value = ''
    }
  }
})

// 加载配额信息
async function loadQuota() {
  loadingQuota.value = true
  try {
    const result = await getStorageQuota()
    quota.value = result.quota
  } catch (error) {
    console.error('[SaveDialog] 加载配额失败:', error)
  } finally {
    loadingQuota.value = false
  }
}

// 格式化存储大小
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// 计算工作流数据大小（用于预检）
function calculateDataSize() {
  const workflowData = canvasStore.exportWorkflow()
  const nodesJson = JSON.stringify(workflowData.nodes || [])
  const edgesJson = JSON.stringify(workflowData.edges || [])
  // 🔧 使用 Blob 计算字节大小（浏览器兼容）
  return new Blob([nodesJson, edgesJson]).size
}

// 格式化数据大小为易读格式
function formatDataSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// 保存到本地备份（用于恢复）
function saveLocalBackup(workflowData, name) {
  try {
    const backupKey = `workflow_backup_${Date.now()}`
    const backup = {
      name: name,
      data: workflowData,
      savedAt: Date.now()
    }
    localStorage.setItem(backupKey, JSON.stringify(backup))
    
    // 清理旧的备份（只保留最近3个）
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('workflow_backup_'))
    if (allKeys.length > 3) {
      allKeys.sort().slice(0, allKeys.length - 3).forEach(k => localStorage.removeItem(k))
    }
    
    console.log('[SaveDialog] 已创建本地备份:', backupKey)
    return backupKey
  } catch (e) {
    console.warn('[SaveDialog] 本地备份失败:', e.message)
    return null
  }
}

// 保存工作流 - 🔧 优化：立即关闭对话框，后台异步处理
async function handleSave() {
  // 🔧 防止重复提交
  if (isSaving.value) {
    return
  }

  // 验证
  if (!workflowName.value.trim()) {
    saveError.value = t('canvas.workflowNamePlaceholder')
    return
  }

  if (canvasStore.nodes.length === 0) {
    saveError.value = t('canvas.emptyCanvas')
    return
  }

  // 🔧 预检：检查数据大小（同步检查，快速失败）
  const dataSize = calculateDataSize()
  const MAX_SIZE = 50 * 1024 * 1024 // 50MB
  if (dataSize > MAX_SIZE) {
    saveError.value = `工作流数据过大 (${formatDataSize(dataSize)})，超过 50MB 限制。请删除一些节点或清理节点中的大图片。`
    return
  }

  // 🔧 设置保存状态，禁用按钮
  isSaving.value = true
  saveError.value = ''

  // 导出工作流数据（在关闭对话框前导出，确保数据完整）
  const workflowData = canvasStore.exportWorkflow()
  const nameToSave = workflowName.value.trim()
  const descToSave = workflowDescription.value.trim()
  const idToSave = currentWorkflowId.value

  // 🔧 保存前先创建本地备份（防止保存失败导致数据丢失）
  const backupKey = saveLocalBackup(workflowData, nameToSave)

  // 添加名称和描述
  const dataToSave = {
    id: idToSave,
    name: nameToSave,
    description: descToSave,
    uploadToCloud: true, // 手动保存时上传到云存储
    ...workflowData
  }

  // 🔧 立即更新 store 中的工作流元信息（乐观更新）
  canvasStore.workflowMeta = {
    id: idToSave || `temp-${Date.now()}`, // 临时 ID
    name: nameToSave,
    description: descToSave
  }

  // 🔧 立即关闭对话框，提升用户体验
  emit('close')

  // 🔧 通知父组件：开始保存中
  emit('saving', { name: nameToSave })

  // 🔧 异步处理保存请求
  try {
    const result = await saveWorkflow(dataToSave)

    // 后端返回格式: { id, success } 或 { workflow: { id, name, ... } }
    const savedWorkflow = result.workflow || {
      id: result.id || dataToSave.id,
      name: dataToSave.name,
      description: dataToSave.description
    }

    // 更新store中的工作流元信息（使用真实 ID）
    canvasStore.workflowMeta = {
      id: savedWorkflow.id,
      name: savedWorkflow.name,
      description: savedWorkflow.description
    }
    
    // 🔧 保存成功，清除本地备份
    if (backupKey) {
      try {
        localStorage.removeItem(backupKey)
      } catch (e) {
        // 忽略清除备份失败的错误
      }
    }

    // 通知父组件：保存成功
    emit('saved', savedWorkflow)

  } catch (error) {
    console.error('[SaveDialog] 保存失败:', error)

    // 🔧 通知父组件：保存失败
    let errorMessage = error.message || '保存失败，请稍后重试'
    if (error.message.includes('过大') || error.message.includes('too large') || error.message.includes('413')) {
      errorMessage = '工作流数据过大，请减少节点或清理大图片后重试'
    } else if (error.message.includes('database') || error.message.includes('数据库')) {
      errorMessage = '数据库错误，请稍后重试'
    }

    emit('error', {
      message: errorMessage,
      name: nameToSave,
      backupKey: backupKey // 传递备份 key，便于恢复
    })
  } finally {
    // 🔧 重置保存状态
    isSaving.value = false
  }
}

// 关闭对话框
function handleClose() {
  if (!isSaving.value) {
    emit('close')
  }
}
</script>

<template>
  <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
    <div class="dialog-container">
      <!-- 标题 -->
      <div class="dialog-header">
        <h2 class="dialog-title">
          {{ isUpdate ? t('canvas.updateWorkflow') : t('canvas.saveWorkflow') }}
        </h2>
        <button class="dialog-close" @click="handleClose">✕</button>
      </div>
      
      <!-- 内容 -->
      <div class="dialog-content">
        <!-- 配额信息 -->
        <div v-if="quota" class="quota-info">
          <div class="quota-stats">
            <div class="quota-item">
              <span class="quota-label">{{ t('canvas.storageSpace') }}</span>
              <span class="quota-value">
                {{ formatSize(quota.used_storage) }} / {{ formatSize(quota.total_quota) }}
                <span class="quota-percentage">({{ quota.used_percentage }}%)</span>
              </span>
            </div>
            <div class="quota-item">
              <span class="quota-label">{{ t('canvas.workflowCount') }}</span>
              <span class="quota-value">
                {{ quota.current_workflows }} / {{ quota.max_workflows }}
              </span>
            </div>
          </div>
          
          <!-- VIP提示 -->
          <div v-if="!quota.is_vip" class="vip-tip">
            <span class="vip-icon">💎</span>
            {{ t('canvas.vipTip') }}
          </div>
        </div>
        
        <!-- 表单 -->
        <form @submit.prevent="handleSave">
          <div class="form-group">
            <label class="form-label">{{ t('canvas.workflowNameRequired') }}</label>
            <input
              v-model="workflowName"
              type="text"
              class="form-input"
              :placeholder="t('canvas.workflowNamePlaceholder')"
              maxlength="100"
              :disabled="isSaving"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">{{ t('canvas.workflowDescOptional') }}</label>
            <textarea
              v-model="workflowDescription"
              class="form-textarea"
              :placeholder="t('canvas.workflowDescPlaceholder')"
              rows="3"
              maxlength="500"
              :disabled="isSaving"
            ></textarea>
          </div>
          
          <!-- 错误提示 -->
          <div v-if="saveError" class="error-message">
            {{ saveError }}
          </div>
          
          <!-- 工作流信息 -->
          <div class="workflow-info">
            <div class="info-item">
              <span class="info-label">{{ t('canvas.nodeCount') }}</span>
              <span class="info-value">{{ canvasStore.nodes.length }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('canvas.edgeCount') }}</span>
              <span class="info-value">{{ canvasStore.edges.length }}</span>
            </div>
          </div>
        </form>
      </div>
      
      <!-- 底部按钮 -->
      <div class="dialog-footer">
        <button
          type="button"
          class="btn btn-secondary"
          @click="handleClose"
          :disabled="isSaving"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          @click="handleSave"
          :disabled="isSaving || !workflowName.trim()"
        >
          {{ saveButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dialog-container {
  width: 90%;
  max-width: 500px;
  background: #1a1a1a;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.dialog-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.dialog-content {
  padding: 24px;
  max-height: 60vh;
  overflow-y: auto;
}

/* 配额信息 */
.quota-info {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.quota-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}

.quota-item {
  flex: 1;
}

.quota-label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.quota-value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.quota-percentage {
  color: rgba(255, 255, 255, 0.6);
  font-weight: normal;
}

.vip-tip {
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(251, 146, 60, 0.1));
  border-radius: 8px;
  border: 1px solid rgba(251, 191, 36, 0.2);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 8px;
}

.vip-icon {
  font-size: 16px;
}

/* 表单 */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  transition: all 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(59, 130, 246, 0.5);
}

.form-input:disabled,
.form-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

/* 错误信息 */
.error-message {
  padding: 12px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 13px;
  margin-bottom: 16px;
}

/* 工作流信息 */
.workflow-info {
  display: flex;
  gap: 20px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-top: 16px;
}

.info-item {
  flex: 1;
  text-align: center;
}

.info-label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.info-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: #3b82f6;
}

/* 底部 */
.dialog-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}
</style>

