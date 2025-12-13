<script setup>
/**
 * TextNode.vue - 文本输入节点
 * 支持三种状态：空状态（快捷操作）、待编辑状态、编辑模式
 * 底部配置面板集成在节点内，紧贴节点卡片
 */
import { ref, computed, watch, nextTick, inject, onMounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getLLMConfig, chatWithLLM } from '@/api/canvas/llm'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// 本地文本状态
const localText = ref(props.data.text || '')

// 节点状态：'empty' | 'ready' | 'editing'
const nodeState = ref(localText.value ? 'ready' : 'empty')

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
    { value: 'gpt-4o', label: 'GPT-4o', icon: '✨', pointsCost: 3 },
    { value: 'claude-3', label: 'Claude 3', icon: '🤖', pointsCost: 2 }
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

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 切换模型下拉菜单
function toggleModelDropdown(event) {
  event?.stopPropagation()
  showModelDropdown.value = !showModelDropdown.value
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

// 从上游节点收集所有图片
const upstreamImages = computed(() => {
  const images = []
  for (const node of upstreamNodes.value) {
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

// 从上游节点收集文本内容
const upstreamText = computed(() => {
  const texts = []
  for (const node of upstreamNodes.value) {
    // 文本节点
    if (node.data?.text) {
      texts.push(node.data.text)
    }
    // LLM 输出
    else if (node.data?.output?.content) {
      texts.push(node.data.output.content)
    }
    // llmResponse
    else if (node.data?.llmResponse) {
      texts.push(node.data.llmResponse)
    }
  }
  return texts.join('\n\n')
})

// 兼容旧的 inheritedData（如果没有上游节点，则使用 props.data.inheritedData）
const inheritedContent = computed(() => props.data.inheritedData || null)
const inheritedText = computed(() => upstreamText.value || inheritedContent.value?.content || '')
const inheritedImages = computed(() => upstreamImages.value.length > 0 ? upstreamImages.value : (inheritedContent.value?.urls || []))
const hasUpstreamInput = computed(() => inheritedText.value || inheritedImages.value.length > 0)

// 处理 LLM 对话
async function handleLLMGenerate() {
  // 获取当前节点上方显示的文本内容（作为上轮对话）
  const currentNodeText = props.data.llmResponse || localText.value
  
  // 检查积分（移除空值检查，允许任何情况下发送）
  if (userPoints.value < currentModelCost.value) {
    alert('积分不足，请购买套餐')
    return
  }
  
  isGenerating.value = true
  
  try {
    // 构建消息列表，包含上游内容和当前节点内容作为上下文
    const messages = []
    
    // 如果有上游文本内容，作为更早的上下文
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
      status: 'processing'
    })
    
    const result = await chatWithLLM({
      messages,
      model: selectedModel.value,
      preset: selectedPreset.value || undefined, // 功能预设
      language: selectedLanguage.value || 'zh', // 目标语言
      images: processedImages.length > 0 ? processedImages : undefined
    })
    
    // 更新节点状态
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
    
  } catch (error) {
    console.error('[TextNode] LLM 对话失败:', error)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message || 'LLM 对话失败'
    })
    alert(error.message || 'LLM 对话失败，请重试')
  } finally {
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

// 快捷操作 - 点击后创建对应的新节点
const quickActions = [
  { icon: '✎', label: '自己编写内容', action: () => handlePrepareEdit() },
  { icon: '🎬', label: '文字生视频', action: () => createNextNode('video-gen', '视频生成') },
  { icon: 'A+', label: '图片反推提示词', action: () => createNextNode('llm', '图片描述', 'llm-image-describe') },
  { icon: '♪', label: '文字生音乐', action: () => createNextNode('audio-gen', '音频生成') }
]

// 格式工具栏按钮
const formatButtons = [
  { icon: 'B', title: '粗体', action: () => toggleFormat('bold'), format: 'bold', style: 'font-weight: bold' },
  { icon: 'I', title: '斜体', action: () => toggleFormat('italic'), format: 'italic', style: 'font-style: italic' },
  { icon: 'U', title: '下划线', action: () => toggleFormat('underline'), format: 'underline', style: 'text-decoration: underline' },
  { type: 'divider' },
  { icon: 'H₁', title: '标题1', action: () => setFontSize(24) },
  { icon: 'H₂', title: '标题2', action: () => setFontSize(20) },
  { icon: 'H₃', title: '标题3', action: () => setFontSize(16) },
  { type: 'divider' },
  { icon: '⧉', title: '复制', action: () => copyText() },
  { icon: '⛶', title: '全屏', action: () => toggleFullscreen() }
]

// 准备编辑（点击"自己编写内容"）
function handlePrepareEdit() {
  nodeState.value = 'ready'
  canvasStore.selectNode(props.id)
}

// 进入编辑模式（双击）
function handleEdit() {
  isEditing.value = true
  nodeState.value = 'editing'
  canvasStore.selectNode(props.id)
  canvasStore.isBottomPanelVisible = false
  
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      // 如果有文本，设置innerHTML
      if (localText.value) {
        textareaRef.value.innerHTML = localText.value
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

// 切换格式（粗体、斜体、下划线）
function toggleFormat(format) {
  if (!textareaRef.value) return
  
  // 阻止失焦
  event?.preventDefault()
  
  // 保存当前选区
  const selection = window.getSelection()
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  
  // 如果没有选中文字，或选区为空，则选中所有内容
  if (!range || range.collapsed) {
    const newRange = document.createRange()
    newRange.selectNodeContents(textareaRef.value)
    selection.removeAllRanges()
    selection.addRange(newRange)
  }
  
  // 使用 document.execCommand 实时应用格式
  document.execCommand(format, false, null)
  
  formatState.value[format] = !formatState.value[format]
  
  // 恢复焦点到编辑器
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      // 光标移到末尾
      const sel = window.getSelection()
      sel.removeAllRanges()
      const newRange = document.createRange()
      newRange.selectNodeContents(textareaRef.value)
      newRange.collapse(false)
      sel.addRange(newRange)
    }
  })
}

// 设置字体大小
function setFontSize(size) {
  if (!textareaRef.value) return
  
  event?.preventDefault()
  
  formatState.value.fontSize = size
  const selection = window.getSelection()
  
  // 如果没有选中文字，或选区为空，则选中所有内容
  if (selection.rangeCount === 0 || selection.getRangeAt(0).collapsed) {
    const range = document.createRange()
    range.selectNodeContents(textareaRef.value)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  
  // 对选中的内容设置字体大小
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    
    // 获取选中的内容
    const fragment = range.extractContents()
    
    // 遍历所有节点并设置字体大小
    const walker = document.createTreeWalker(
      fragment,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      null
    )
    
    const span = document.createElement('span')
    span.style.fontSize = `${size}px`
    span.appendChild(fragment)
    
    range.insertNode(span)
  }
  
  // 恢复焦点并移到末尾
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      const sel = window.getSelection()
      sel.removeAllRanges()
      const newRange = document.createRange()
      newRange.selectNodeContents(textareaRef.value)
      newRange.collapse(false)
      sel.addRange(newRange)
    }
  })
}

