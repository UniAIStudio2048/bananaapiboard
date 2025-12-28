<script setup>
/**
 * SaveWorkflowDialog.vue - 保存工作流对话框
 */
import { ref, computed, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { saveWorkflow, getStorageQuota } from '@/api/canvas/workflow'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'saved'])

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

// 保存工作流
async function handleSave() {
  // 验证
  if (!workflowName.value.trim()) {
    saveError.value = t('canvas.workflowNamePlaceholder')
    return
  }

  if (canvasStore.nodes.length === 0) {
    saveError.value = t('canvas.emptyCanvas')
    return
  }

  isSaving.value = true
  saveError.value = ''

  try {
    // 导出工作流数据
    const workflowData = canvasStore.exportWorkflow()

    // 添加名称和描述
    const dataToSave = {
      id: currentWorkflowId.value,
      name: workflowName.value.trim(),
      description: workflowDescription.value.trim(),
      ...workflowData
    }

    // 调用API保存（后端会异步处理文件上传）
    const result = await saveWorkflow(dataToSave)

    // 后端返回格式: { id, success } 或 { workflow: { id, name, ... } }
    const savedWorkflow = result.workflow || {
      id: result.id || dataToSave.id,
      name: dataToSave.name,
      description: dataToSave.description
    }

    // 更新store中的工作流元信息
    canvasStore.workflowMeta = {
      id: savedWorkflow.id,
      name: savedWorkflow.name,
      description: savedWorkflow.description
    }

    // 通知父组件
    emit('saved', savedWorkflow)

    // 关闭对话框
    emit('close')

  } catch (error) {
    console.error('[SaveDialog] 保存失败:', error)
    saveError.value = error.message || '保存失败'
  } finally {
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

