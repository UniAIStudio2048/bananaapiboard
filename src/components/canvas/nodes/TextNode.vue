<script setup>
/**
 * TextNode.vue - 文本输入节点
 * 支持三种状态：空状态（快捷操作）、待编辑状态、编辑模式
 * 底部配置面板集成在节点内，紧贴节点卡片
 */
import { ref, computed, watch, nextTick, inject, onMounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getLLMConfig, chatWithLLM } from '@/api/canvas/llm'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals } = useVueFlow()

// 本地文本状态
const localText = ref(props.data.text || '')

// 节点状态：'empty' | 'ready' | 'editing'
const nodeState = ref(localText.value ? 'ready' : 'empty')

// 标签编辑状态
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data.label || 'Text')

// 编辑模式
const isEditing = ref(false)
const textareaRef = ref(null)

// 节点尺寸 - 文本节点使用宽矩形，适合内容编辑
const nodeWidth = ref(props.data.width || 400)
const nodeHeight = ref(props.data.height || 280)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null) // 'right' | 'bottom' | 'corner'
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 当前格式状态
const formatState = ref({
  bold: false,
  italic: false,
  underline: false,
  fontSize: 14
})

// ========== LLM 配置相关 ==========
const llmInputText = ref('')
const selectedModel = ref('gemini-2.5-pro')
const selectedPreset = ref('') // 选中的功能预设
const selectedLanguage = ref('zh') // 选中的语言
const isGenerating = ref(false)
const showModelDropdown = ref(false)
const showPresetDropdown = ref(false) // 功能预设下拉菜单
const showLanguageDropdown = ref(false) // 语言下拉菜单
const llmInputRef = ref(null)

// 下拉菜单方向（true = 向上弹出，false = 向下弹出）
const modelDropdownUp = ref(true)
const presetDropdownUp = ref(true)
const languageDropdownUp = ref(true)

// 下拉菜单容器引用
const modelSelectorRef = ref(null)
const presetSelectorRef = ref(null)
const languageSelectorRef = ref(null)

// LLM 配置
const llmConfig = ref({
  enabled: false,
  models: [],
  presets: [], // 功能预设列表
  languages: [], // 支持的语言列表
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
    console.error('[TextNode] 加载 LLM 配置失败:', error)
  }
}

