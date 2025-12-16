<script setup>
/**
 * CanvasBottomPanel.vue - 底部输入面板
 * 根据选中节点类型显示不同的配置选项
 * 支持图片生成和LLM对话
 * 
 * 文本节点选中时：
 * - 上方显示文本内容预览（带左右添加按钮）
 * - 下方显示 LLM 配置面板（输入框、模型选择、发送按钮）
 */
import { ref, computed, watch, inject, onMounted, onUnmounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { getNodeConfig } from '@/config/canvas/nodeTypes'
import { generateImageFromText, generateImageFromImage, pollTaskStatus, uploadImages } from '@/api/canvas/nodes'
import { getLLMConfig, chatWithLLM, describeImage } from '@/api/canvas/llm'
import { getApiUrl } from '@/config/tenant'

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// 生成状态
const isGenerating = ref(false)

// 输入框引用
const inputRef = ref(null)

// 输入内容
const inputText = ref('')
const selectedModel = ref('gemini-2.5-pro')
const selectedSize = ref('1K')
const selectedAspectRatio = ref('auto')
const generateCount = ref(1)

// 模型下拉菜单
const showModelDropdown = ref(false)

// LLM 配置
const llmConfig = ref({
  enabled: false,
  models: [],
  defaultModel: 'gemini-2.5-pro'
})

// 加载 LLM 配置
async function loadLLMConfig() {
  try {
    const config = await getLLMConfig()
    llmConfig.value = config
    if (config.defaultModel) {
      selectedModel.value = config.defaultModel
    }
  } catch (error) {
    console.error('[BottomPanel] 加载 LLM 配置失败:', error)
  }
}

// 可用模型列表（根据节点类型选择）
const availableModels = computed(() => {
  const nodeType = canvasStore.selectedNode?.type
  
  // 如果是文本节点，返回 LLM 模型
  if (nodeType === 'text-input') {
    // 如果有 LLM 配置的模型，使用配置的模型
    if (llmConfig.value.models && llmConfig.value.models.length > 0) {
      return llmConfig.value.models.map(m => ({
        value: m.id,
        label: m.name,
        icon: m.icon || 'G',
        pointsCost: m.pointsCost
      }))
    }
    // 默认 LLM 模型列表
    return [
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', icon: 'G', pointsCost: 1 },
      { value: 'gemini-3-pro', label: 'Gemini 3 Pro', icon: 'G', pointsCost: 2 },
      { value: 'gpt-4o', label: 'GPT-4o', icon: '✨', pointsCost: 3 },
      { value: 'claude-3', label: 'Claude 3', icon: '🤖', pointsCost: 2 }
    ]
  }
  
  // 否则返回图片生成模型
  return [
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro', icon: 'G' },
    { value: 'nano-banana-2', label: 'Banana Pro', icon: '🍌' },
    { value: 'nano-banana', label: 'Banana', icon: '🍌' },
    { value: 'nano-banana-hd', label: 'Banana HD', icon: '🍌' }
  ]
})

// 当前选中模型的标签
const selectedModelLabel = computed(() => {
  const model = availableModels.value.find(m => m.value === selectedModel.value)
  return model ? model.label : selectedModel.value
})

// 当前选中模型的图标
const selectedModelIcon = computed(() => {
  const model = availableModels.value.find(m => m.value === selectedModel.value)
  return model?.icon || 'G'
})

// 当前模型积分消耗
const currentModelCost = computed(() => {
  const model = availableModels.value.find(m => m.value === selectedModel.value)
  return model?.pointsCost || 1
})

// 是否是文本节点（显示LLM对话功能）
const isTextNode = computed(() => {
  return canvasStore.selectedNode?.type === 'text-input'
})

// 获取文本节点的内容（用于预览）
const textNodeContent = computed(() => {
  if (!isTextNode.value) return ''
  return canvasStore.selectedNode?.data?.text || ''
})

// 文本节点是否有内容
const hasTextContent = computed(() => {
  return textNodeContent.value && textNodeContent.value.trim().length > 0
})

// 切换模型下拉菜单
function toggleModelDropdown() {
  showModelDropdown.value = !showModelDropdown.value
}

// 选择模型
function selectModel(modelValue) {
  selectedModel.value = modelValue
  showModelDropdown.value = false
  updateNodeData()
}

// 点击外部关闭下拉菜单
function handleClickOutside(event) {
  if (!event.target.closest('.model-selector')) {
    showModelDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  loadLLMConfig()
  // 自动聚焦输入框
  if (inputRef.value) {
    inputRef.value.focus()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 选中节点配置
const nodeConfig = computed(() => {
  if (!canvasStore.selectedNode) return null
  return getNodeConfig(canvasStore.selectedNode.type)
})

// 是否显示生成参数
const showGenerateParams = computed(() => {
  const type = canvasStore.selectedNode?.type
  return type && (
    type.includes('to-image') || 
    type.includes('to-video') ||
    type.startsWith('llm-') ||
    type === 'text-input'
  )
})

// 预估积分消耗
const estimatedCost = computed(() => {
  const type = canvasStore.selectedNode?.type
  if (!type) return 0
  
  // 文本节点使用 LLM 模型消耗
  if (type === 'text-input') {
    return currentModelCost.value
  }
  
  // 简化的积分计算
  const baseCosts = {
    'text-to-image': { '1K': 3, '2K': 4, '4K': 5 },
    'image-to-image': { '1K': 3, '2K': 4, '4K': 5 },
    'text-to-video': 20,
    'image-to-video': 20,
    'llm-prompt-enhance': 1,
    'llm-image-describe': 2
  }
  
  const cost = baseCosts[type]
  if (!cost) return 0
  
  if (typeof cost === 'object') {
    return cost[selectedSize.value] || 3
  }
  return cost
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 同步节点数据
watch(() => canvasStore.selectedNode, (node) => {
  if (node) {
    inputText.value = node.data.text || ''
    if (node.data.model) selectedModel.value = node.data.model
    if (node.data.size) selectedSize.value = node.data.size
  }
}, { immediate: true })

// 更新节点数据
function updateNodeData() {
  if (!canvasStore.selectedNodeId) return
  
  canvasStore.updateNodeData(canvasStore.selectedNodeId, {
    text: inputText.value,
    model: selectedModel.value,
    size: selectedSize.value,
    aspectRatio: selectedAspectRatio.value,
    estimatedCost: estimatedCost.value
  })
}

// 输入内容变化
function handleInputChange() {
  updateNodeData()
}

// 开始生成
async function handleGenerate() {
  if (!canvasStore.selectedNode) return
  
  const nodeType = canvasStore.selectedNode.type
  const nodeId = canvasStore.selectedNodeId
  
  // 检查输入
  if (!inputText.value.trim()) {
    alert('请输入内容')
    return
  }
  
  // 检查积分
  if (userPoints.value < estimatedCost.value) {
    alert('积分不足，请购买套餐')
    return
  }
  
  isGenerating.value = true
  
  // 文本节点：调用 LLM
  if (nodeType === 'text-input') {
    await handleLLMChat(nodeId)
    return
  }
  
  // 图片生成节点
  if (nodeType.includes('to-image')) {
    await handleImageGenerate(nodeId, nodeType)
    return
  }
  
  // 其他类型，直接更新文本数据
  canvasStore.updateNodeData(nodeId, { 
    text: inputText.value,
    status: 'idle'
  })
  isGenerating.value = false
}

// 处理 LLM 对话
async function handleLLMChat(nodeId) {
  try {
    canvasStore.updateNodeData(nodeId, {
      text: inputText.value,
      status: 'processing'
    })
    
    const result = await chatWithLLM({
      messages: [{ role: 'user', content: inputText.value }],
      model: selectedModel.value
    })
    
    // 更新节点状态
    canvasStore.updateNodeData(nodeId, {
      status: 'success',
      output: {
        type: 'text',
        content: result.result
      },
      llmResponse: result.result
    })
    
    // 刷新用户积分
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
  } catch (error) {
    console.error('[BottomPanel] LLM 对话失败:', error)
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      error: error.message || 'LLM 对话失败'
    })
    alert(error.message || 'LLM 对话失败，请重试')
  } finally {
    isGenerating.value = false
  }
}

// 判断是否是七牛云 CDN URL（公开可访问的 URL）
function isQiniuCdnUrl(str) {
  if (!str || typeof str !== 'string') return false
  return str.includes('files.nananobanana.cn') || 
         str.includes('qncdn.') ||
         str.includes('.qiniucdn.com') ||
         str.includes('.qbox.me')
}

// 判断是否需要重新上传的本地/相对路径 URL
function needsReupload(url) {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('/api/images/file/')) return true
  if (url.includes('nanobanana') && url.includes('/api/images/file/')) return true
  if (url.includes('localhost') && url.includes('/api/images/file/')) return true
  return false
}

// 将本地/相对路径的图片重新上传到七牛云获取公开 URL
async function reuploadToCloud(url) {
  console.log('[BottomPanel] 重新上传图片到云端:', url)
  
  try {
    let fetchUrl = url
    if (url.startsWith('/api/')) {
      fetchUrl = getApiUrl(url)
    }
    
    const response = await fetch(fetchUrl, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status}`)
    }
    
    const blob = await response.blob()
    const file = new File([blob], `reupload_${Date.now()}.png`, { type: blob.type || 'image/png' })
    
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      console.log('[BottomPanel] 重新上传成功，新 URL:', urls[0])
      return urls[0]
    }
    throw new Error('上传返回空 URL')
  } catch (error) {
    console.error('[BottomPanel] 重新上传失败:', error)
    return url
  }
}

// 确保所有 URL 都是 AI 模型可以访问的
async function ensureAccessibleUrls(imageUrls) {
  const accessibleUrls = []
  
  for (const url of imageUrls) {
    if (isQiniuCdnUrl(url)) {
      accessibleUrls.push(url)
    } else if (needsReupload(url)) {
      const newUrl = await reuploadToCloud(url)
      accessibleUrls.push(newUrl)
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      accessibleUrls.push(url)
    } else if (url.startsWith('/api/') || url.startsWith('/storage/')) {
      const fullUrl = getApiUrl(url)
      if (needsReupload(fullUrl)) {
        const newUrl = await reuploadToCloud(url)
        accessibleUrls.push(newUrl)
      } else {
        accessibleUrls.push(fullUrl)
      }
    } else {
      accessibleUrls.push(url)
    }
  }
  
  return accessibleUrls
}

// 获取上游节点的实时图片数据（直接从 store 获取，确保数据最新）
function getUpstreamImagesRealtime(nodeId) {
  const upstreamImages = []
  const upstreamEdges = canvasStore.edges.filter(e => e.target === nodeId)
  
  console.log('[BottomPanel] getUpstreamImagesRealtime - 检查上游边数:', upstreamEdges.length)
  
  for (const edge of upstreamEdges) {
    // 直接从 store 的 nodes 数组中获取最新数据
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    console.log('[BottomPanel] 检查上游节点:', {
      id: sourceNode.id,
      type: sourceNode.type,
      hasOutput: !!sourceNode.data?.output,
      outputUrls: sourceNode.data?.output?.urls
    })
    
    // 优先级：output.urls > output.url > sourceImages
    if (sourceNode.data?.output?.urls?.length > 0) {
      upstreamImages.push(...sourceNode.data.output.urls)
    } else if (sourceNode.data?.output?.url) {
      upstreamImages.push(sourceNode.data.output.url)
    } else if (sourceNode.data?.sourceImages?.length > 0) {
      upstreamImages.push(...sourceNode.data.sourceImages)
    }
  }
  
  console.log('[BottomPanel] 实时获取上游图片总数:', upstreamImages.length)
  return upstreamImages
}

// 处理图片生成
async function handleImageGenerate(nodeId, nodeType) {
  // 更新节点状态为处理中
  canvasStore.updateNodeData(nodeId, {
    text: inputText.value,
    status: 'processing'
  })
  
  try {
    // 直接从 store 获取上游节点的最新图片数据
    const realtimeImages = getUpstreamImagesRealtime(nodeId)
    // 也获取 inheritedData 作为后备
    const inheritedImages = canvasStore.selectedNode.data.inheritedData?.urls || []
    // 优先使用实时获取的数据
    const finalImages = realtimeImages.length > 0 ? realtimeImages : inheritedImages
    
    console.log('[BottomPanel] 实时获取的参考图:', realtimeImages.length, '张')
    console.log('[BottomPanel] inheritedData 的参考图:', inheritedImages.length, '张')
    console.log('[BottomPanel] 最终使用的参考图:', finalImages.length, '张')
    
    let result
    if (nodeType === 'image-to-image' || finalImages.length > 0) {
      // 🔥 关键：确保所有 URL 都是 AI 模型可以访问的（七牛云 CDN URL）
      const accessibleUrls = await ensureAccessibleUrls(finalImages)
      console.log('[BottomPanel] 处理后的可访问 URLs:', accessibleUrls.length, '张')
      
      // 图生图
      result = await generateImageFromImage({
        prompt: inputText.value,
        images: accessibleUrls,
        model: selectedModel.value,
        size: selectedSize.value,
        aspectRatio: selectedAspectRatio.value
      })
    } else {
      // 文生图
      result = await generateImageFromText({
        prompt: inputText.value,
        model: selectedModel.value,
        size: selectedSize.value,
        aspectRatio: selectedAspectRatio.value,
        count: generateCount.value
      })
    }
    
    console.log('[BottomPanel] 生成任务已提交:', result)
    
    // 如果是异步任务，后台轮询状态（不阻塞UI）
    if (result.task_id || result.id) {
      const taskId = result.task_id || result.id
      canvasStore.updateNodeData(nodeId, { taskId })
      
      // 任务提交成功，立即恢复按钮状态
      isGenerating.value = false
      
      // 后台轮询，不阻塞
      pollTaskStatus(taskId, 'image', {
        interval: 2000,
        timeout: 300000
      }).then(finalResult => {
        const urls = finalResult.urls || finalResult.images || []
        canvasStore.updateNodeData(nodeId, {
          status: 'success',
          output: {
            type: 'image',
            urls: Array.isArray(urls) ? urls : [urls]
          }
        })
      }).catch(error => {
        console.error('[BottomPanel] 轮询失败:', error)
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: error.message || '生成失败'
        })
      })
    } else if (result.urls || result.images) {
      const urls = result.urls || result.images || []
      canvasStore.updateNodeData(nodeId, {
        status: 'success',
        output: {
          type: 'image',
          urls: Array.isArray(urls) ? urls : [urls]
        }
      })
      isGenerating.value = false
    }
    
  } catch (error) {
    console.error('[BottomPanel] 生成失败:', error)
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      error: error.message || '生成失败'
    })
    alert(error.message || '生成失败，请重试')
    isGenerating.value = false
  }
}

// 键盘快捷键
function handleKeyDown(event) {
  // Enter 生成（非Shift）
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleGenerate()
  }
}
</script>

<template>
  <!-- 文本节点的配置面板已集成到 TextNode 内部，此处不再显示 -->
  <div class="canvas-bottom-panel" :class="{ 'text-node-panel': isTextNode }" v-if="canvasStore.selectedNode && !isTextNode">
    
    <!-- 文本节点：内容预览区域 -->
    <div v-if="isTextNode && hasTextContent" class="text-preview-section">
      <!-- 左侧添加按钮 -->
      <button class="preview-add-btn preview-add-left" title="添加上游节点">
        <span>+</span>
      </button>
      
      <!-- 文本内容预览卡片 -->
      <div class="text-preview-card">
        <div class="text-preview-content" v-html="textNodeContent"></div>
      </div>
      
      <!-- 右侧添加按钮 -->
      <button class="preview-add-btn preview-add-right" title="添加下游节点">
        <span>+</span>
      </button>
    </div>
    
    <!-- LLM 配置面板（文本节点）/ 普通输入面板（其他节点） -->
    <div class="llm-config-section">
      <!-- 输入框区域 -->
      <div class="canvas-input-area">
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="canvas-input"
          :placeholder="isTextNode ? '描述这个图片的内容' : '输入提示词...'"
          @input="handleInputChange"
          @keydown="handleKeyDown"
        ></textarea>
      </div>
      
      <!-- 控制栏 -->
      <div class="canvas-bottom-controls">
        <div class="canvas-controls-left">
          <!-- 模型选择器 -->
          <div class="model-selector" @click="toggleModelDropdown">
            <span class="model-icon" :class="{ 'llm-icon': isTextNode }">
              {{ selectedModelIcon }}
            </span>
            <span class="model-name">{{ selectedModelLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 下拉菜单 -->
            <div v-if="showModelDropdown" class="model-dropdown">
              <div 
                v-for="model in availableModels" 
                :key="model.value"
                class="model-option"
                :class="{ active: selectedModel === model.value }"
                @click.stop="selectModel(model.value)"
              >
                <span class="model-option-icon" :class="{ 'llm-icon': isTextNode }">
                  {{ model.icon }}
                </span>
                <span class="model-option-name">{{ model.label }}</span>
                <span v-if="model.pointsCost" class="model-option-cost">💎{{ model.pointsCost }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="canvas-controls-right">
          <!-- 生成次数 -->
          <span class="generate-count">{{ generateCount }}x</span>
          
          <!-- 生成按钮 -->
          <button 
            class="canvas-generate-btn"
            :disabled="!inputText.trim() || isGenerating"
            title="开始生成 (Enter)"
            @click="handleGenerate"
          >
            <span v-if="isGenerating">⏳</span>
            <span v-else>↑</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 底部面板样式 */
.canvas-bottom-panel {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 800px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 文本节点面板特殊样式 */
.canvas-bottom-panel.text-node-panel {
  max-width: 700px;
}

/* ========== 文本预览区域 ========== */
.text-preview-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 预览卡片添加按钮 */
.preview-add-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  color: var(--canvas-text-tertiary, #666666);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.preview-add-btn:hover {
  background: var(--canvas-accent-primary, #3b82f6);
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: white;
  transform: scale(1.1);
}

/* 文本预览卡片 */
.text-preview-card {
  flex: 1;
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  padding: 20px 24px;
  max-height: 200px;
  overflow-y: auto;
}

.text-preview-content {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ========== LLM 配置区域 ========== */
.llm-config-section {
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.canvas-input-area {
  margin-bottom: 16px;
}

.canvas-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--canvas-text-primary, #ffffff);
  font-size: 15px;
  resize: none;
  min-height: 48px;
  max-height: 120px;
  line-height: 1.6;
}

.canvas-input::placeholder {
  color: var(--canvas-text-placeholder, #4a4a4a);
}

.canvas-bottom-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.canvas-controls-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.canvas-controls-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 模型选择器 */
.model-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.model-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.model-icon {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #4285f4, #34a853);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: 600;
}

.model-icon.llm-icon {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
}

.model-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 14px;
  font-weight: 500;
}

.dropdown-arrow {
  color: var(--canvas-text-tertiary, #666666);
  font-size: 10px;
  margin-left: 4px;
}

/* 模型下拉菜单 */
.model-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.model-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-option:hover {
  background: var(--canvas-bg-elevated, #242424);
}

.model-option.active {
  background: rgba(139, 92, 246, 0.15);
}

.model-option-icon {
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #4285f4, #34a853);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
}

.model-option-icon.llm-icon {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
}

.model-option-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 14px;
  flex: 1;
}

/* 模型积分显示 - 黑白灰风格 */
.model-option-cost {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 生成次数 */
.generate-count {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  font-weight: 500;
}

/* 生成按钮 */
.canvas-generate-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;
}

.canvas-generate-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

.canvas-generate-btn:disabled {
  background: var(--canvas-border-default, #3a3a3a);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ========== 滚动条美化 ========== */
.text-preview-card::-webkit-scrollbar {
  width: 6px;
}

.text-preview-card::-webkit-scrollbar-track {
  background: transparent;
}

.text-preview-card::-webkit-scrollbar-thumb {
  background: var(--canvas-border-subtle, #2a2a2a);
  border-radius: 3px;
}

.text-preview-card::-webkit-scrollbar-thumb:hover {
  background: var(--canvas-border-active, #4a4a4a);
}
</style>
