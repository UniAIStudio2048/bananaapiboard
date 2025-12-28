<template>
  <Teleport to="body">
    <div v-if="isOpen" class="preset-manager-overlay" @click="close">
      <div class="preset-manager-drawer" @click.stop>
        <!-- 头部 -->
        <div class="drawer-header">
          <div class="header-info">
            <h2 class="drawer-title">我的自定义预设</h2>
            <span class="preset-count">{{ presets.length }}/30</span>
          </div>
          <button class="close-btn" @click="close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- 新建按钮 -->
        <div class="drawer-actions">
          <button class="btn-new" @click="handleCreate" :disabled="presets.length >= 30">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            新建预设
          </button>
          <span v-if="presets.length >= 30" class="limit-hint">已达到最大数量限制</span>
        </div>

        <!-- 加载中 -->
        <div v-if="isLoading" class="drawer-loading">
          <svg class="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p>加载中...</p>
        </div>

        <!-- 预设列表 -->
        <div v-else-if="presets.length > 0" class="drawer-body">
          <div v-for="preset in presets" :key="preset.id" class="preset-card">
            <div class="preset-header">
              <div class="preset-info">
                <h3 class="preset-name">{{ preset.name }}</h3>
                <div class="preset-meta">
                  <span class="meta-item">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    使用 {{ preset.useCount }} 次
                  </span>
                  <span class="meta-item">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ formatDate(preset.createdAt) }}
                  </span>
                </div>
              </div>
              <div class="preset-actions">
                <button class="action-btn action-select" @click="handleSelect(preset)" title="选择使用">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button class="action-btn" @click="handleEdit(preset)" title="编辑">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button class="action-btn action-delete" @click="handleDelete(preset)" title="删除">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="preset-content">
              <p class="preset-prompt">{{ truncateText(preset.systemPrompt, 120) }}</p>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="drawer-empty">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="empty-text">还没有自定义预设</p>
          <p class="empty-hint">点击上方"新建预设"按钮创建您的第一个预设</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { getUserLLMPresets, deleteUserLLMPreset } from '@/api/canvas/llm'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['close', 'create', 'edit', 'refresh', 'select'])

const presets = ref([])
const isLoading = ref(false)

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return '今天'
  } else if (days === 1) {
    return '昨天'
  } else if (days < 7) {
    return `${days}天前`
  } else {
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  }
}

// 截断文本
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength) + '...'
}

// 加载预设列表
async function loadPresets() {
  isLoading.value = true
  try {
    const data = await getUserLLMPresets()
    presets.value = data.presets || []
  } catch (error) {
    console.error('[PresetManager] 加载预设失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 关闭抽屉
function close() {
  emit('close')
}

// 新建预设
function handleCreate() {
  emit('create')
}

// 选择预设
function handleSelect(preset) {
  emit('select', preset)
  emit('close')
}

// 编辑预设
function handleEdit(preset) {
  emit('edit', preset)
}

// 删除预设
async function handleDelete(preset) {
  if (!confirm(`确定要删除预设"${preset.name}"吗？`)) {
    return
  }

  try {
    await deleteUserLLMPreset(preset.id)
    console.log('[PresetManager] 预设已删除:', preset.name)
    await loadPresets()
    emit('refresh')
  } catch (error) {
    console.error('[PresetManager] 删除预设失败:', error)
    alert(error.message || '删除失败，请重试')
  }
}

// 监听打开状态
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    loadPresets()
  }
})

// 组件挂载时加载
onMounted(() => {
  if (props.isOpen) {
    loadPresets()
  }
})

// 暴露刷新方法给父组件
defineExpose({
  loadPresets
})
</script>

<style scoped>
.preset-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 9999;
  animation: fadeIn 0.15s ease;
}

.preset-manager-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 90%;
  max-width: 480px;
  background: var(--canvas-bg-primary, #1e1e1e);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  animation: slideInRight 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.drawer-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--canvas-text-primary, #ffffff);
  margin: 0;
}

.preset-count {
  padding: 4px 10px;
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  font-size: 13px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-weight: 500;
}

.close-btn {
  padding: 6px;
  border: none;
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
  color: var(--canvas-text-primary, #ffffff);
}

.drawer-actions {
  padding: 16px 24px;
  border-bottom: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-new {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--primary-color, #8b5cf6);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-new:hover:not(:disabled) {
  background: var(--primary-color-hover, #7c3aed);
}

.btn-new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.limit-hint {
  font-size: 12px;
  color: #f59e0b;
}

.drawer-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
}

.drawer-body {
  flex: 1;
  padding: 16px 24px;
  overflow-y: auto;
}

.preset-card {
  background: var(--canvas-bg-secondary, #2a2a2a);
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.15s ease;
}

.preset-card:hover {
  border-color: var(--primary-color, #8b5cf6);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);
}

.preset-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--canvas-text-primary, #ffffff);
  margin: 0 0 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preset-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  padding: 6px;
  border: none;
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
  color: var(--canvas-text-primary, #ffffff);
}

.action-select:hover {
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}

.action-delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.preset-content {
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
}

.preset-prompt {
  font-size: 13px;
  line-height: 1.5;
  color: var(--canvas-text-secondary, #a0a0a0);
  margin: 0;
  word-break: break-word;
}

.drawer-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  color: var(--canvas-text-secondary, #a0a0a0);
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--canvas-text-primary, #ffffff);
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 13px;
  color: var(--canvas-text-secondary, #a0a0a0);
  margin: 0;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