// 可用模型列表
const availableModels = computed(() => {
  if (llmConfig.value.models && llmConfig.value.models.length > 0) {
    return llmConfig.value.models.map(m => ({
      value: m.id,
      label: m.name,
      icon: m.icon || 'G',
      pointsCost: m.pointsCost
    }))
  }
  return [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5', icon: 'G', pointsCost: 1 },
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro', icon: 'G', pointsCost: 2 },
    { value: 'gpt-4o', label: 'GPT-4o', icon: 'O', pointsCost: 3 },
    { value: 'claude-3', label: 'Claude 3', icon: 'C', pointsCost: 2 }
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

// 格式化积分显示（支持小数点后2位）
const formattedModelCost = computed(() => {
  const cost = currentModelCost.value
  // 如果是整数，直接显示整数
  if (Number.isInteger(cost)) {
    return cost.toString()
  }
  // 否则显示最多2位小数，去除末尾的0
  return parseFloat(cost.toFixed(2)).toString()
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 检测下拉菜单方向（基于元素位置和屏幕空间）
function checkDropdownDirection(element, dropdownHeight = 250) {
  if (!element) return true // 默认向上
  const rect = element.getBoundingClientRect()
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  // 如果下方空间足够或下方空间比上方大，则向下弹出
  return spaceBelow < dropdownHeight && spaceAbove > spaceBelow
}

// 切换模型下拉菜单
function toggleModelDropdown(event) {
  event?.stopPropagation()
  if (!showModelDropdown.value) {
    modelDropdownUp.value = checkDropdownDirection(modelSelectorRef.value, 200)
  }
  showModelDropdown.value = !showModelDropdown.value
  showPresetDropdown.value = false
  showLanguageDropdown.value = false
}

// 选择模型
function selectModel(modelValue) {
  selectedModel.value = modelValue
  showModelDropdown.value = false
}

// 可用功能预设列表
const availablePresets = computed(() => {
  if (llmConfig.value.presets && llmConfig.value.presets.length > 0) {
    return llmConfig.value.presets
  }
  return []
})

// 当前选中预设的名称
const selectedPresetLabel = computed(() => {
  if (!selectedPreset.value) return '通用对话'
  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  return preset ? preset.name : '通用对话'
})

// 切换功能预设下拉菜单
function togglePresetDropdown(event) {
  event?.stopPropagation()
  if (!showPresetDropdown.value) {
    presetDropdownUp.value = checkDropdownDirection(presetSelectorRef.value, 200)
  }
  showPresetDropdown.value = !showPresetDropdown.value
  showLanguageDropdown.value = false
  showModelDropdown.value = false
}

// 选择功能预设
function selectPreset(presetId) {
  selectedPreset.value = presetId
  showPresetDropdown.value = false
}

// 可用语言列表
const availableLanguages = computed(() => {
  if (llmConfig.value.languages && llmConfig.value.languages.length > 0) {
    return llmConfig.value.languages
  }
  return [
    { code: 'zh', name: '中文' },
    { code: 'en', name: 'English' }
  ]
})

// 当前选中语言的名称
const selectedLanguageLabel = computed(() => {
  const language = availableLanguages.value.find(l => l.code === selectedLanguage.value)
  return language ? language.name : '中文'
})

// 切换语言下拉菜单
function toggleLanguageDropdown(event) {
  event?.stopPropagation()
  if (!showLanguageDropdown.value) {
    languageDropdownUp.value = checkDropdownDirection(languageSelectorRef.value, 150)
  }
  showLanguageDropdown.value = !showLanguageDropdown.value
  showPresetDropdown.value = false
  showModelDropdown.value = false
}

// 选择语言
function selectLanguage(languageCode) {
  selectedLanguage.value = languageCode
  showLanguageDropdown.value = false
}

// 动态获取上游节点的数据（支持实时更新）
const upstreamNodes = computed(() => canvasStore.getUpstreamNodes(props.id))

// 单独收集上游视频 URL（用于显示视频缩略图）
const upstreamVideoUrls = computed(() => {
  const videos = []
  for (const node of upstreamNodes.value) {
    const nodeType = node.type || ''
    
    if (nodeType === 'video' || nodeType === 'video-input' || nodeType === 'video-gen') {
      if (node.data?.output?.url) {
        videos.push(node.data.output.url)
      } else if (node.data?.sourceVideo) {
        videos.push(node.data.sourceVideo)
      } else if (node.data?.videoUrl) {
        videos.push(node.data.videoUrl)
      }
    }
  }
  return videos
})

// 单独收集上游图片 URL
const upstreamImageUrls = computed(() => {
  const images = []
  for (const node of upstreamNodes.value) {
    const nodeType = node.type || ''
    
    // 跳过视频节点
    if (nodeType === 'video' || nodeType === 'video-input' || nodeType === 'video-gen') {
      continue
    }
    
    // 图片输入节点
    if (node.data?.sourceImages?.length) {
      images.push(...node.data.sourceImages)
    } else if (node.data?.images?.length) {
      images.push(...node.data.images)
    }
    // 图片生成节点的输出
    else if (node.data?.output?.urls?.length) {
      images.push(...node.data.output.urls)
    }
  }
  return images
})

// 上游媒体类型：'video' | 'image' | 'mixed' | null
const upstreamMediaType = computed(() => {
  const hasVideos = upstreamVideoUrls.value.length > 0
  const hasImages = upstreamImageUrls.value.length > 0
  
  if (hasVideos && hasImages) return 'mixed'
  if (hasVideos) return 'video'
  if (hasImages) return 'image'
  return null
})

// 参考区域标签文本
const referenceLabel = computed(() => {
  switch (upstreamMediaType.value) {
    case 'video': return '参考视频'
    case 'image': return '参考图片'
    case 'mixed': return '参考文件'
    default: return '参考图片'
  }
})

// 从上游节点收集所有图片和视频（视频也通过 image_url 传递给大模型）
const upstreamImages = computed(() => {
  // 合并视频和图片 URL
  return [...upstreamVideoUrls.value, ...upstreamImageUrls.value]
})

// 提取纯文本，去除HTML标签和样式
function extractPlainText(htmlContent) {
  if (!htmlContent) return ''
  
  // 创建临时 div 元素来解析 HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = htmlContent
  
  // 使用 innerText 获取纯文本（会保留换行，但去除HTML标签）
  return tempDiv.innerText || tempDiv.textContent || ''
}

// 从上游节点收集文本内容
const upstreamText = computed(() => {
  const texts = []
  for (const node of upstreamNodes.value) {
    let textContent = ''
    
    // 文本节点
    if (node.data?.text) {
      textContent = node.data.text
    }
    // LLM 输出
    else if (node.data?.output?.content) {
      textContent = node.data.output.content
    }
    // llmResponse
    else if (node.data?.llmResponse) {
      textContent = node.data.llmResponse
    }
    
    // 提取纯文本（去除HTML标签和样式）
    if (textContent) {
      const plainText = extractPlainText(textContent)
      if (plainText.trim()) {
        texts.push(plainText)
      }
    }
  }
  return texts.join('\n\n')
})

// 检查是否有上游连接（通过检查边）
const hasUpstreamEdge = computed(() => {
  return canvasStore.edges.some(edge => edge.target === props.id)
})

// 兼容旧的 inheritedData（仅在有上游连接时使用）
const inheritedContent = computed(() => props.data.inheritedData || null)
// 当连接被删除后，不使用继承数据作为后备
const inheritedText = computed(() => {
  // 只有在有上游连接时才考虑返回文本
  if (!hasUpstreamEdge.value) return ''
  return upstreamText.value || ''
})
const inheritedImages = computed(() => {
  // 只有在有上游连接时才考虑返回图片
  if (!hasUpstreamEdge.value) return []
  return upstreamImages.value
})
const hasUpstreamInput = computed(() => inheritedText.value || inheritedImages.value.length > 0)

// 处理 LLM 对话
async function handleLLMGenerate() {
  // 获取当前节点上方显示的文本内容（作为上轮对话）
  const currentNodeTextRaw = props.data.llmResponse || localText.value
  // 提取纯文本，去除HTML标签
  const currentNodeText = extractPlainText(currentNodeTextRaw)
  
  // 检查积分（移除空值检查，允许任何情况下发送）
  if (userPoints.value < currentModelCost.value) {
    alert(t('imageGen.insufficientPoints'))
    return
  }
  
  isGenerating.value = true
  
  try {
    // 构建消息列表，包含上游内容和当前节点内容作为上下文
    const messages = []
    
    // 如果有上游文本内容，作为更早的上下文（已经是纯文本）
    if (inheritedText.value) {
      messages.push({
        role: 'assistant',
        content: inheritedText.value
      })
    }
    
    // 如果当前节点上方有文本内容（手写的或生成的），作为上一轮对话
    if (currentNodeText) {
      messages.push({
        role: 'assistant',
        content: currentNodeText
      })
    }
    
    // 当前用户输入
    // 如果没有输入且有上方内容，默认提示词
    // 如果完全没有内容，也允许发送（让 LLM 自由发挥）
    const userMessage = {
      role: 'user',
      content: llmInputText.value || (currentNodeText ? '请基于上方的内容继续' : '你好')
    }
    
    // 如果有上游图片，需要先上传到七牛云获取 URL
    let processedImages = []
    if (inheritedImages.value.length > 0) {
      console.log('[TextNode] 检测到参考图片，开始上传到七牛云...', inheritedImages.value)
      
      try {
        // 上传图片到七牛云
        const uploadedUrls = await uploadImagesToQiniu(inheritedImages.value)
        processedImages = uploadedUrls
        console.log('[TextNode] 图片上传成功:', uploadedUrls)
        
        // 将图片 URL 添加到用户消息中
        userMessage.images = processedImages
      } catch (uploadError) {
        console.error('[TextNode] 图片上传失败:', uploadError)
        throw new Error('图片上传失败，请重试')
      }
    }
    
    messages.push(userMessage)
    
    canvasStore.updateNodeData(props.id, {
      text: llmInputText.value,
      status: 'processing',
      llmResponse: '' // 清空之前的响应
    })
    
    // 使用非流式模式调用 LLM API（避免流式输出导致的状态闪烁问题）
    try {
      const result = await chatWithLLM({
        messages,
        model: selectedModel.value,
        preset: selectedPreset.value || undefined,
        language: selectedLanguage.value || 'zh',
        images: processedImages.length > 0 ? processedImages : undefined,
        stream: false // 禁用流式输出
      })
      
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'text',
          content: result.result
        },
        llmResponse: result.result
      })
      
      // 刷新用户积分
      window.dispatchEvent(new CustomEvent('user-info-updated'))
    } catch (llmError) {
      console.error('[TextNode] LLM 对话失败:', llmError)
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: llmError.message || 'LLM 对话失败'
      })
      alert(llmError.message || 'LLM 对话失败，请重试')
    } finally {
      isGenerating.value = false
    }
    
  } catch (error) {
    console.error('[TextNode] LLM 对话失败:', error)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message || 'LLM 对话失败'
    })
    alert(error.message || 'LLM 对话失败，请重试')
    isGenerating.value = false
  }
}

