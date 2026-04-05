<script setup>
defineOptions({
  inheritAttrs: false
})
/**
 * LLMNode.vue - LLM 智能节点
 * 用于提示词优化、图片描述、内容扩写等
 */
import { ref, computed, inject, nextTick, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { enhancePrompt, describeImage, expandContent, getLLMCost } from '@/api/canvas/llm'
import { formatPoints } from '@/utils/format'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const emit = defineEmits(['updateNodeInternals'])

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals } = useVueFlow()

// LLM 类型配置 - 黑白灰简洁风格
const LLM_TYPES = {
  'llm-prompt-enhance': {
    label: '提示词优化',
    icon: 'A+',
    description: 'AI 优化提示词，生成更专业的描述',
    inputType: 'text',
    outputType: 'text',
    action: 'prompt-enhance'
  },
  'llm-image-describe': {
    label: '图片描述',
    icon: '◎',
    description: '分析图片，生成详细提示词',
    inputType: 'image',
    outputType: 'text',
    action: 'image-describe'
  },
  'llm-content-expand': {
    label: '内容扩写',
    icon: '≡',
    description: 'AI 扩展内容，增加细节',
    inputType: 'text',
    outputType: 'text',
    action: 'content-expand'
  }
}

// 当前节点类型配置
const nodeType = computed(() => props.data.type || 'llm-prompt-enhance')
const typeConfig = computed(() => LLM_TYPES[nodeType.value] || LLM_TYPES['llm-prompt-enhance'])

// 节点尺寸 - LLM节点使用竖向矩形，适合输入输出显示
const nodeWidth = ref(props.data.width || 360)
const nodeHeight = ref(props.data.height || 300)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'llm-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'success': props.data.status === 'success',
  'error': props.data.status === 'error',
  'resizing': isResizing.value
}))

// 节点内容样式
const contentStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  height: `${nodeHeight.value}px`
}))

// 继承的数据
const inheritedText = computed(() => props.data.inheritedData?.content || '')
const inheritedImages = computed(() => props.data.inheritedData?.urls || [])

// 输出结果
const outputText = computed(() => props.data.output?.content || '')

// 积分消耗
const pointsCost = computed(() => getLLMCost(typeConfig.value.action))

// 格式化积分显示
const formattedPointsCost = computed(() => {
  return formatPoints(pointsCost.value)
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 是否可以执行
const canExecute = computed(() => {
  if (typeConfig.value.inputType === 'text') {
    return !!inheritedText.value
  }
  if (typeConfig.value.inputType === 'image') {
    return inheritedImages.value.length > 0
  }
  return false
})

// 开始调整尺寸
function handleResizeStart(handle, event) {
  event.stopPropagation()
  event.preventDefault()
  
  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: nodeWidth.value,
    height: nodeHeight.value
  }
  
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', handleResizeEnd)
}

// 调整尺寸中
function handleResizeMove(event) {
  if (!isResizing.value) return
  
  const deltaX = event.clientX - resizeStart.value.x
  const deltaY = event.clientY - resizeStart.value.y
  
  const viewport = canvasStore.viewport
  const zoom = viewport.zoom || 1
  
  const scaledDeltaX = deltaX / zoom
  const scaledDeltaY = deltaY / zoom
  
  if (resizeHandle.value === 'right' || resizeHandle.value === 'corner') {
    nodeWidth.value = Math.max(200, resizeStart.value.width + scaledDeltaX)
  }
  
  if (resizeHandle.value === 'bottom' || resizeHandle.value === 'corner') {
    nodeHeight.value = Math.max(200, resizeStart.value.height + scaledDeltaY)
  }
  
  // 实时更新连线位置
  updateNodeInternals(props.id)
}

// 结束调整尺寸
function handleResizeEnd() {
  isResizing.value = false
  resizeHandle.value = null
  
  canvasStore.updateNodeData(props.id, {
    width: nodeWidth.value,
    height: nodeHeight.value
  })
  
  // 更新节点内部状态，确保连线位置跟随 Handle 位置变化
  nextTick(() => {
    updateNodeInternals(props.id)
  })
  
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}

// 执行 LLM
async function handleExecute() {
  if (!canExecute.value) {
    alert('请先连接输入')
    return
  }
  
  if (userPoints.value < pointsCost.value) {
    alert(t('imageGen.insufficientPoints'))
    return
  }
  
  canvasStore.updateNodeData(props.id, { status: 'processing' })
  
  try {
    let result
    
    switch (typeConfig.value.action) {
      case 'prompt-enhance':
        result = await enhancePrompt(inheritedText.value)
        break
      case 'image-describe':
        result = await describeImage(inheritedImages.value[0])
        break
      case 'content-expand':
        result = await expandContent(inheritedText.value)
        break
      default:
        throw new Error('未知的 LLM 类型')
    }
    
    canvasStore.updateNodeData(props.id, {
      status: 'success',
      output: {
        type: 'text',
        content: result.result || result.text || ''
      }
    })
    
    // 刷新用户积分
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
  } catch (error) {
    console.error('[LLM] 执行失败:', error)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
  }
}

// 重新执行
function handleRedo() {
  canvasStore.updateNodeData(props.id, { 
    status: 'idle',
    output: null,
    error: null
  })
}

// 复制输出
async function copyOutput() {
  if (outputText.value) {
    try {
      await navigator.clipboard.writeText(outputText.value)
      alert('已复制到剪贴板')
    } catch (e) {
      console.error('复制失败', e)
    }
  }
}

// 打开右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: nodeType.value, position: { x: 0, y: 0 }, data: props.data }
  )
}

