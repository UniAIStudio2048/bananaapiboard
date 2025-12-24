<script setup>
/**
 * WorkflowList.vue - 工作流列表页面
 * 无导航栏的全屏页面，黑白灰色系风格
 */
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { getWorkflowList, deleteWorkflow, getStorageQuota } from '@/api/canvas/workflow'
import { useCanvasStore } from '@/stores/canvas'

const router = useRouter()
const canvasStore = useCanvasStore()

// 数据状态
const workflows = ref([])
const loading = ref(true)
const quota = ref(null)
const pagination = ref({
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 0
})

// 删除确认
const deleteConfirm = ref({
  visible: false,
  workflow: null
})

// 返回画布
function goBack() {
  router.push('/canvas')
}

// 加载工作流列表
async function loadWorkflows() {
  loading.value = true
  try {
    const result = await getWorkflowList({
      page: pagination.value.page,
      pageSize: pagination.value.pageSize
    })
    
    workflows.value = result.list || []
    pagination.value = { ...pagination.value, ...result.pagination }
  } catch (error) {
    console.error('[WorkflowList] 加载失败:', error)
    alert('加载工作流列表失败：' + error.message)
  } finally {
    loading.value = false
  }
}

// 加载配额信息
async function loadQuota() {
  try {
    const result = await getStorageQuota()
    quota.value = result.quota
  } catch (error) {
    console.error('[WorkflowList] 加载配额失败:', error)
  }
}

// 打开工作流
function openWorkflow(workflow) {
  canvasStore.workflowMeta = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description
  }
  router.push(`/canvas?load=${workflow.id}`)
}

// 新建工作流
function createNewWorkflow() {
  canvasStore.workflowMeta = null
  router.push('/canvas')
}

// 确认删除
function confirmDelete(workflow) {
  deleteConfirm.value = {
    visible: true,
    workflow
  }
}

// 取消删除
function cancelDelete() {
  deleteConfirm.value = {
    visible: false,
    workflow: null
  }
}

// 删除工作流
async function handleDelete() {
  if (!deleteConfirm.value.workflow) return
  
  try {
    await deleteWorkflow(deleteConfirm.value.workflow.id)
    await loadWorkflows()
    await loadQuota()
    cancelDelete()
  } catch (error) {
    console.error('[WorkflowList] 删除失败:', error)
    alert('删除失败：' + error.message)
  }
}

// 格式化时间
function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  
  return d.toLocaleDateString('zh-CN')
}

