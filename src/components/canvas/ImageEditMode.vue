<script setup>
/**
 * ImageEditMode.vue - 图片编辑模式容器
 * 
 * 当用户点击图片工具栏进入编辑模式时显示
 * 功能：
 * - 全屏覆盖层，显示功能强大的图片编辑器
 * - 使用 NativeImageEditor 提供完整的编辑功能
 * - 处理保存和取消操作
 * - 编辑历史缓存：退出后再次进入可恢复操作记录
 * - 保存后覆盖原图
 * 
 * UI 风格：黑白灰，兼容画布深色/白昼模式
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import { inpaintImageLocal } from '@/api/canvas/nodes'
import { showToast } from '@/composables/useCanvasDialog'
import NativeImageEditor from './NativeImageEditor.vue'
import {
  buildSavedSessionPayload,
  clampSessionHistory,
  isRestorableEditSession
} from './imageEditSession.js'

const canvasStore = useCanvasStore()

// 编辑器引用
const editorRef = ref(null)

// 编辑区域尺寸（动态计算）
const editorWidth = ref(800)
const editorHeight = ref(600)

// ==================== 编辑历史缓存 ====================
// 按节点ID缓存编辑状态，再次打开同一节点时恢复
const nodeEditCache = new Map()

// 获取当前节点的缓存状态
const cachedState = computed(() => {
  if (!canvasStore.editingNodeId) return null
  const node = editingNode.value
  if (isRestorableEditSession(node?.data?.editSession)) {
    return node.data.editSession
  }
  return nodeEditCache.get(canvasStore.editingNodeId) || null
})

// 缓存当前编辑状态
function cacheCurrentState() {
  if (!editorRef.value || !canvasStore.editingNodeId) return
  
  try {
    const state = editorRef.value.getEditState()
    if (state && state.history && state.history.length > 0) {
      nodeEditCache.set(canvasStore.editingNodeId, state)
      console.log('[ImageEditMode] 已缓存编辑状态，节点:', canvasStore.editingNodeId, '历史:', state.history.length, '条')
    }
  } catch (error) {
    console.warn('[ImageEditMode] 缓存编辑状态失败:', error)
  }
}

function buildImageFileName(extension = 'png') {
  return `edited_${Date.now()}.${extension}`
}

async function dataUrlToFile(dataUrl, fileName, mimeType) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const fileType = mimeType || blob.type || 'image/png'
  return new File([blob], fileName, { type: fileType })
}

function buildNodeImagePatch(node, newUrl) {
  if (node.data?.output?.urls?.length > 0) {
    return {
      output: {
        ...node.data.output,
        urls: [newUrl, ...(node.data.output.urls.slice(1) || [])]
      }
    }
  }

  if (node.data?.output?.url) {
    return {
      output: {
        ...node.data.output,
        url: newUrl,
        urls: [newUrl]
      }
    }
  }

  if (node.data?.sourceImages?.length > 0) {
    return {
      sourceImages: [newUrl, ...(node.data.sourceImages.slice(1) || [])]
    }
  }

  return {
    output: {
      type: 'image',
      url: newUrl,
      urls: [newUrl]
    }
  }
}

async function persistEditSession(rawState, currentImageUrl, exportInfo, node) {
  if (!rawState?.history?.length) return null

  const trimmedState = clampSessionHistory(rawState, 10)
  const uploadedHistory = []

  for (let index = 0; index < trimmedState.history.length; index++) {
    const entry = trimmedState.history[index]
    const snapshotUrl = entry?.snapshotUrl || entry?.imageData
    if (!snapshotUrl) continue

    if (/^(https?:)?\/\//.test(snapshotUrl) || snapshotUrl.startsWith('/')) {
      uploadedHistory.push({
        ...entry,
        snapshotUrl
      })
      continue
    }

    const snapshotFile = await dataUrlToFile(
      snapshotUrl,
      `edit-session-${node?.id || 'node'}-${index}.png`,
      'image/png'
    )
    const result = await uploadCanvasMedia(snapshotFile, 'image')
    uploadedHistory.push({
      ...entry,
      snapshotUrl: result.url
    })
  }

  return buildSavedSessionPayload({
    ...trimmedState,
    baseImageUrl: node?.data?.editSession?.baseImageUrl || rawState.baseImageUrl || currentImageUrl,
    currentImageUrl,
    exportFormat: exportInfo?.format,
    exportQuality: exportInfo?.quality,
    imageMimeType: exportInfo?.mimeType,
    history: uploadedHistory
  })
}

async function persistEditSessionInBackground(node, rawState, currentImageUrl, exportInfo) {
  if (!node?.id || !rawState?.history?.length) return

  try {
    const persistedSession = await persistEditSession(rawState, currentImageUrl, exportInfo, node)
    if (!persistedSession) return

    canvasStore.updateNodeData(node.id, {
      editSession: persistedSession
    })
    nodeEditCache.set(node.id, persistedSession)
  } catch (sessionError) {
    console.warn('[ImageEditMode] 编辑记录后台持久化失败，将从最终图重新编辑:', sessionError)
  }
}

// ==================== 节点与图片 ====================

// 当前编辑的节点
const editingNode = computed(() => {
  if (!canvasStore.editingNodeId) return null
  return canvasStore.nodes.find(n => n.id === canvasStore.editingNodeId)
})

// 当前图片URL
const currentImageUrl = computed(() => {
  if (!editingNode.value) return null
  const node = editingNode.value
  
  // 优先获取输出图片
  if (node.data?.output?.urls?.length > 0) {
    return node.data.output.urls[0]
  }
  if (node.data?.output?.url) {
    return node.data.output.url
  }
  // 其次获取源图片
  if (node.data?.sourceImages?.length > 0) {
    return node.data.sourceImages[0]
  }
  return null
})

// 当前编辑工具
const currentTool = computed(() => canvasStore.editTool)

// 是否显示编辑模式（排除重绘和擦除，这些由 InplaceImageEditor 处理）
const isVisible = computed(() => {
  if (!canvasStore.isInEditMode || !currentImageUrl.value) return false
  // 重绘和擦除使用原地编辑器
  if (['repaint', 'erase'].includes(currentTool.value)) return false
  return true
})

// 映射工具到编辑器的初始模式
const initialTool = computed(() => {
  const toolMap = {
    'crop': 'crop',
    'repaint': 'mask',
    'erase': 'mask',
    'spot-heal': 'spot-heal',
    'annotate': 'annotate', // 标注工具
    'enhance': 'filter',
    'cutout': '',
    'expand': ''
  }
  return toolMap[currentTool.value] || ''
})

// 工具标题
const toolTitle = computed(() => {
  const titles = {
    repaint: '重绘蒙版',
    erase: '擦除区域',
    'spot-heal': '污点修复',
    annotate: '涂鸦标注',
    crop: '裁剪图片',
    enhance: '调色混色器',
    cutout: '智能抠图',
    expand: '智能扩图'
  }
  return titles[currentTool.value] || '图片编辑'
})

// 计算编辑区域尺寸
function calculateEditorSize() {
  const padding = 100 // 边距
  const toolbarHeight = 60 // 工具栏高度
  
  editorWidth.value = Math.min(window.innerWidth - padding * 2, 1200)
  editorHeight.value = Math.min(window.innerHeight - padding * 2 - toolbarHeight, 800)
}

// ==================== 保存与取消 ====================

// 处理保存（立即关闭编辑器，后台上传）
async function handleSave(data) {
  console.log('[ImageEditMode] handleSave 被调用', !!data?.image)

  if (!editingNode.value || !data) {
    canvasStore.exitEditMode()
    return
  }

  try {
    const node = editingNode.value
    const nodeId = node.id
    const nodeSnapshot = { ...node, data: { ...node.data } }

    if (currentTool.value === 'spot-heal') {
      const sourceImageUrl = currentImageUrl.value
      canvasStore.exitEditMode()
      processSpotHealInBackground(nodeId, nodeSnapshot, data, sourceImageUrl)
      return
    }

    if (data.image) {
      const previewPatch = buildNodeImagePatch(node, data.image)
      canvasStore.updateNodeData(nodeId, {
        ...previewPatch,
        editSession: null,
        _editSaving: true
      })
      nodeEditCache.delete(nodeId)
    }

    canvasStore.exitEditMode()

    if (data.image) {
      uploadEditedImageInBackground(nodeId, nodeSnapshot, data)
    }
  } catch (error) {
    console.error('[ImageEditMode] handleSave 异常:', error)
    canvasStore.exitEditMode()
  }
}

function createSpotHealResultNode(sourceNode, data) {
  const nodeWidth = 280
  const gap = 50
  const newNodeId = `spot_heal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const newNodePosition = {
    x: (sourceNode.position?.x || 0) + nodeWidth + gap,
    y: sourceNode.position?.y || 0
  }

  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      title: '污点修复',
      label: '污点修复',
      status: 'processing',
      progress: '污点修复中...',
      taskType: 'spot-heal',
      sourceType: 'spot-heal',
      localProcessing: 'spot-heal',
      sourceNodeId: sourceNode.id,
      maskPreview: data.mask || null
    }
  })

  canvasStore.addEdge({
    id: `edge-${sourceNode.id}-${newNodeId}-${Date.now()}`,
    source: sourceNode.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'smoothstep'
  })

  return newNodeId
}

async function processSpotHealInBackground(nodeId, nodeSnapshot, data, sourceImageUrl) {
  const resultNodeId = createSpotHealResultNode(nodeSnapshot, data)

  try {
    if (!data?.hasMask || !data.mask) {
      throw new Error('请先涂抹要修复的污点区域')
    }

    const result = await inpaintImageLocal({
      imageUrl: sourceImageUrl,
      image: data.image,
      mask: data.mask,
      method: 'telea',
      radius: Math.max(1, Math.min(80, Math.round((data.editState?.brushSize || 10) / 4))),
      nodeId
    })

    if (!result?.url) {
      throw new Error('污点修复完成但未返回图片')
    }

    canvasStore.updateNodeData(resultNodeId, {
      status: 'success',
      progress: null,
      localProcessing: null,
      output: {
        type: 'image',
        url: result.url,
        urls: [result.url]
      },
      localInpaint: {
        method: result.method || 'telea',
        radius: result.radius || null
      }
    })

    showToast('污点修复完成', 'success')
  } catch (error) {
    console.error('[ImageEditMode] 污点修复失败:', error)
    canvasStore.updateNodeData(resultNodeId, {
      status: 'error',
      progress: null,
      localProcessing: null,
      error: error.message || '污点修复失败'
    })
    showToast(error.message || '污点修复失败', 'error', 3000)
  }
}

// 后台上传编辑后的图片和蒙版
async function uploadEditedImageInBackground(nodeId, nodeSnapshot, data) {
  try {
    let newImageUrl = null

    if (data.image) {
      newImageUrl = await updateNodeImage(data.image, data.exportInfo)
    }

    if (newImageUrl) {
      const nodePatch = buildNodeImagePatch(nodeSnapshot, newImageUrl)
      canvasStore.updateNodeData(nodeId, {
        ...nodePatch,
        _editSaving: false
      })

      const savedNode = {
        ...nodeSnapshot,
        data: { ...nodeSnapshot.data, ...nodePatch }
      }

      if (data.editState) {
        persistEditSessionInBackground(savedNode, data.editState, newImageUrl, data.exportInfo)
      }
    } else {
      canvasStore.updateNodeData(nodeId, { _editSaving: false })
    }

    if (data.hasMask && data.mask) {
      await uploadAndSaveMaskForNode(nodeId, nodeSnapshot, data.mask)
      console.log('[ImageEditMode] 蒙版已生成并保存')
    }

    console.log('[ImageEditMode] 后台上传完成')
  } catch (error) {
    console.error('[ImageEditMode] 后台上传失败:', error)
    canvasStore.updateNodeData(nodeId, { _editSaving: false })
  }
}

// 上传蒙版并创建新的蒙版图片节点（使用快照中的节点信息）
async function uploadAndSaveMaskForNode(nodeId, nodeSnapshot, maskDataUrl) {
  if (!maskDataUrl) return

  const response = await fetch(maskDataUrl)
  const blob = await response.blob()
  const file = new File([blob], `mask_${Date.now()}.png`, { type: 'image/png' })

  const { uploadImages } = await import('@/api/canvas/nodes')
  const uploadedUrls = await uploadImages([file])

  if (uploadedUrls?.length > 0) {
    const maskUrl = uploadedUrls[0]

    canvasStore.updateNodeData(nodeId, { maskUrl })

    const nodeWidth = 280
    const gap = 50
    const newNodePosition = {
      x: nodeSnapshot.position.x + nodeWidth + gap,
      y: nodeSnapshot.position.y
    }

    canvasStore.addNode({
      type: 'image',
      position: newNodePosition,
      data: {
        title: '蒙版',
        sourceImages: [maskUrl],
        nodeRole: 'source',
        isMask: true,
        sourceNodeId: nodeId
      }
    })
  } else {
    throw new Error('上传蒙版失败')
  }
}

// 上传蒙版并创建新的蒙版图片节点
async function uploadAndSaveMask(maskDataUrl) {
  if (!editingNode.value || !maskDataUrl) return
  
  // 将 dataUrl 转换为 File 并上传
  const response = await fetch(maskDataUrl)
  const blob = await response.blob()
  const file = new File([blob], `mask_${Date.now()}.png`, { type: 'image/png' })
  
  // 动态导入上传函数
  const { uploadImages } = await import('@/api/canvas/nodes')
  const uploadedUrls = await uploadImages([file])
  
  if (uploadedUrls?.length > 0) {
    const maskUrl = uploadedUrls[0]
    const sourceNode = editingNode.value
    
    // 保存蒙版 URL 到原节点数据（用于 AI 重绘时关联）
    canvasStore.updateNodeData(sourceNode.id, {
      maskUrl: maskUrl
    })
    
    // 在原节点右侧创建一个新的图片节点显示蒙版
    const nodeWidth = 280 // 节点默认宽度
    const gap = 50 // 节点间距
    const newNodePosition = {
      x: sourceNode.position.x + nodeWidth + gap,
      y: sourceNode.position.y
    }
    
    // 创建蒙版图片节点
    canvasStore.addNode({
      type: 'image',
      position: newNodePosition,
      data: {
        title: '蒙版',
        sourceImages: [maskUrl],
        nodeRole: 'source', // 设置为源节点以正确显示图片
        isMask: true, // 标记为蒙版节点
        sourceNodeId: sourceNode.id // 关联原节点
      }
    })
    
    console.log('[ImageEditMode] 蒙版节点已创建:', maskUrl)
  } else {
    console.error('[ImageEditMode] 上传蒙版失败')
    throw new Error('上传蒙版失败')
  }
}

// 更新节点图片（覆盖原图）
async function updateNodeImage(dataUrl, exportInfo = null) {
  if (!editingNode.value) return null

  const finalExportInfo = exportInfo || {
    mimeType: 'image/png',
    extension: 'png'
  }

  const file = await dataUrlToFile(
    dataUrl,
    buildImageFileName(finalExportInfo.extension || 'png'),
    finalExportInfo.mimeType
  )
  const result = await uploadCanvasMedia(file, 'image')

  if (!result?.url) {
    console.error('[ImageEditMode] 上传图片失败，没有返回 URL')
    throw new Error('上传图片失败')
  }

  console.log('[ImageEditMode] 图片已上传（覆盖原图）:', result.url)
  return result.url
}

// 处理取消
function handleCancel() {
  // 取消时也缓存编辑状态，以便下次恢复
  cacheCurrentState()
  canvasStore.exitEditMode()
}

function handleRestoreFailed() {
  if (!editingNode.value) return

  nodeEditCache.delete(editingNode.value.id)

  if (editingNode.value.data?.editSession) {
    canvasStore.updateNodeData(editingNode.value.id, {
      editSession: null
    })
  }
}

// ESC 退出
function handleKeyDown(event) {
  if (event.key === 'Escape' && isVisible.value) {
    handleCancel()
  }
}

// 监听窗口大小变化
function handleResize() {
  calculateEditorSize()
}

onMounted(() => {
  calculateEditorSize()
  window.addEventListener('resize', handleResize)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="edit-mode-fade">
      <div v-if="isVisible" class="image-edit-mode-overlay" @click.self="handleCancel">
        <div class="edit-mode-container">
          <!-- 头部 -->
          <div class="edit-mode-header">
            <div class="header-left">
              <button class="close-btn" @click="handleCancel" title="关闭 (ESC)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span class="edit-title">{{ toolTitle }}</span>
              <span v-if="cachedState" class="restore-badge">已恢复编辑记录</span>
            </div>
            <div class="header-right">
              <span class="edit-hint">全功能图片编辑 · 按 ESC 退出</span>
            </div>
          </div>
          
          <!-- 编辑器区域 -->
          <div class="edit-mode-content">
            <!-- 原生全功能图片编辑器 -->
            <NativeImageEditor
              ref="editorRef"
              :image-url="currentImageUrl"
              :initial-tool="initialTool"
              :width="editorWidth"
              :height="editorHeight"
              :cached-state="cachedState"
              @save="handleSave"
              @cancel="handleCancel"
              @restore-failed="handleRestoreFailed"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================== 黑白灰主题 - 兼容画布深色/白昼模式 ==================== */