// 右侧添加按钮
function handleAddClick(event) {
  event.stopPropagation()
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY },
    'node',
    props.id
  )
}

// 监听编组整组执行触发
watch(() => props.data.executeTriggered, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal && props.data.triggeredByGroup) {
    console.log(`[LLMNode] 编组触发执行: ${props.id}`)
    handleExecute()
  }
})
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 节点头部 -->
    <div class="canvas-node-header">
      <div class="canvas-node-title">
        <span class="icon">{{ typeConfig.icon }}</span>
        {{ data.title || typeConfig.label }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="复制" @click="copyOutput" v-if="outputText">📋</button>
        <button class="canvas-node-action-btn" title="更多">≡</button>
      </div>
    </div>
    
    <!-- 节点内容 -->
    <div class="canvas-node-content" :style="contentStyle">
      <!-- 输入预览 -->
      <div class="llm-input-section" v-if="!outputText">
        <div class="section-label">输入</div>
        
        <!-- 文本输入预览 -->
        <div v-if="typeConfig.inputType === 'text'" class="input-preview">
          <div v-if="inheritedText" class="inherited-text">
            {{ inheritedText.slice(0, 100) }}{{ inheritedText.length > 100 ? '...' : '' }}
          </div>
          <div v-else class="empty-hint">等待文本输入...</div>
        </div>
        
        <!-- 图片输入预览 -->
        <div v-else-if="typeConfig.inputType === 'image'" class="input-preview">
          <div v-if="inheritedImages.length" class="image-preview">
            <img :src="inheritedImages[0]" alt="输入图片" />
          </div>
          <div v-else class="empty-hint">等待图片输入...</div>
        </div>
      </div>
      
      <!-- 输出预览 -->
      <div class="llm-output-section" v-if="outputText">
        <div class="section-label">输出</div>
        <div class="output-text">{{ outputText }}</div>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="data.status === 'processing'" class="llm-loading">
        <div class="canvas-loading-spinner"></div>
        <span>AI 处理中...</span>
      </div>
      
      <!-- 错误状态 -->
      <div v-if="data.status === 'error'" class="llm-error">
        <span class="error-text">{{ data.error || '处理失败' }}</span>
      </div>
      
      <!-- 操作按钮 -->
      <div class="llm-actions">
        <span class="points-cost-display">{{ formattedPointsCost }} {{ t('imageGen.points') }}</span>
        
        <button 
          v-if="!outputText"
          class="canvas-node-btn"
          :disabled="!canExecute || data.status === 'processing'"
          @click="handleExecute"
        >
          {{ data.status === 'processing' ? '...' : '→ 执行' }}
        </button>
        
        <button 
          v-else
          class="canvas-node-btn secondary"
          @click="handleRedo"
        >
          ⟲ 重新执行
        </button>
      </div>
      
      <!-- Resize Handles 调节手柄 -->
      <div 
        class="resize-handle resize-handle-right"
        @mousedown="handleResizeStart('right', $event)"
      ></div>
      <div 
        class="resize-handle resize-handle-bottom"
        @mousedown="handleResizeStart('bottom', $event)"
      ></div>
      <div 
        class="resize-handle resize-handle-corner"
        @mousedown="handleResizeStart('corner', $event)"
      ></div>
    </div>
    
    <!-- 输入端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 输出端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 右侧添加按钮 -->
    <button 
      v-if="outputText"
      class="node-add-btn"
      title="创建下一个节点"
      @click="handleAddClick"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.llm-node {
  min-width: 260px;
  contain: layout style;
}

.llm-input-section,
.llm-output-section {
  margin-bottom: 12px;
}

.section-label {
  font-size: 11px;
  color: var(--canvas-text-tertiary);
  margin-bottom: 6px;
  text-transform: uppercase;
}

.input-preview {
  background: var(--canvas-bg-secondary);
  border: 1px solid var(--canvas-border-subtle);
  border-radius: var(--canvas-radius-sm);
  padding: 10px;
  min-height: 60px;
}

.inherited-text {
  color: var(--canvas-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.empty-hint {
  color: var(--canvas-text-placeholder);
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}

.image-preview {
  display: flex;
  justify-content: center;
}

.image-preview img {
  max-width: 100%;
  max-height: 80px;
  border-radius: 4px;
  object-fit: contain;
}

.output-text {
  background: var(--canvas-bg-secondary);
  border: 1px solid var(--canvas-accent-success);
  border-radius: var(--canvas-radius-sm);
  padding: 10px;
  color: var(--canvas-text-primary);
  font-size: 12px;
  line-height: 1.5;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.llm-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--canvas-text-secondary);
  font-size: 12px;
}

.llm-error {
  padding: 10px;
  text-align: center;
}

.error-text {
  color: var(--canvas-accent-error);
  font-size: 12px;
}

.llm-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle);
}