// 上传图片到七牛云
async function uploadImagesToQiniu(imageUrls) {
  const uploadedUrls = []
  
  for (const imageUrl of imageUrls) {
    try {
      // 如果已经是七牛云 URL，直接使用
      if (imageUrl.includes('qiniucdn.com') || imageUrl.includes('clouddn.com')) {
        uploadedUrls.push(imageUrl)
        continue
      }
      
      // 下载图片数据
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      
      // 构造 FormData
      const formData = new FormData()
      formData.append('images', blob, `reference_${Date.now()}.jpg`)
      
      // 上传到后端（后端会转存到七牛云）
      const token = localStorage.getItem('token')
      const uploadResponse = await fetch(getApiUrl('/api/images/upload'), {
        method: 'POST',
        headers: {
          ...getTenantHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      })
      
      if (!uploadResponse.ok) {
        throw new Error('上传失败')
      }
      
      const uploadResult = await uploadResponse.json()
      if (uploadResult.urls && uploadResult.urls.length > 0) {
        uploadedUrls.push(uploadResult.urls[0])
      } else {
        throw new Error('上传返回数据异常')
      }
    } catch (error) {
      console.error('[TextNode] 单张图片上传失败:', error, imageUrl)
      // 如果上传失败，尝试直接使用原 URL
      uploadedUrls.push(imageUrl)
    }
  }
  
  return uploadedUrls
}

// 键盘快捷键
function handleLLMKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleLLMGenerate()
  }
}

// 初始化加载 LLM 配置
onMounted(() => {
  loadLLMConfig()
  
  // 如果节点数据中指定了预设，自动选择该预设
  if (props.data.selectedPreset) {
    selectedPreset.value = props.data.selectedPreset
    console.log('[TextNode] 自动选择预设:', props.data.selectedPreset)
  }
})

// 节点样式类
const nodeClass = computed(() => ({
  'text-node': true,
  'selected': props.selected,
  'editing': isEditing.value,
  'resizing': isResizing.value
}))

// 节点卡片样式
const cardStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  height: `${nodeHeight.value}px`
}))

// 同步本地状态到 store
watch(localText, (newText) => {
  canvasStore.updateNodeData(props.id, { text: newText })
})

// 同步尺寸到 store
watch([nodeWidth, nodeHeight], ([width, height]) => {
  canvasStore.updateNodeData(props.id, { width, height })
})

// 同步 store 到本地状态
watch(() => props.data.text, (newText) => {
  if (newText !== localText.value) {
    localText.value = newText || ''
    nodeState.value = newText ? 'ready' : 'empty'
  }
})

// 同步 store 尺寸到本地
watch(() => [props.data.width, props.data.height], ([width, height]) => {
  if (width && width !== nodeWidth.value) nodeWidth.value = width
  if (height && height !== nodeHeight.value) nodeHeight.value = height
}, { immediate: true })

// 监听节点选中状态变化，取消选中时关闭所有下拉菜单
watch(() => props.selected, (newSelected) => {
  if (!newSelected) {
    // 节点取消选中时，关闭所有下拉菜单
    showModelDropdown.value = false
    showPresetDropdown.value = false
    showLanguageDropdown.value = false
    showLeftMenu.value = false
  }
})

// 同步 label 变化
watch(() => props.data.label, (newLabel) => {
  if (newLabel !== undefined && newLabel !== localLabel.value) {
    localLabel.value = newLabel
  }
})

// 双击标签进入编辑模式
function handleLabelDoubleClick(event) {
  event.stopPropagation()
  isEditingLabel.value = true
  nextTick(() => {
    if (labelInputRef.value) {
      labelInputRef.value.focus()
      labelInputRef.value.select()
    }
  })
}

// 保存标签
function saveLabelEdit() {
  isEditingLabel.value = false
  const newLabel = localLabel.value.trim() || 'Text'
  localLabel.value = newLabel
  canvasStore.updateNodeData(props.id, { label: newLabel })
}

// 标签输入框键盘事件
function handleLabelKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveLabelEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    isEditingLabel.value = false
    localLabel.value = props.data.label || 'Text'
  }
}

// 快捷操作 - 点击后创建对应的新节点（使用翻译键，在模板中翻译）
const quickActions = [
  { icon: '✎', labelKey: 'canvas.textNode.writeContent', action: () => handlePrepareEdit() },
  { icon: '▶', labelKey: 'canvas.textNode.textToVideo', action: () => createNextNode('video-gen', t('canvas.textNode.videoGen')) },
  { icon: 'A+', labelKey: 'canvas.textNode.imageDescribePrompt', action: () => handleImageDescribe() },
  { icon: '♪', labelKey: 'canvas.textNode.textToMusic', action: () => createNextNode('audio-gen', t('canvas.textNode.audioGen')) }
]

// 格式工具栏按钮（使用翻译键，在模板中翻译）
const formatButtons = [
  { icon: 'B', titleKey: 'canvas.textNode.bold', action: () => toggleFormat('bold'), format: 'bold', style: 'font-weight: bold' },
  { icon: 'I', titleKey: 'canvas.textNode.italic', action: () => toggleFormat('italic'), format: 'italic', style: 'font-style: italic' },
  { icon: 'U', titleKey: 'canvas.textNode.underline', action: () => toggleFormat('underline'), format: 'underline', style: 'text-decoration: underline' },
  { type: 'divider' },
  { icon: 'H₁', titleKey: 'canvas.textNode.heading1', action: () => setFontSize(24) },
  { icon: 'H₂', titleKey: 'canvas.textNode.heading2', action: () => setFontSize(20) },
  { icon: 'H₃', titleKey: 'canvas.textNode.heading3', action: () => setFontSize(16) },
  { type: 'divider' },
  { icon: '⧉', titleKey: 'canvas.textNode.copy', action: () => copyText() },
  { icon: '⛶', titleKey: 'canvas.textNode.fullscreen', action: () => toggleFullscreen() }
]

// 准备编辑（点击"自己编写内容"）
function handlePrepareEdit() {
  nodeState.value = 'ready'
  canvasStore.selectNode(props.id)
}

// 进入编辑模式（双击）- 支持回调函数
function handleEdit(callback) {
  isEditing.value = true
  nodeState.value = 'editing'
  canvasStore.selectNode(props.id)
  canvasStore.isBottomPanelVisible = false
  
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      // 优先使用当前显示的内容（LLM 输出或用户输入的文本）
      // 如果有 LLM 响应，编辑 LLM 响应的内容
      // 否则编辑 localText 的内容
      const contentToEdit = props.data.llmResponse || localText.value
      if (contentToEdit) {
        textareaRef.value.innerHTML = contentToEdit
        // 如果编辑的是 LLM 响应，同时更新 localText，以便保存编辑结果
        if (props.data.llmResponse) {
          localText.value = props.data.llmResponse
        }
      }
      
      // 如果有回调函数，等待DOM更新后执行
      if (callback) {
        nextTick(() => {
          callback()
        })
      }
    }
  })
}

// 处理输入
function handleInput(event) {
  localText.value = event.target.innerHTML
}