// 格式化存储大小
function formatSize(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// 页面切换
function changePage(page) {
  pagination.value.page = page
  loadWorkflows()
}

// 初始化
onMounted(() => {
  loadWorkflows()
  loadQuota()
})

// 添加路由守卫，每次进入页面时刷新列表
// 这样可以确保从其他页面保存工作流后跳转过来时能立即看到最新数据
onActivated(() => {
  // keep-alive组件被激活时重新加载数据
  console.log('[WorkflowList] 页面被激活，刷新工作流列表')
  loadWorkflows()
  loadQuota()
})
</script>

<template>
  <div class="workflow-page">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <button class="back-btn" @click="goBack" title="返回画布">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      
      <h1 class="page-title">我的工作流</h1>
      
      <button class="new-btn" @click="createNewWorkflow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>新建</span>
      </button>
    </div>
    
    <!-- 配额信息 -->
    <div v-if="quota" class="quota-section">
      <div class="quota-row">
        <div class="quota-info">
          <span class="quota-label">存储空间</span>
          <span class="quota-value">{{ formatSize(quota.used_storage) }} / {{ formatSize(quota.total_quota) }}</span>
        </div>
        <div class="quota-bar">
          <div 
            class="quota-fill"
            :style="{ width: `${Math.min(quota.used_percentage, 100)}%` }"
          ></div>
        </div>
      </div>
      
      <div class="quota-stats">
        <div class="stat-box">
          <span class="stat-num">{{ quota.current_workflows }}</span>
          <span class="stat-max">/ {{ quota.max_workflows }}</span>
          <span class="stat-text">工作流</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">{{ formatSize(quota.max_workflow_size) }}</span>
          <span class="stat-text">单个限制</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">{{ quota.total_generations }}</span>
          <span class="stat-text">生成次数</span>
        </div>
        <div v-if="quota.is_vip" class="stat-box vip-box">
          <span class="vip-tag">PRO</span>
        </div>
      </div>
    </div>
    
    <!-- 工作流列表 -->
    <div class="workflow-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="workflows.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </div>
        <h3>还没有工作流</h3>
        <p>创建您的第一个创作工作流</p>
        <button class="create-btn" @click="createNewWorkflow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          创建工作流
        </button>
      </div>
      
      <!-- 工作流网格 -->
      <div v-else class="workflow-grid">
        <div
          v-for="workflow in workflows"
          :key="workflow.id"
          class="workflow-card"
          @click="openWorkflow(workflow)"
        >
          <!-- 缩略图 -->
          <div class="card-thumb">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="6" height="6" rx="1"/>
              <rect x="15" y="3" width="6" height="6" rx="1"/>
              <rect x="9" y="15" width="6" height="6" rx="1"/>
              <path d="M6 9v3h3M18 9v3h-3M12 15v-3"/>
            </svg>
          </div>
          
          <!-- 信息 -->
          <div class="card-body">
            <h3 class="card-title">{{ workflow.name }}</h3>
            <p v-if="workflow.description" class="card-desc">{{ workflow.description }}</p>
            
            <div class="card-meta">
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                  <path d="M21 3v4h-4M3 21v-4h4"/>
                </svg>
                {{ workflow.node_count }} 节点
              </span>
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {{ formatSize(workflow.storage_size) }}
              </span>
            </div>
            
            <div class="card-footer">
              <span class="card-time">{{ formatDate(workflow.updated_at) }}</span>
              <button
                class="delete-btn"
                @click.stop="confirmDelete(workflow)"
                title="删除"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 分页 -->
      <div v-if="pagination.totalPages > 1" class="pagination">
        <button
          class="page-btn"
          :disabled="pagination.page === 1"
          @click="changePage(pagination.page - 1)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        
        <span class="page-text">{{ pagination.page }} / {{ pagination.totalPages }}</span>
        
        <button
          class="page-btn"
          :disabled="pagination.page === pagination.totalPages"
          @click="changePage(pagination.page + 1)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- 删除确认对话框 -->
    <Transition name="fade">
      <div v-if="deleteConfirm.visible" class="modal-overlay" @click.self="cancelDelete">
        <div class="modal-box">
          <div class="modal-header">
            <h2>确认删除</h2>
            <button class="modal-close" @click="cancelDelete">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          
          <div class="modal-body">
            <p>确定要删除工作流 "<strong>{{ deleteConfirm.workflow?.name }}</strong>" 吗？</p>
            <p class="warning">此操作无法撤销</p>
          </div>
          
          <div class="modal-footer">
            <button class="btn-cancel" @click="cancelDelete">取消</button>
            <button class="btn-delete" @click="handleDelete">删除</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 全屏页面，无导航栏 */
.workflow-page {
  min-height: 100vh;
  background: #0a0a0a;
  color: #ffffff;
  display: flex;
  flex-direction: column;
}

/* 顶部工具栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(18, 18, 18, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.new-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #fff;
  border: none;
  border-radius: 8px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.new-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* 配额信息 */
.quota-section {
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.quota-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.quota-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.quota-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.quota-value {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.quota-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 3px;
  transition: width 0.3s;
}

.quota-stats {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.stat-box {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-num {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.stat-max {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.stat-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 4px;
}

.vip-box {
  margin-left: auto;
}

.vip-tag {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
}

/* 工作流内容区 */
.workflow-content {
  flex: 1;
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: rgba(255, 255, 255, 0.5);
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
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
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  color: rgba(255, 255, 255, 0.2);
  margin-bottom: 24px;
}

.empty-state h3 {
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 8px;
}

.empty-state p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 24px;
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #fff;
  border: none;
  border-radius: 8px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.create-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* 工作流网格 */
.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

/* 工作流卡片 */
.workflow-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.workflow-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.card-thumb {
  height: 120px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
}

.card-body {
  padding: 16px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  min-height: 36px;
}

.card-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.meta-item svg {
  opacity: 0.6;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.delete-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0;
}

.page-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  width: 90%;
  max-width: 400px;
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.modal-body {
  padding: 20px;
}

.modal-body p {
  margin: 0 0 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.5;
}

.modal-body .warning {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-cancel {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn-delete {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 6px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: #fff;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式 */
@media (max-width: 640px) {
  .top-bar {
    padding: 12px 16px;
  }
  
  .back-btn span,
  .new-btn span {
    display: none;
  }
  
  .back-btn,
  .new-btn {
    padding: 10px;
  }
  
  .quota-section {
    padding: 16px;
  }
  
  .quota-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .quota-info {
    flex-direction: row;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  
  .workflow-content {
    padding: 16px;
  }
  
  .workflow-grid {
    grid-template-columns: 1fr;
  }
}
</style>