/* 旧的积分显示 - 黑白灰风格（保留兼容） */
.points-cost {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 新的积分显示样式 - 黑白灰风格 */
.points-cost-display {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

/* 端口样式 - 位置与+按钮对齐（但视觉隐藏） */
.node-handle {
  width: 1px;
  height: 1px;
  background: transparent;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.node-handle-hidden {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
}

/* 调整 Handle 位置与 + 按钮中心对齐 */
:deep(.vue-flow__handle.target) {
  left: -34px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -34px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

.node-add-btn {
  position: absolute;
  right: -52px;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.5);
  font-size: 22px;
  font-weight: 300;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  z-index: 10;
}

.canvas-node:hover .node-add-btn,
.llm-node.selected .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-50%) scale(1.1);
}

/* 节点内容区域 */
.canvas-node-content {
  position: relative;
  overflow: hidden;
}

.llm-node.resizing .canvas-node-content {
  pointer-events: none;
  user-select: none;
}

/* Resize Handles 调节手柄 */
.resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.canvas-node-content:hover .resize-handle {
  opacity: 1;
}

.resize-handle-right {
  right: -2px;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
  background: transparent;
}

.resize-handle-right:hover,
.resize-handle-right:active {
  background: var(--canvas-accent-primary, #3b82f6);
}

.resize-handle-bottom {
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 4px;
  cursor: ns-resize;
  background: transparent;
}

.resize-handle-bottom:hover,
.resize-handle-bottom:active {
  background: var(--canvas-accent-primary, #3b82f6);
}

.resize-handle-corner {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: var(--canvas-accent-primary, #3b82f6);
  border-radius: 2px;
}
</style>