// 退出编辑模式（失焦）
function handleBlur() {
  if (!localText.value.trim()) {
    nodeState.value = 'empty'
  } else {
    nodeState.value = 'ready'
  }
  isEditing.value = false
  
  // 如果编辑的是 LLM 响应的内容，清除 LLM 响应，使用 localText 作为内容源
  // 这样用户编辑后的内容会正确显示，避免 LLM 响应和编辑内容混淆
  if (props.data.llmResponse && localText.value) {
    canvasStore.updateNodeData(props.id, {
      llmResponse: null,
      text: localText.value
    })
  }
  
  // 退出编辑模式后，重新显示底部 LLM 配置面板
  canvasStore.isBottomPanelVisible = true
}

// 创建下一个节点（快捷操作使用）
function createNextNode(nodeType, title, subType = null) {
  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在右侧创建新节点
  const newNodePosition = {
    x: currentNode.position.x + 450,
    y: currentNode.position.y
  }
  
  // 创建新节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const nodeData = {
    title,
    type: subType || nodeType
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: nodeType,
    position: newNodePosition,
    data: nodeData
  })
  
  // 自动连接
  canvasStore.addEdge({
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中新节点
  canvasStore.selectNode(newNodeId)
}

// 处理"图片反推提示词"功能
function handleImageDescribe() {
  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在左侧创建图片节点
  const imageNodePosition = {
    x: currentNode.position.x - 350,
    y: currentNode.position.y - 50
  }
  
  const imageNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // 获取默认图片（网站 logo）
  const defaultImage = '/logo.svg'
  
  canvasStore.addNode({
    id: imageNodeId,
    type: 'image-input',
    position: imageNodePosition,
    data: {
      title: '参考图片',
      sourceImages: [defaultImage], // 默认显示网站 logo
      status: 'success' // 标记为已有图片
    }
  })
  
  // 连接图片节点到当前文本节点
  canvasStore.addEdge({
    source: imageNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 切换当前文本节点的预设到"图片反推"
  // 查找"图片反推"相关的预设
  const imageDescribePreset = availablePresets.value.find(
    p => p.id === 'image-describe' || p.name?.includes('图片') || p.name?.includes('反推')
  )
  
  if (imageDescribePreset) {
    selectedPreset.value = imageDescribePreset.id
  }
  
  // 设置提示文本
  llmInputText.value = '请详细描述这张图片的内容'
  
  // 切换到准备状态
  nodeState.value = 'ready'
  
  // 选中当前文本节点（保持焦点在文本节点上）
  canvasStore.selectNode(props.id)
  
  // 自动聚焦输入框
  nextTick(() => {
    if (llmInputRef.value) {
      llmInputRef.value.focus()
    }
  })
}

// 切换格式（粗体、斜体、下划线）- 优化版
function toggleFormat(format) {
  // 如果不在编辑模式，先进入编辑模式
  if (!isEditing.value) {
    handleEdit(() => {
      // 编辑器准备好后，应用格式到全部内容
      applyFormat(format)
    })
    return
  }
  
  applyFormat(format)
}

// 应用格式的实际逻辑
function applyFormat(format) {
  if (!textareaRef.value) return
  
  // 阻止失焦
  event?.preventDefault()
  
  // 保存当前选区
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
  const range = selection.getRangeAt(0)
  const wasCollapsed = range.collapsed // 记录是否没有选中文字
  
  // 如果没有选中文字，作用于所有内容
  if (wasCollapsed) {
    range.selectNodeContents(textareaRef.value)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  
  // 使用 document.execCommand 实时应用格式
  document.execCommand(format, false, null)
  
  formatState.value[format] = !formatState.value[format]
  
  // 如果原本没有选中（我们刚才自动全选的），取消选中状态
  if (wasCollapsed) {
    range.collapse(false) // 光标移到末尾
    selection.removeAllRanges()
    selection.addRange(range)
  }
  // 如果原本有选中，execCommand 会自动保持选中状态
  
  // 直接保持焦点，不使用nextTick
  textareaRef.value.focus()
}

// 设置字体大小（极致优化版：直接修改样式，避免DOM重建）
function setFontSize(size) {
  // 如果不在编辑模式，先进入编辑模式
  if (!isEditing.value) {
    handleEdit(() => {
      // 编辑器准备好后，应用字体大小到全部内容
      applyFontSize(size)
    })
    return
  }
  
  applyFontSize(size)
}

// 应用字体大小的实际逻辑
function applyFontSize(size) {
  if (!textareaRef.value) return
  
  event?.preventDefault()
  
  formatState.value.fontSize = size
  const selection = window.getSelection()
  
  // 如果没有 selection 或没有 rangeCount，先创建选区
  if (!selection || selection.rangeCount === 0) {
    // 自动全选所有内容
    const range = document.createRange()
    range.selectNodeContents(textareaRef.value)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  
  const range = selection.getRangeAt(0)
  const wasCollapsed = range.collapsed
  
  // 如果没有选中文字（光标在编辑器中），自动全选所有内容
  if (wasCollapsed) {
    const newRange = document.createRange()
    newRange.selectNodeContents(textareaRef.value)
    selection.removeAllRanges()
    selection.addRange(newRange)
  }
  
  // 获取当前选区（现在肯定有选中的内容了）
  const currentRange = selection.getRangeAt(0)
  
  // 提取选中的内容
  const fragment = currentRange.extractContents()
  
  // 创建一个包装容器来应用字体大小
  const span = document.createElement('span')
  span.style.fontSize = `${size}px`
  
  // 清除内部所有元素的字号样式，确保新字号生效
  const clearInlineFontSize = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.style && node.style.fontSize) {
        node.style.fontSize = ''
      }
      Array.from(node.childNodes).forEach(clearInlineFontSize)
    }
  }
  clearInlineFontSize(fragment)
  
  span.appendChild(fragment)
  currentRange.insertNode(span)
  
  // 移动光标到内容末尾
  currentRange.setStartAfter(span)
  currentRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(currentRange)
  
  // 更新本地文本
  localText.value = textareaRef.value.innerHTML
  
  // 保持焦点
  textareaRef.value.focus()
}

function copyText() {
  event?.preventDefault()
  // 复制功能在非编辑模式下也可以工作
  const text = textareaRef.value?.innerText || localText.value || props.data.llmResponse || ''
  navigator.clipboard.writeText(text)
  
  // 如果在编辑模式，恢复焦点
  if (isEditing.value) {
    textareaRef.value?.focus()
  }
}

function toggleFullscreen() {
  event?.preventDefault()
  
  // 如果不在编辑模式，先进入编辑模式
  if (!isEditing.value) {
    handleEdit()
  }
  
  // TODO: 实现全屏功能
  
  // 如果在编辑模式，恢复焦点
  if (isEditing.value) {
    textareaRef.value?.focus()
  }
}

// 打开右键菜单
function handleContextMenu(event) {
  // 如果在编辑模式且右键点击的是编辑器，显示浏览器原生右键菜单（支持复制粘贴）
  if (isEditing.value && textareaRef.value?.contains(event.target)) {
    return // 不阻止默认行为，显示浏览器原生菜单
  }
  
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'text-input', position: { x: 0, y: 0 }, data: props.data }
  )
}

