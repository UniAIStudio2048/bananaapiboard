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
import DOMPurify from 'dompurify'
import { useCanvasStore } from '@/stores/canvas'
import { getNodeConfig } from '@/config/canvas/nodeTypes'
import { generateImageFromText, generateImageFromImage, pollTaskStatus, uploadImages } from '@/api/canvas/nodes'
import { getLLMConfig, chatWithLLM, describeImage } from '@/api/canvas/llm'
import { getApiUrl, getAvailableImageModels, useTenantConfigVersion } from '@/config/tenant'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import { formatPoints } from '@/utils/format'
import { getTotalUserPoints } from '@/utils/points'
import { isPreferredModelMediaUrl, normalizeModelImageUrls } from '@/utils/canvasModelMedia'
import { resolveGenerationAspectRatio } from '@/utils/aspectRatio'
import { withNoChargeNotice } from '@/utils/mediaTaskBillingMessage'
import {
  getAvailableImageResolutionOptions,
  getImageResolutionCost,
  normalizeImageSelectedSize
} from '@/utils/canvasImageResolutionOptions'
import ModelIcon from '@/components/common/ModelIcon.vue'

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')
const tenantConfigVersion = useTenantConfigVersion()

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

const llmCapabilityOptions = [
  { key: 'image', label: '图片理解', icon: '' },
  { key: 'video', label: '视频理解', icon: '' },
  { key: 'audio', label: '音频理解', icon: '' },
  { key: 'webSearch', label: '联网搜索', icon: '⌕' },
  { key: 'file', label: '文件理解', icon: '□' }
]