function copyText() {
  event?.preventDefault()
  const text = textareaRef.value?.innerText || localText.value
  navigator.clipboard.writeText(text)
  
  // 恢复焦点
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function toggleFullscreen() {
  event?.preventDefault()
  // TODO: 实现全屏功能
  
  // 恢复焦点
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

// 打开右键菜单
function handleContextMenu(event) {
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

// 左侧添加按钮 - 单击
function handleAddLeftClick(event) {
  event.stopPropagation()
  const rect = event.target.getBoundingClientRect()
  canvasStore.openNodeSelector(
    { x: rect.left - 20, y: rect.top },
    'node-left',
    props.id
  )
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
  e.stopPropagation()
  canvasStore.selectNode(props.id)
  // 显示底部配置面板（用于 LLM 对话）
  canvasStore.isBottomPanelVisible = true
}

// 双击进入编辑模式
function handleDoubleClick(e) {
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
}

// 结束调整尺寸
function handleResizeEnd() {
  isResizing.value = false
  resizeHandle.value = null
  
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
    
    <!-- 格式工具栏（仅编辑模式显示） -->
    <div v-if="isEditing" class="format-toolbar">
      <template v-for="(btn, index) in formatButtons" :key="index">
        <div v-if="btn.type === 'divider'" class="toolbar-divider"></div>
        <button 
          v-else
          class="toolbar-btn"
          :class="{ active: formatState[btn.format] }"
          :style="btn.style"
          :title="btn.title"
          @mousedown.prevent="btn.action"
        >
          {{ btn.icon }}
        </button>
      </template>
    </div>
    
    <!-- 节点头部标题 -->
    <div class="text-node-label">Text</div>
    
    <!-- 节点主体卡片容器 -->
    <div class="text-node-card-wrapper">
      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加上游节点"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 节点主体卡片 -->
      <div class="text-node-card" :style="cardStyle" @dblclick="handleDoubleClick">
        <!-- 编辑模式：可编辑的富文本区域 -->
        <div 
          v-if="isEditing" 
          ref="textareaRef"
          class="editor-content"
          contenteditable="true"
          placeholder="请输入文本内容..."
          @blur="handleBlur"
          @input="handleInput"
        ></div>
        
        <!-- 加载中状态 -->
        <div v-else-if="isGenerating || props.data.status === 'processing'" class="text-node-loading">
          <div class="loading-spinner">⏳</div>
          <div class="loading-text">正在生成...</div>
        </div>
        
        <!-- 错误状态 -->
        <div v-else-if="props.data.status === 'error'" class="text-node-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">{{ props.data.error || '生成失败' }}</div>
          <button class="retry-btn" @click.stop="handleLLMGenerate">重试</button>
        </div>
        
        <!-- LLM 响应显示（优先级最高） -->
        <div v-else-if="props.data.llmResponse" class="text-node-llm-response">
          <div class="llm-response-content">{{ props.data.llmResponse }}</div>
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
          <div class="text-node-hint">尝试：</div>
          <div 
            v-for="action in quickActions"
            :key="action.label"
            class="text-node-action"
            @click.stop="action.action"
          >
            <span class="action-icon">{{ action.icon }}</span>
            <span class="action-label">{{ action.label }}</span>
          </div>
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
      <!-- 参考图片区域（如果有上游图片） -->
      <div v-if="inheritedImages.length > 0" class="reference-section">
        <span class="reference-label">参考图片</span>
        <span class="reference-hint">来自上游节点 · 共{{ inheritedImages.length }}张</span>
        <div class="reference-images">
          <div 
            v-for="(img, idx) in inheritedImages.slice(0, 4)" 
            :key="idx" 
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
          <!-- 功能预设选择器 -->
          <div class="preset-selector" @click="togglePresetDropdown">
            <span class="preset-name">{{ selectedPresetLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 预设下拉菜单 -->
            <div v-if="showPresetDropdown" class="preset-dropdown" @click.stop>
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
          <div class="language-selector" @click="toggleLanguageDropdown">
            <span class="language-name">{{ selectedLanguageLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 语言下拉菜单 -->
            <div v-if="showLanguageDropdown" class="language-dropdown" @click.stop>
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
          
          <!-- 模型选择器 -->
          <div class="model-selector" @click="toggleModelDropdown">
            <span class="model-icon llm-icon">{{ selectedModelIcon }}</span>
            <span class="model-name">{{ selectedModelLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 下拉菜单 -->
            <div v-if="showModelDropdown" class="model-dropdown" @click.stop>
              <div 
                v-for="model in availableModels" 
                :key="model.value"
                class="model-option"
                :class="{ active: selectedModel === model.value }"
                @click.stop="selectModel(model.value)"
              >
                <span class="model-option-icon llm-icon">{{ model.icon }}</span>
                <span class="model-option-name">{{ model.label }}</span>
                <span v-if="model.pointsCost" class="model-option-cost">💎{{ model.pointsCost }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="controls-right">
          <!-- 生成次数 -->
          <span class="generate-count">1x</span>
          
          <!-- 生成按钮 -->
          <button 
            class="generate-btn"
            :disabled="isGenerating"
            title="开始生成 (Enter)"
            @click="handleLLMGenerate"
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
  max-height: 300px;
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
  font-size: 14px;
  line-height: 1.7;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 加载中状态 */
.text-node-loading {
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 200px;
}

.loading-spinner {
  font-size: 32px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
}

/* 错误状态 */
.text-node-error {
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 200px;
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
  min-height: 200px;
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

/* 连接端口 - 完全隐藏（但保留给 Vue Flow 用于边渲染） */
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

/* 添加按钮 */
.node-add-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 16px;
  font-weight: 300;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 10;
}

.text-node-card-wrapper:hover .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: var(--canvas-accent-primary, #3b82f6);
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: white;
  transform: translateY(-50%) scale(1.15);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
}

.node-add-btn-left {
  left: -12px;
}

.node-add-btn-right {
  right: -12px;
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

/* 预设下拉菜单 */
.preset-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
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
  bottom: calc(100% + 8px);
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
  bottom: calc(100% + 8px);
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