// ========== 添加按钮交互（单击/长按） ==========
const LONG_PRESS_DURATION = 300 // 长按阈值（毫秒）
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

// 左侧快捷操作菜单显示状态
const showLeftMenu = ref(false)

// 左侧快捷操作列表（添加上游输入）- 使用翻译键
const leftQuickActions = [
  { icon: 'A+', labelKey: 'canvas.textNode.promptEnhance', action: () => createUpstreamNode('text-input', t('canvas.textNode.promptEnhance'), 'prompt-enhance') },
  { icon: '◎', labelKey: 'canvas.textNode.imageReverse', action: () => createUpstreamNode('image-input', t('canvas.textNode.imageReverse')) },
  { icon: '▷', labelKey: 'canvas.textNode.videoReverse', action: () => createUpstreamNode('video-input', t('canvas.textNode.videoReverse')) },
  { icon: '♪', labelKey: 'canvas.textNode.audioToText', action: () => createUpstreamNode('audio-input', t('canvas.textNode.audioToText')) },
  { icon: '◈', labelKey: 'canvas.textNode.videoToText', action: () => createUpstreamNode('video-text-extract', t('canvas.textNode.videoToText')) }
]

// 左侧添加按钮 - 单击显示快捷菜单
function handleAddLeftClick(event) {
  event.stopPropagation()
  showLeftMenu.value = !showLeftMenu.value
}

// 监听点击外部关闭左侧菜单
watch(showLeftMenu, (newValue) => {
  if (newValue) {
    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', closeLeftMenu)
    }, 100)
  } else {
    document.removeEventListener('click', closeLeftMenu)
  }
})

// 关闭左侧菜单
function closeLeftMenu() {
  showLeftMenu.value = false
}

// 创建上游节点（连接到当前节点的左侧）
function createUpstreamNode(nodeType, title, preset = null) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在左侧创建新节点
  const newNodePosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y
  }
  
  // 创建节点数据
  const nodeData = { title }
  if (preset) {
    nodeData.selectedPreset = preset
  }
  
  // 创建新节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: nodeType,
    position: newNodePosition,
    data: nodeData
  })
  
  // 创建连接：新节点 → 当前节点
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id
  })
  
  // 更新当前节点状态
  canvasStore.updateNodeData(props.id, {
    hasUpstream: true,
    inheritedFrom: newNodeId
  })
  
  // 关闭菜单
  showLeftMenu.value = false
  
  console.log('[TextNode] 创建上游节点:', { nodeType, title, preset, newNodeId })
}

// 右侧添加按钮 - 鼠标按下（开始检测长按）
function handleAddRightMouseDown(event) {
  event.stopPropagation()
  event.preventDefault()
  
  isLongPress = false
  pressStartPos = { x: event.clientX, y: event.clientY }
  
  // 设置长按定时器
  pressTimer = setTimeout(() => {
    isLongPress = true
    // 长按：开始拖拽连线
    startDragConnection(event)
  }, LONG_PRESS_DURATION)
  
  // 添加鼠标移动和释放监听
  document.addEventListener('mousemove', handleAddRightMouseMove)
  document.addEventListener('mouseup', handleAddRightMouseUp)
}

// 右侧添加按钮 - 鼠标移动（如果移动了就取消长按检测，开始连线）
function handleAddRightMouseMove(event) {
  const dx = event.clientX - pressStartPos.x
  const dy = event.clientY - pressStartPos.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // 如果移动超过 5px，认为是拖拽，立即开始连线
  if (distance > 5 && !isLongPress) {
    clearTimeout(pressTimer)
    isLongPress = true
    startDragConnection(event)
  }
}

// 右侧添加按钮 - 鼠标释放
function handleAddRightMouseUp(event) {
  clearTimeout(pressTimer)
  document.removeEventListener('mousemove', handleAddRightMouseMove)
  document.removeEventListener('mouseup', handleAddRightMouseUp)
  
  if (!isLongPress) {
    // 短按：打开节点选择器
    openNodeSelectorForRight(event)
  }
  // 长按的连线结束由 CanvasBoard 处理
}

// 打开右侧节点选择器
function openNodeSelectorForRight(event) {
  const rect = event.target.getBoundingClientRect()
  canvasStore.openNodeSelector(
    { x: rect.right + 10, y: rect.top },
    'node',
    props.id
  )
}

// 开始拖拽连线 - 直接调用 store 方法
function startDragConnection(event) {
  // 获取当前节点在 store 中的数据
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    console.warn('[TextNode] 未找到当前节点')
    return
  }
  
  // 计算节点右侧输出端口的画布坐标（从节点位置计算）
  // 节点位置 + 节点宽度 = 右侧边缘，Y 轴在节点中间 + 标签高度偏移
  const currentNodeWidth = props.data?.width || nodeWidth.value || 400
  const currentNodeHeight = props.data?.height || nodeHeight.value || 280
  const labelOffset = 28 // 标签高度偏移
  
  const outputX = currentNode.position.x + currentNodeWidth
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[TextNode] 开始拖拽连线，起始位置:', { outputX, outputY, nodePosition: currentNode.position })
  
  // 调用 store 开始拖拽连线，使用节点输出端口位置作为起点
  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
}

// 右侧添加按钮 - 兼容旧的点击事件（备用）
function handleAddRightClick(event) {
  // 由 mousedown/mouseup 处理，这里不做任何事
  event.stopPropagation()
}