function getEnabledLlmCapabilities(model = {}) {
  const capabilities = model.capabilities || {}
  return llmCapabilityOptions.filter(option => capabilities[option.key] === true)
}

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
  void tenantConfigVersion.value
  const nodeType = canvasStore.selectedNode?.type
  
  // 如果是文本节点，返回 LLM 模型
  if (nodeType === 'text-input') {
    // 如果有 LLM 配置的模型，使用配置的模型
    if (llmConfig.value.models && llmConfig.value.models.length > 0) {
      return llmConfig.value.models.map(m => ({
        value: m.id,
        label: m.name,
        icon: m.icon || m.name || m.id,
        pointsCost: m.pointsCost,
        description: m.description || '',
        capabilities: m.capabilities || {}
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
  
  // 否则返回图片生成模型（从配置动态获取，支持新增模型自动同步）
  return getAvailableImageModels()
})

// 当前选中模型的标签
const selectedModelLabel = computed(() => {
  const model = availableModels.value.find(m => m.value === selectedModel.value)
  return model ? model.label : selectedModel.value
})

// 当前选中模型的图标
const selectedModelIcon = computed(() => {
  const model = availableModels.value.find(m => m.value === selectedModel.value)
  return model?.icon || selectedModelLabel.value || selectedModel.value
})

const selectedModelConfig = computed(() => {
  return availableModels.value.find(m => m.value === selectedModel.value) || null
})

const isImageGenerateNode = computed(() => {
  return canvasStore.selectedNode?.type?.includes('to-image') || false
})

const availableImageSizes = computed(() => {
  if (!isImageGenerateNode.value) return []
  const cfg = selectedModelConfig.value || {}
  // [TEMP DEBUG] 排查 9000 端口开关在 3000 端口不生效问题，验证后删除
  console.log('[DEBUG availableImageSizes] model:', cfg?.value, 'pointsCost:', JSON.stringify(cfg?.pointsCost), 'resolutionEnabled:', JSON.stringify(cfg?.resolutionEnabled))
  const result = getAvailableImageResolutionOptions(cfg)
  console.log('[DEBUG availableImageSizes] result:', JSON.stringify(result))
  return result
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

const sanitizedTextNodeContent = computed(() => DOMPurify.sanitize(textNodeContent.value || ''))

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
  selectedSize.value = normalizeImageSelectedSize(selectedModelConfig.value || {}, selectedSize.value)
  showModelDropdown.value = false
  updateNodeData()
}

function selectSize(size) {
  selectedSize.value = size
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

  if (type.includes('to-image')) {
    return getImageResolutionCost(selectedModelConfig.value || {}, selectedSize.value)
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
  return getTotalUserPoints(userInfo.value)
})

// 同步节点数据
watch(() => canvasStore.selectedNode, (node) => {
  if (node) {
    inputText.value = node.data.text || ''
    if (node.data.model) selectedModel.value = node.data.model
    if (node.data.size) selectedSize.value = node.data.size
  }
}, { immediate: true })

watch([selectedModelConfig, availableImageSizes], () => {
  if (!isImageGenerateNode.value) return
  const nextSize = normalizeImageSelectedSize(selectedModelConfig.value || {}, selectedSize.value)
  if (nextSize !== selectedSize.value) {
    selectedSize.value = nextSize
    updateNodeData()
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
    await showAlert('请输入内容', '提示')
    return
  }

  // 检查积分
  if (userPoints.value < estimatedCost.value) {
    await showInsufficientPointsDialog(estimatedCost.value, userPoints.value)
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
  return isPreferredModelMediaUrl(str)
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
    } else if (url.startsWith('blob:')) {
      // 🔧 修复：blob URL 无法被外部 AI 服务访问，必须上传到云端
      console.log('[BottomPanel] blob URL 需要上传到云端:', url.substring(0, 60))
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`获取 blob 图片失败: ${response.status}`)
        const blob = await response.blob()
        const file = new File([blob], `blob_${Date.now()}.png`, { type: blob.type || 'image/png' })
        const urls = await uploadImages([file])
        if (urls && urls.length > 0) {
          console.log('[BottomPanel] blob 上传成功:', urls[0])
          accessibleUrls.push(urls[0])
        }
      } catch (error) {
        console.error('[BottomPanel] blob URL 处理失败:', error)
      }
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
    } else if (url.startsWith('data:image/')) {
      // 🔧 修复：base64 图片上传到云端
      console.log('[BottomPanel] base64 图片需要上传到云端')
      try {
        const matches = url.match(/^data:image\/(\w+);base64,(.+)$/)
        if (matches) {
          const imageType = matches[1]
          const base64Data = matches[2]
          const byteCharacters = atob(base64Data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          const blob = new Blob([byteArray], { type: `image/${imageType}` })
          const file = new File([blob], `base64_${Date.now()}.${imageType}`, { type: blob.type })
          const urls = await uploadImages([file])
          if (urls && urls.length > 0) {
            accessibleUrls.push(urls[0])
          }
        }
      } catch (error) {
        console.error('[BottomPanel] base64 处理失败:', error)
      }
    } else {
      console.warn('[BottomPanel] 未知 URL 格式:', url.substring(0, 60))
      console.warn('[BottomPanel] 未知 URL 格式，跳过:', url.substring(0, 60))
    }
  }
  
  return normalizeModelImageUrls(accessibleUrls).filter(isPreferredModelMediaUrl)
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
      if (accessibleUrls.length === 0) {
        throw new Error('参考图片未能转换为可访问 URL，请重新上传后重试')
      }
      console.log('[BottomPanel] 处理后的可访问 URLs:', accessibleUrls.length, '张')
      const effectiveAspectRatio = await resolveGenerationAspectRatio(selectedAspectRatio.value, accessibleUrls[0])
      
      // 图生图
      result = await generateImageFromImage({
        prompt: inputText.value,
        images: accessibleUrls,
        model: selectedModel.value,
        size: selectedSize.value,
        aspectRatio: effectiveAspectRatio,
        aspectRatioMode: selectedAspectRatio.value
      })
    } else {
      // 文生图
      result = await generateImageFromText({
        prompt: inputText.value,
        model: selectedModel.value,
        size: selectedSize.value,
        aspectRatio: await resolveGenerationAspectRatio(selectedAspectRatio.value, null),
        aspectRatioMode: selectedAspectRatio.value,
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
        timeout: 8 * 60 * 1000 // 8 分钟，与后端超时一致
      }).then(finalResult => {
        const urls = finalResult.urls || (finalResult.url ? [finalResult.url] : [])
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
          error: withNoChargeNotice(error.message, '生成失败')
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
      error: withNoChargeNotice(error.message, '生成失败')
    })
    alert(withNoChargeNotice(error.message, '生成失败，请重试'))
    isGenerating.value = false
  }
}

// 键盘快捷键
function handleKeyDown(event) {
  // Ctrl/Cmd + Enter 生成，普通 Enter 默认换行（textarea 浏览器原生行为）
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    handleGenerate()
  }
}
</script>

<template>
  <!-- 文本节点的配置面板已集成到 TextNode 内部，此处不再显示 -->
  <div class="canvas-bottom-panel" :class="{ 'text-node-panel': isTextNode }" v-if="canvasStore.selectedNode && !isTextNode && canvasStore.selectedNodeIds.length <= 1">
    
    <!-- 文本节点：内容预览区域 -->
    <div v-if="isTextNode && hasTextContent" class="text-preview-section">
      <!-- 左侧添加按钮 -->
      <button class="preview-add-btn preview-add-left" title="添加上游节点">
        <span>+</span>
      </button>
      
      <!-- 文本内容预览卡片 -->
      <div class="text-preview-card">
        <div class="text-preview-content" v-html="sanitizedTextNodeContent"></div>
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
            <ModelIcon
              :icon="selectedModelIcon"
              :label="selectedModelLabel"
              class="model-icon"
              :class="{ 'llm-icon': isTextNode }"
            />
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
                <div class="model-option-main">
                  <ModelIcon
                    :icon="model.icon"
                    :label="model.label"
                    class="model-option-icon"
                    :class="{ 'llm-icon': isTextNode }"
                  />
                  <span class="model-option-name">{{ model.label }}</span>
                  <div class="model-option-meta">
                    <span v-if="typeof model.pointsCost === 'number'" class="model-option-cost">💎{{ formatPoints(model.pointsCost) }}</span>
                    <div v-if="isTextNode && getEnabledLlmCapabilities(model).length" class="model-capability-row">
                      <span
                        v-for="capability in getEnabledLlmCapabilities(model)"
                        :key="capability.key"
                        class="model-capability-icon"
                        :class="`model-capability-icon--${capability.key}`"
                        :title="capability.label"
                        :aria-label="capability.label"
                      >
                        <svg v-if="capability.key === 'image'" class="model-capability-glyph model-capability-glyph--image" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <rect x="2.5" y="3" width="11" height="10" rx="1.6" stroke="currentColor" stroke-width="1.4"/>
                          <circle cx="6" cy="6.3" r="1.1" fill="currentColor"/>
                          <path d="M3.5 11.8L7 8.5l2.1 2 1.4-1.4 2.1 2.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <svg v-else-if="capability.key === 'video'" class="model-capability-glyph model-capability-glyph--video" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <rect x="2.5" y="4" width="11" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                          <path d="M6.2 2.2L8 4l1.8-1.8M6.4 13.8h3.2M8 12v1.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span v-else-if="capability.key === 'audio'" class="model-capability-glyph model-capability-glyph--audio" aria-hidden="true">♪</span>
                        <template v-else>{{ capability.icon }}</template>
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="model.description" class="model-option-desc">
                  {{ model.description }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="isImageGenerateNode && availableImageSizes.length > 0" class="size-selector">
            <button
              v-for="option in availableImageSizes"
              :key="option.value"
              class="size-option"
              :class="{ active: selectedSize === option.value }"
              type="button"
              @click="selectSize(option.value)"
            >
              <span>{{ option.label }}</span>
              <span class="size-cost">💎{{ formatPoints(option.pointsCost) }}</span>
            </button>
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
  flex-wrap: nowrap;
  justify-content: flex-start;
  gap: 12px;
  overflow: hidden;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.canvas-controls-left {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.canvas-controls-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
  margin-left: auto;
}

/* 模型选择器 */
.model-selector {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 1 240px;
  gap: 8px;
  min-width: 0;
  max-width: 320px;
  padding: 8px 12px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.model-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

/* 黑白灰风格图标 - 实色渐变 */
.model-icon {
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: none;
  text-shadow: none;
  filter: grayscale(1);
}

.model-icon.llm-icon {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.model-icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.model-icon-image-square {
  border-radius: 9px;
}

.model-icon-text {
  font-size: 14px;
  line-height: 1;
}

.model-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-option:hover {
  background: var(--canvas-bg-elevated, #242424);
}

.model-option.active {
  background: rgba(255, 255, 255, 0.07);
}

.model-option:last-child {
  border-bottom: 0;
}

.model-option-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-option-icon {
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: none;
  text-shadow: none;
  filter: grayscale(1);
}

.model-option-icon.llm-icon {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.model-option-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 14px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-option-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 5px;
  flex-shrink: 0;
  margin-left: auto;
  min-width: 48px;
}

.model-capability-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-height: 18px;
}

.model-capability-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.64);
  background: rgba(255, 255, 255, 0.04);
  font-family: system-ui, sans-serif;
  font-size: 12px;
  line-height: 1;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.model-capability-glyph {
  display: block;
  color: currentColor;
  flex-shrink: 0;
}

.model-capability-glyph--image,
.model-capability-glyph--video {
  width: 15px;
  height: 15px;
}

.model-capability-glyph--audio {
  font-size: 16px;
  line-height: 1;
  transform: translateY(-0.5px);
}

.model-option-desc {
  margin-left: 34px;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #888);
  line-height: 1.4;
}

/* 模型积分显示 - 黑白灰风格 */
.model-option-cost {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}

.size-selector {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  padding: 3px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 10px;
}

.size-option {
  min-width: 54px;
  height: 32px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 12px;
  line-height: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
}

.size-option.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--canvas-text-primary, #ffffff);
}

.size-cost {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
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
  background: var(--canvas-accent-primary, #3b82f6);
  color: white;
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

<style>
:root.canvas-theme-light .canvas-bottom-panel .model-icon,
:root.canvas-theme-light .canvas-bottom-panel .model-icon.llm-icon,
:root.canvas-theme-light .canvas-bottom-panel .model-option-icon,
:root.canvas-theme-light .canvas-bottom-panel .model-option-icon.llm-icon {
  color: #57534e;
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .canvas-bottom-panel .model-icon-text {
  color: #1c1917;
}
</style>