.image-edit-mode-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-mode-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  max-width: 1400px;
  max-height: 100%;
  padding: 16px 20px;
}

/* 头部 */
.edit-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--canvas-radius-sm, 8px);
  background: var(--canvas-bg-elevated, rgba(255, 255, 255, 0.08));
  border: 1px solid var(--canvas-border-subtle, rgba(255, 255, 255, 0.1));
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.6));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--canvas-bg-elevated, rgba(255, 255, 255, 0.12));
  color: var(--canvas-text-primary, #ffffff);
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

.edit-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--canvas-text-primary, #ffffff);
  letter-spacing: -0.01em;
}

.restore-badge {
  font-size: 11px;
  color: var(--canvas-accent-success, #22c55e);
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
}

.edit-hint {
  font-size: 12px;
  color: var(--canvas-text-tertiary, rgba(255, 255, 255, 0.35));
}

/* 编辑器区域 */
.edit-mode-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 动画 */
.edit-mode-fade-enter-active,
.edit-mode-fade-leave-active {
  transition: all 0.25s ease;
}

.edit-mode-fade-enter-from,
.edit-mode-fade-leave-to {
  opacity: 0;
}

.edit-mode-fade-enter-from .edit-mode-container,
.edit-mode-fade-leave-to .edit-mode-container {
  transform: scale(0.96);
}
</style>