// 以下是旧代码保留的部分
function createImageGenNode() {
  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在右侧创建图片生成节点
  const newNodePosition = {
    x: currentNode.position.x + 450, // 文本节点宽度 + 间距
    y: currentNode.position.y
  }
  
  // 创建图片生成节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: 'image-gen',
    position: newNodePosition,
    data: {
      title: '图片生成'
    }
  })
  
  // 自动连接
  canvasStore.addEdge({
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
}

// 点击节点时选中，并显示底部 LLM 配置面板
function handleNodeClick(e) {
  // 如果点击的是编辑器区域，不阻止事件，让编辑器正常工作
  if (isEditing.value && textareaRef.value?.contains(e.target)) {
    return // 让编辑器自己处理点击事件
  }
  
  e.stopPropagation()
  canvasStore.selectNode(props.id)
  // 显示底部配置面板（用于 LLM 对话）
  canvasStore.isBottomPanelVisible = true
}

// 双击进入编辑模式
function handleDoubleClick(e) {
  // 如果已经在编辑模式且点击的是编辑器，不处理（让编辑器自己处理双击选词）
  if (isEditing.value && textareaRef.value?.contains(e.target)) {
    return
  }
  
  e.stopPropagation()
  // 任何状态下双击都进入编辑模式
  handleEdit()
}

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
  
  // 计算新尺寸（考虑缩放）
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
  
  // 更新节点内部状态，确保连线位置跟随 Handle 位置变化
  nextTick(() => {
    updateNodeInternals(props.id)
  })
  
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu" @click="handleNodeClick">
    <!-- 输入端口 (隐藏但保留给 Vue Flow 用于边渲染) -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 格式工具栏（选中节点时显示） -->
    <div v-if="selected" class="format-toolbar">
      <template v-for="(btn, index) in formatButtons" :key="index">
        <div v-if="btn.type === 'divider'" class="toolbar-divider"></div>
        <button 
          v-else
          class="toolbar-btn"
          :class="{ active: formatState[btn.format] }"
          :style="btn.style"
          :title="t(btn.titleKey)"
          @mousedown.prevent="btn.action"
        >
          {{ btn.icon }}
        </button>
      </template>
    </div>
    
    <!-- 节点头部标题 -->
    <div 
      v-if="!isEditingLabel" 
      class="text-node-label"
      @dblclick="handleLabelDoubleClick"
      :title="'双击重命名'"
    >
      {{ localLabel }}
    </div>
    <input
      v-else
      ref="labelInputRef"
      v-model="localLabel"
      type="text"
      class="text-node-label-input"
      @blur="saveLabelEdit"
      @keydown="handleLabelKeyDown"
      @click.stop
      @mousedown.stop
    />
    
    <!-- 节点主体卡片容器 -->
    <div class="text-node-card-wrapper">
      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加上游输入"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 左侧快捷操作菜单 -->
      <div v-if="showLeftMenu" class="left-quick-menu" @click.stop>
        <div 
          v-for="(action, index) in leftQuickActions" 
          :key="index"
          class="left-quick-menu-item"
          @click="action.action"
        >
          <span class="left-menu-icon">{{ action.icon }}</span>
          <span class="left-menu-label">{{ t(action.labelKey) }}</span>
        </div>
      </div>
      
      <!-- 节点主体卡片 -->
      <div class="text-node-card" :class="{ 'is-processing': isGenerating || props.data.status === 'processing' }" :style="cardStyle" @dblclick="handleDoubleClick">
        <!-- 彗星环绕发光特效（生成中显示） -->
        <svg v-if="isGenerating || props.data.status === 'processing'" class="comet-border" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <!-- 彗星渐变 -->
            <linearGradient id="text-comet-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="transparent" />
              <stop offset="70%" stop-color="rgba(74, 222, 128, 0.3)" />
              <stop offset="90%" stop-color="rgba(74, 222, 128, 0.8)" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <!-- 发光滤镜 -->
            <filter id="text-comet-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <!-- 底层发光边框 -->
          <rect 
            x="1" y="1" width="98" height="98" rx="8" ry="8"
            fill="none" 
            stroke="rgba(74, 222, 128, 0.15)" 
            stroke-width="1"
          />
          <!-- 彗星轨迹 -->
          <rect 
            class="comet-path"
            x="1" y="1" width="98" height="98" rx="8" ry="8"
            fill="none" 
            stroke="url(#text-comet-gradient)" 
            stroke-width="2"
            stroke-linecap="round"
            filter="url(#text-comet-glow)"
          />
        </svg>
        
        <!-- 编辑模式：可编辑的富文本区域 -->
        <div 
          v-if="isEditing" 
          ref="textareaRef"
          class="editor-content"
          contenteditable="true"
          placeholder="请输入文本内容..."
          @blur="handleBlur"
          @input="handleInput"
          @mousedown.stop
          @mousemove.stop
          @mouseup.stop
          @click.stop
          @dblclick.stop
        ></div>
        
        <!-- 非编辑模式下显示内容 -->
        <template v-else>
          <!-- 错误状态 -->
          <div v-if="props.data.status === 'error'" class="text-node-error">
            <div class="error-icon">!</div>
            <div class="error-text">{{ props.data.error || '生成失败' }}</div>
            <button class="retry-btn" @click.stop="handleLLMGenerate">重试</button>
          </div>
          
          <!-- LLM 响应显示（生成中或已完成） -->
          <div v-else-if="props.data.llmResponse" class="text-node-llm-response" :class="{ 'is-streaming': isGenerating || props.data.status === 'processing' }">
            <div class="llm-response-content">
              {{ props.data.llmResponse }}
              <span v-if="isGenerating || props.data.status === 'processing'" class="streaming-cursor">▊</span>
            </div>
          </div>
          
          <!-- 加载中状态（还没有任何内容时） -->
          <div v-else-if="isGenerating || props.data.status === 'processing'" class="text-node-loading">
            <span class="processing-text">正在生成...</span>
          </div>
          
          <!-- 有内容且非编辑模式：显示文本内容 -->
          <div 
            v-else-if="localText" 
            class="text-node-display"
            v-html="localText"
          ></div>
          
          <!-- 待编辑状态（无内容）：显示双击提示 -->
          <div v-else-if="nodeState === 'ready'" class="text-node-ready">
          <div class="ready-hint">双击开始编辑...</div>
        </div>
        
          <!-- 空状态：显示快捷操作 -->
          <div v-else class="text-node-empty">
            <div class="text-node-hint">{{ t('canvas.textNode.try') }}</div>
            <div 
              v-for="action in quickActions"
              :key="action.labelKey"
              class="text-node-action"
              @click.stop="action.action"
            >
              <span class="action-icon">{{ action.icon }}</span>
              <span class="action-label">{{ t(action.labelKey) }}</span>
            </div>
          </div>
        </template>
        
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
      
      <!-- 右侧添加按钮 - 单击打开选择器，长按/拖拽连线 -->
      <button 
        class="node-add-btn node-add-btn-right"
        title="单击：添加节点 | 长按/拖拽：连接到其他节点"
        @mousedown="handleAddRightMouseDown"
      >
        +
      </button>
    </div>
    
    <!-- 输出端口 (隐藏但保留给 Vue Flow 用于边渲染) -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 底部 LLM 配置面板 - 紧贴节点卡片 -->
    <div v-if="selected" class="llm-config-panel" @click.stop>
      <!-- 参考媒体区域（视频/图片/混合） -->
      <div v-if="inheritedImages.length > 0" class="reference-section">
        <span class="reference-label">{{ referenceLabel }}</span>
        <span class="reference-hint">来自上游节点 · 共{{ inheritedImages.length }}{{ upstreamMediaType === 'video' ? '个' : upstreamMediaType === 'mixed' ? '个' : '张' }}</span>
        <div class="reference-images">
          <!-- 视频缩略图 -->
          <div 
            v-for="(videoUrl, idx) in upstreamVideoUrls.slice(0, 4)" 
            :key="'video-' + idx" 
            class="reference-image-item reference-video-item"
          >
            <video 
              :src="videoUrl" 
              preload="metadata"
              muted
              class="reference-video-thumb"
              @loadeddata="$event.target.currentTime = 0.1"
            ></video>
            <div class="video-badge">▶</div>
          </div>
          <!-- 图片缩略图 -->
          <div 
            v-for="(img, idx) in upstreamImageUrls.slice(0, 4 - Math.min(upstreamVideoUrls.length, 4))" 
            :key="'img-' + idx" 
            class="reference-image-item"
          >
            <img :src="img" :alt="`参考图 ${idx + 1}`" />
          </div>
          <div v-if="inheritedImages.length > 4" class="more-images-badge">
            +{{ inheritedImages.length - 4 }}
          </div>
        </div>
      </div>
      
      <!-- 上游文本内容（如果有） -->
      <div v-if="inheritedText" class="upstream-text-section">
        <div class="upstream-label">
          <span class="upstream-icon">💬</span>
          <span>上下文</span>
        </div>
        <div class="upstream-text-content">{{ inheritedText.slice(0, 200) }}{{ inheritedText.length > 200 ? '...' : '' }}</div>
      </div>
      
      <!-- 输入区域 -->
      <div class="llm-input-area">
        <textarea
          ref="llmInputRef"
          v-model="llmInputText"
          class="llm-input"
          placeholder="描述你想要生成的内容，并在下方调整生成参数。（按下Enter 生成，Shift+Enter 换行）"
          @keydown="handleLLMKeyDown"
        ></textarea>
      </div>
      
      <!-- 控制栏 -->
      <div class="llm-controls">
        <div class="controls-left">
          <!-- 模型选择器 -->
          <div ref="modelSelectorRef" class="model-selector" @click="toggleModelDropdown">
            <span class="model-icon llm-icon">{{ selectedModelIcon }}</span>
            <span class="model-name">{{ selectedModelLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 下拉菜单 -->
            <div v-if="showModelDropdown" class="model-dropdown" :class="{ 'dropdown-up': modelDropdownUp, 'dropdown-down': !modelDropdownUp }" @click.stop>
              <div 
                v-for="model in availableModels" 
                :key="model.value"
                class="model-option"
                :class="{ active: selectedModel === model.value }"
                @click.stop="selectModel(model.value)"
              >
                <span class="model-option-icon llm-icon">{{ model.icon }}</span>
                <span class="model-option-name">{{ model.label }}</span>
                <span v-if="model.pointsCost" class="model-option-cost">◆{{ model.pointsCost }}</span>
              </div>
            </div>
          </div>
          
          <!-- 功能预设选择器 -->
          <div ref="presetSelectorRef" class="preset-selector" @click="togglePresetDropdown">
            <span class="preset-name">{{ selectedPresetLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 预设下拉菜单 -->
            <div v-if="showPresetDropdown" class="preset-dropdown" :class="{ 'dropdown-up': presetDropdownUp, 'dropdown-down': !presetDropdownUp }" @click.stop>
              <div 
                class="preset-option"
                :class="{ active: !selectedPreset }"
                @click.stop="selectPreset('')"
              >
                <span class="preset-option-name">通用对话</span>
              </div>
              <div 
                v-for="preset in availablePresets" 
                :key="preset.id"
                class="preset-option"
                :class="{ active: selectedPreset === preset.id }"
                @click.stop="selectPreset(preset.id)"
              >
                <span class="preset-option-name">{{ preset.name }}</span>
              </div>
            </div>
          </div>
          
          <!-- 语言选择器 -->
          <div ref="languageSelectorRef" class="language-selector" @click="toggleLanguageDropdown">
            <span class="language-name">{{ selectedLanguageLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 语言下拉菜单 -->
            <div v-if="showLanguageDropdown" class="language-dropdown" :class="{ 'dropdown-up': languageDropdownUp, 'dropdown-down': !languageDropdownUp }" @click.stop>
              <div 
                v-for="language in availableLanguages" 
                :key="language.code"
                class="language-option"
                :class="{ active: selectedLanguage === language.code }"
                @click.stop="selectLanguage(language.code)"
              >
                <span class="language-option-name">{{ language.name }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="controls-right">
          <!-- 生成次数 -->
          <span class="generate-count">1x</span>
          
          <!-- 积分消耗显示 -->
          <span class="points-cost-display">
            {{ formattedModelCost }} {{ t('imageGen.points') }}
          </span>
          
          <!-- 生成按钮 -->
          <button 
            class="generate-btn"
            :disabled="isGenerating"
            title="开始生成 (Enter)"
            @click="handleLLMGenerate"
          >
            <span v-if="isGenerating">...</span>
            <span v-else>↑</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 格式工具栏 */
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 20px;
  padding: 6px 12px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.toolbar-btn.active {
  background: #4a4a4a;
  color: #fff;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #3a3a3a;
  margin: 0 6px;
}

/* 顶部标签 */
.text-node-label {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
}

.text-node-label:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

/* 标签编辑输入框 */
.text-node-label-input {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-accent-primary, #3b82f6);
  border-radius: 4px;
  padding: 4px 8px;
  outline: none;
  min-width: 60px;
  max-width: 200px;
}

/* 卡片容器 - 用于定位加号按钮 */
.text-node-card-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

/* 主卡片 */
.text-node-card {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  padding: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: border-color 0.2s ease;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 300px;
  min-height: 200px;
}

.text-node.editing .text-node-card {
  /* 编辑模式下保持用户设置的尺寸 */
  /* 注意：编辑器内的鼠标事件已通过 @mousedown.stop 阻止冒泡，不会触发节点拖拽 */
}

.text-node-card:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.text-node.selected .text-node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3);
}

.text-node.resizing .text-node-card {
  pointer-events: none;
  user-select: none;
}

/* ========== 彗星环绕发光特效（生成中） ========== */
.text-node-card.is-processing {
  position: relative;
  overflow: visible;
  box-shadow: 
    0 0 10px rgba(74, 222, 128, 0.2),
    0 0 20px rgba(74, 222, 128, 0.1),
    inset 0 0 0 1px rgba(74, 222, 128, 0.3);
}

.comet-border {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  pointer-events: none;
  z-index: 10;
  border-radius: 18px;
}

.comet-path {
  stroke-dasharray: 25 75;
  stroke-dashoffset: 0;
  animation: comet-rotate 2.5s linear infinite;
}

@keyframes comet-rotate {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* Resize Handles 调节手柄 */
.resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.text-node-card:hover .resize-handle {
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

/* 编辑器 - 使用 contenteditable */
.editor-content {
  width: 100%;
  height: 100%;
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 14px;
  line-height: 1.6;
  padding: 20px;
  font-family: inherit;
  overflow-y: auto;
  user-select: text;
  cursor: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.editor-content:empty:before {
  content: attr(placeholder);
  color: #666;
  pointer-events: none;
}

.editor-content:focus {
  outline: none;
}

/* 格式样式 */
.editor-content b,
.editor-content strong {
  font-weight: bold;
}

.editor-content i,
.editor-content em {
  font-style: italic;
}

.editor-content u {
  text-decoration: underline;
}

/* 文本显示模式 */
.text-node-display {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 14px;
  line-height: 1.6;
  flex: 1;
  height: 100%;
  overflow-y: auto;
  word-break: break-word;
  padding: 20px;
  cursor: text;
}

/* 保留 HTML 格式样式 */
.text-node-display b,
.text-node-display strong {
  font-weight: bold;
}

.text-node-display i,
.text-node-display em {
  font-style: italic;
}

.text-node-display u {
  text-decoration: underline;
}

/* LLM 响应样式 */
.text-node-llm-response {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.llm-response-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8b5cf6;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(139, 92, 246, 0.2);
}

.llm-icon {
  font-size: 14px;
}

.llm-response-content {
  flex: 1;
  color: var(--canvas-text-primary, #ffffff);
  font-size: 15px;
  line-height: 1.8;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.text-node-llm-response.is-streaming .llm-response-content {
  animation: fadeIn 0.3s ease-in;
}

/* 加载中状态 */
.text-node-streaming {
  padding: 20px;
  flex: 1;
  height: 100%;
}

.text-node-loading {
  padding: 60px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
}

.processing-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #888);
  letter-spacing: 2px;
}

/* LLM 响应内容 */
.text-node-llm-response {
  padding: 20px;
  min-height: 200px;
}

.llm-response-content {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.text-node-llm-response.is-streaming .llm-response-content {
  animation: fadeIn 0.3s ease-in;
}

.streaming-cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--canvas-accent-success, #4ade80);
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 错误状态 */
.text-node-error {
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1;
  height: 100%;
}

.error-icon {
  font-size: 32px;
  color: #ef4444;
}

.error-text {
  color: #ef4444;
  font-size: 14px;
  text-align: center;
}

.retry-btn {
  margin-top: 8px;
  padding: 8px 20px;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
}

/* 待编辑状态 */
.text-node-ready {
  padding: 60px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
}

.ready-hint {
  color: #666;
  font-size: 16px;
  text-align: center;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* 文本显示 - 已删除，使用 ready 状态替代 */

/* 空状态提示 */
.text-node-empty {
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.text-node-hint {
  color: var(--canvas-text-tertiary, #666666);
  font-size: 13px;
  margin-bottom: 16px;
}

/* 快捷操作项 */
.text-node-action {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.text-node-action:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

.action-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
  opacity: 0.8;
}

.action-label {
  flex: 1;
}

/* 连接端口 - 位置与+按钮对齐（但视觉隐藏） */
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
  left: -39px !important;
  top: calc(50% + 14px) !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -39px !important;
  top: calc(50% + 14px) !important;
  transform: translateY(-50%) !important;
}

/* 添加按钮 */
.node-add-btn {
  position: absolute;
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
  transition: all 0.2s ease;
  z-index: 10;
}

.text-node-card-wrapper:hover .node-add-btn,
.text-node.selected .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-50%) scale(1.1);
}

.node-add-btn-left {
  left: -52px;
}

.node-add-btn-right {
  right: -52px;
}

/* ========== 左侧快捷操作菜单 ========== */
.left-quick-menu {
  position: absolute;
  left: -220px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--canvas-bg-secondary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  min-width: 200px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  animation: slideInLeft 0.2s ease;
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

.left-quick-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--canvas-text-secondary, #ccc);
}

.left-quick-menu-item:hover {
  background: var(--canvas-bg-tertiary, #2a2a2a);
  color: var(--canvas-text-primary, #fff);
}

.left-menu-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.left-menu-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

/* ========== LLM 配置面板样式 ========== */
.llm-config-panel {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  min-width: 400px;
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  animation: slideDown 0.2s ease;
}

/* 上游文本展示区域 */
.upstream-text-section {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.upstream-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
  margin-bottom: 8px;
}

.upstream-icon {
  font-size: 14px;
}

.upstream-text-content {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--canvas-text-primary, #fff);
  line-height: 1.5;
  max-height: 80px;
  overflow-y: auto;
}

/* 参考图片区域 */
.reference-images {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.reference-image-item {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.reference-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 视频缩略图样式 */
.reference-video-item {
  position: relative;
}

.reference-video-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.video-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: #fff;
}

.more-images-badge {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #a0a0a0);
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 参考图片区域 */
.reference-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.reference-label {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--canvas-text-primary, #fff);
  white-space: nowrap;
}

.reference-hint {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666);
  flex: 1;
}

.reference-images {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-image-btn {
  width: 60px;
  height: 60px;
  border: 1px dashed var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--canvas-text-tertiary, #666);
}

.add-image-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
}

.add-image-btn span:first-child {
  font-size: 20px;
}

.add-label {
  font-size: 11px;
}

/* 输入区域 */
.llm-input-area {
  margin-bottom: 12px;
}

.llm-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--canvas-text-primary, #ffffff);
  font-size: 14px;
  resize: none;
  min-height: 60px;
  max-height: 120px;
  line-height: 1.6;
}

.llm-input::placeholder {
  color: var(--canvas-text-placeholder, #4a4a4a);
}

/* 控制栏 */
.llm-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.controls-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 功能预设选择器 */
.preset-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.preset-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.preset-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
}

/* 下拉菜单通用方向样式 */
.dropdown-up {
  bottom: calc(100% + 8px);
  top: auto;
}

.dropdown-down {
  top: calc(100% + 8px);
  bottom: auto;
}

/* 预设下拉菜单 */
.preset-dropdown {
  position: absolute;
  left: 0;
  min-width: 160px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.preset-option {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-option:hover {
  background: var(--canvas-bg-elevated, #242424);
}

.preset-option.active {
  background: rgba(59, 130, 246, 0.15);
}

.preset-option-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
}

/* 语言选择器 */
.language-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.language-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.language-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
}

/* 语言下拉菜单 */
.language-dropdown {
  position: absolute;
  left: 0;
  min-width: 140px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.language-option {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.language-option:hover {
  background: var(--canvas-bg-elevated, #242424);
}

.language-option.active {
  background: rgba(34, 197, 94, 0.15);
}

.language-option-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
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
  left: 0;
  min-width: 220px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 200;
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

.model-option-cost {
  color: var(--canvas-accent-banana, #fbbf24);
  font-size: 12px;
}

/* 生成次数 */
.generate-count {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  font-weight: 500;
}

/* 积分消耗显示 - 黑白灰风格 */
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

/* 生成按钮 */
.generate-btn {
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

.generate-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

.generate-btn:disabled {
  background: var(--canvas-border-default, #3a3a3a);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
