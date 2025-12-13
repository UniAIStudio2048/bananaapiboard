<script setup>
/**
 * ImageNode.vue - 图片节点（统一设计）
 * 
 * 工作流设计：
 * - 初始状态：显示快捷操作（图生图、图生视频等）
 * - 点击"图生图"：触发上传，上传后当前节点变成图片预览，自动创建右侧输出节点
 * - 选中输出节点时：底部弹出配置面板
 */
import { ref, computed, inject, watch, onMounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { generateImageFromText, generateImageFromImage, pollTaskStatus, uploadImages } from '@/api/canvas/nodes'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// 文件上传引用
const fileInputRef = ref(null)
const refImageInputRef = ref(null) // 参考图片上传引用
const pendingAction = ref(null) // 记录待执行的操作类型

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')
const promptText = ref(props.data.prompt || '')
const isDragOver = ref(false) // 拖拽悬停状态
const isRefDragOver = ref(false) // 参考图片区域拖拽状态
const refDragCounter = ref(0) // 参考图片拖拽计数器

// 图片列表拖拽排序状态
const dragSortIndex = ref(-1)
const dragOverIndex = ref(-1)

// 生成参数
const selectedModel = ref(props.data.model || 'nano-banana-2')
const selectedResolution = ref(props.data.resolution || '1024')
const selectedAspectRatio = ref(props.data.aspectRatio || 'auto')
const selectedCount = ref(props.data.count || 1)
const imageSize = ref(props.data.imageSize || '4K') // 尺寸选项（仅 nano-banana-2）

// 生成次数选项循环：1 -> 2 -> 4 -> 1
const countOptions = [1, 2, 4]

// 用户最大并发数限制
const userConcurrentLimit = computed(() => {
  return userInfo?.value?.concurrent_limit || 1
})

// 切换生成次数
function toggleCount() {
  const currentIndex = countOptions.indexOf(selectedCount.value)
  const nextIndex = (currentIndex + 1) % countOptions.length
  const nextCount = countOptions[nextIndex]
  
  // 检查是否超过用户套餐限制
  if (nextCount > userConcurrentLimit.value) {
    alert(`您的套餐最大支持 ${userConcurrentLimit.value} 次并发，请升级套餐以使用更多并发`)
    return
  }
  
  selectedCount.value = nextCount
}

// 可用选项 - 与主页图片生成保持一致
const models = [
  { value: 'nano-banana', label: 'Nano Banana', icon: '🍌', points: 1 },
  { value: 'nano-banana-hd', label: 'Nano Banana HD', icon: '✨', points: 3 },
  { value: 'nano-banana-2', label: 'Nano Banana 2', icon: '🚀', points: null } // 积分根据尺寸变化
]

// 尺寸选项（仅 nano-banana-2 显示）
const imageSizes = [
  { value: '1K', label: '1K', points: 3 },
  { value: '2K', label: '2K', points: 4 },
  { value: '4K', label: '4K', points: 5 }
]

// 是否显示尺寸选项
const showResolutionOption = computed(() => selectedModel.value === 'nano-banana-2')

// 计算当前积分消耗
const currentPointsCost = computed(() => {
  if (selectedModel.value === 'nano-banana-2') {
    const sizeOption = imageSizes.find(s => s.value === imageSize.value)
    return sizeOption?.points || 3
  }
  const modelOption = models.find(m => m.value === selectedModel.value)
  return modelOption?.points || 1
})

const aspectRatios = [
  { value: 'auto', label: 'Auto (自动)' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '21:9', label: '21:9' }
]

// 节点尺寸
const nodeWidth = ref(props.data.width || 380)
const nodeHeight = ref(props.data.height || 320)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 节点样式类
// 是否只有单张输出图片
const hasSingleOutput = computed(() => {
  return hasOutput.value && outputImages.value.length === 1
})

const nodeClass = computed(() => ({
  'canvas-node': true,
  'image-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'success': props.data.status === 'success',
  'error': props.data.status === 'error',
  'resizing': isResizing.value,
  'is-source-node': isSourceNode.value, // 是否为源节点（上传的图片）
  'has-single-output': hasSingleOutput.value // 是否只有单张输出（无边框显示）
}))

// 节点内容样式
const contentStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  minHeight: `${nodeHeight.value}px`
}))

// 判断是否为源节点（只显示上传的图片，不显示配置面板）
const isSourceNode = computed(() => {
  return props.data.nodeRole === 'source'
})

// 判断是否有上游连接（用于显示输出状态而非快捷操作）
const hasUpstream = computed(() => {
  return props.data.hasUpstream || props.data.inheritedFrom || props.data.inheritedData
})

// 继承的提示词（来自文本节点）
const inheritedPrompt = computed(() => {
  if (props.data.inheritedData?.type === 'text') {
    return props.data.inheritedData.content || ''
  }
  return ''
})

// 是否有输出（生成结果）
const hasOutput = computed(() => 
  props.data.output?.urls?.length > 0 || props.data.output?.url
)

// 是否有上传的图片（源图）
const hasSourceImage = computed(() => 
  props.data.sourceImages?.length > 0
)

// 输出图片
const outputImages = computed(() => {
  if (props.data.output?.urls) return props.data.output.urls
  if (props.data.output?.url) return [props.data.output.url]
  return []
})

// 源图片（上传的）
const sourceImages = computed(() => props.data.sourceImages || [])

// 收集上游节点的所有图片
function collectUpstreamImages() {
  const upstreamImages = []
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  
  for (const edge of upstreamEdges) {
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    // 图片节点：获取图片
    if (sourceNode.type === 'image-input' || sourceNode.type === 'image' || sourceNode.type === 'image-gen') {
      if (sourceNode.data?.output?.urls?.length > 0) {
        upstreamImages.push(...sourceNode.data.output.urls)
      } else if (sourceNode.data?.output?.url) {
        upstreamImages.push(sourceNode.data.output.url)
      } else if (sourceNode.data?.sourceImages?.length > 0) {
        upstreamImages.push(...sourceNode.data.sourceImages)
      }
    }
  }
  
  return upstreamImages
}

// 继承的参考图片（来自左侧连接的节点，支持多图和自定义顺序）
const referenceImages = computed(() => {
  // 收集上游图片
  const upstreamImages = collectUpstreamImages()
  
  // 如果有用户自定义的顺序，按顺序返回
  const customOrder = props.data.imageOrder || []
  if (customOrder.length > 0 && upstreamImages.length > 0) {
    const orderedImages = []
    const remainingImages = [...upstreamImages]
    
    for (const url of customOrder) {
      const index = remainingImages.indexOf(url)
      if (index !== -1) {
        orderedImages.push(url)
        remainingImages.splice(index, 1)
      }
    }
    
    orderedImages.push(...remainingImages)
    return orderedImages
  }
  
  if (upstreamImages.length > 0) {
    return upstreamImages
  }
  
  // 使用继承数据
  if (props.data.inheritedData?.urls?.length > 0) {
    return props.data.inheritedData.urls
  }
  
  if (props.data.referenceImages?.length > 0) {
    return props.data.referenceImages
  }
  
  return []
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 快捷操作 - 初始状态显示
const quickActions = [
  { icon: '⬆', label: '图生图', action: () => triggerUpload('image-to-image') },
  { icon: '⬆', label: '图生视频', action: () => triggerUpload('image-to-video') },
  { icon: '⧉', label: '图片换背景', action: () => triggerUpload('change-background') },
  { icon: '▶', label: '首帧图生视频', action: () => triggerUpload('first-frame-video') }
]

// 监听参数变化，保存到store
watch([selectedModel, selectedResolution, selectedAspectRatio, selectedCount, promptText, imageSize], 
  ([model, resolution, aspectRatio, count, prompt, size]) => {
    canvasStore.updateNodeData(props.id, {
      model,
      resolution,
      aspectRatio,
      count,
      prompt,
      imageSize: size
    })
  }
)

// 触发文件上传
function triggerUpload(actionType) {
  pendingAction.value = actionType
  fileInputRef.value?.click()
}

// 处理文件上传
async function handleFileUpload(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  const actionType = pendingAction.value
  
  // 重置 input
  event.target.value = ''
  pendingAction.value = null
  
  try {
    // 读取图片为 base64 或上传到服务器
    const imageUrl = await uploadImageFile(file)
    
    if (actionType === 'image-to-image') {
      // 图生图流程：当前节点变成源节点，创建输出节点
      await handleImageToImageFlow(imageUrl)
    } else if (actionType === 'image-to-video') {
      // 图生视频流程
      await handleImageToVideoFlow(imageUrl)
    } else if (actionType === 'change-background') {
      // 换背景流程
      await handleChangeBackgroundFlow(imageUrl)
    } else if (actionType === 'first-frame-video') {
      // 首帧图生视频流程
      await handleFirstFrameVideoFlow(imageUrl)
    }
  } catch (error) {
    console.error('[ImageNode] 上传失败:', error)
    alert('图片上传失败，请重试')
  }
}

// 上传图片文件
async function uploadImageFile(file) {
  // 先转为 base64 预览
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 图生图流程
async function handleImageToImageFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 1. 当前节点变成源节点（显示上传的图片）
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl],
    title: 'Image'
  })
  
  // 2. 创建右侧的输出节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + nodeWidth.value + 100,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: { 
      title: 'Image',
      nodeRole: 'output', // 输出节点
      referenceImages: [imageUrl] // 传递参考图
    }
  })
  
  // 3. 自动连线
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 4. 选中新创建的输出节点
  canvasStore.selectNode(newNodeId)
}

// 图生视频流程
async function handleImageToVideoFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 当前节点变成源节点
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl]
  })
  
  // 创建视频节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: {
      x: currentNode.position.x + nodeWidth.value + 100,
      y: currentNode.position.y
    },
    data: { 
      title: 'Video',
      referenceImages: [imageUrl]
    }
  })
  
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  canvasStore.selectNode(newNodeId)
}

// 换背景流程
async function handleChangeBackgroundFlow(imageUrl) {
  // 类似图生图，但使用特定的处理类型
  await handleImageToImageFlow(imageUrl)
  // TODO: 可以设置特定的处理参数
}

// 首帧图生视频流程
async function handleFirstFrameVideoFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl]
  })
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: {
      x: currentNode.position.x + nodeWidth.value + 100,
      y: currentNode.position.y
    },
    data: { 
      title: 'Video',
      generationMode: 'first',
      referenceImages: [imageUrl]
    }
  })
  
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  canvasStore.selectNode(newNodeId)
}

// 重新上传（源节点用）
function handleReupload() {
  pendingAction.value = 'image-to-image'
  fileInputRef.value?.click()
}

// 更新源图片（不创建新节点）
async function updateSourceImage(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  event.target.value = ''
  
  try {
    const imageUrl = await uploadImageFile(file)
    canvasStore.updateNodeData(props.id, {
      sourceImages: [imageUrl]
    })
    
    // 同时更新下游节点的参考图
    const edges = canvasStore.edges.filter(e => e.source === props.id)
    edges.forEach(edge => {
      canvasStore.updateNodeData(edge.target, {
        referenceImages: [imageUrl]
      })
    })
  } catch (error) {
    console.error('[ImageNode] 更新图片失败:', error)
  }
}

// 获取上游节点的最新数据
function getUpstreamPrompt() {
  // 1. 先检查是否有上游节点
  const upstreamEdge = canvasStore.edges.find(e => e.target === props.id)
  if (!upstreamEdge) return ''
  
  // 2. 获取上游节点的最新数据
  const sourceNode = canvasStore.nodes.find(n => n.id === upstreamEdge.source)
  if (!sourceNode) return ''
  
  // 3. 根据节点类型获取内容
  if (sourceNode.type === 'text-input' || sourceNode.type === 'text') {
    // 文本节点：优先获取 LLM 响应，其次是手写文本
    const content = sourceNode.data?.llmResponse || sourceNode.data?.text || ''
    // 去除 HTML 标签，只保留纯文本
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = content
    return tempDiv.textContent || tempDiv.innerText || ''
  }
  
  // 4. 其他类型节点：返回已继承的数据
  return inheritedPrompt.value
}

// 并发间隔时间（毫秒）
const CONCURRENT_INTERVAL = 5000

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 将 base64 转换为 File 对象
function base64ToFile(base64String, filename = 'image.png') {
  // 解析 base64 数据
  const arr = base64String.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

// 上传 base64 图片到服务器获取 URL
async function uploadBase64Images(base64Images) {
  const files = base64Images.map((img, index) => 
    base64ToFile(img, `reference_${index + 1}.png`)
  )
  
  console.log('[ImageNode] 上传 base64 图片到服务器...', files.length, '张')
  const urls = await uploadImages(files)
  console.log('[ImageNode] 图片上传成功，获取 URL:', urls)
  return urls
}

// 单次生成请求
async function sendImageGenerateRequest(finalPrompt) {
  // 构建基础参数
  const baseParams = {
    prompt: finalPrompt || '保持原图风格',
    model: selectedModel.value,
    aspectRatio: selectedAspectRatio.value,
    count: 1, // 单次请求固定为1
    // 所有模型都传递 image_size 参数
    image_size: imageSize.value || '2K'
  }
  
  if (referenceImages.value.length > 0) {
    // 图生图模式：需要先上传图片获取 URL
    let imageUrls = []
    
    // 分离 base64 图片和已有 URL
    const base64Images = []
    const existingUrls = []
    
    for (const img of referenceImages.value) {
      if (img.startsWith('data:')) {
        base64Images.push(img)
      } else {
        existingUrls.push(img)
      }
    }
    
    console.log('[ImageNode] 参考图片:', {
      base64Count: base64Images.length,
      urlCount: existingUrls.length
    })
    
    // 上传 base64 图片
    if (base64Images.length > 0) {
      try {
        const uploadedUrls = await uploadBase64Images(base64Images)
        imageUrls = [...uploadedUrls, ...existingUrls]
      } catch (e) {
        console.error('[ImageNode] 图片上传失败:', e)
        throw new Error('参考图片上传失败，请重试')
      }
    } else {
      imageUrls = existingUrls
    }
    
    console.log('[ImageNode] 图生图请求:', {
      ...baseParams,
      imageUrls: imageUrls.map(url => url.substring(0, 60) + '...')
    })
    
    return await generateImageFromImage({
      ...baseParams,
      images: imageUrls
    })
  } else {
    // 文生图
    console.log('[ImageNode] 文生图请求:', baseParams)
    return await generateImageFromText(baseParams)
  }
}

// 创建堆叠的输出节点（多批次生成时）
function createStackedOutputNodes(count, basePosition) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return []
  
  const createdNodes = []
  const stackOffset = 8 // 堆叠偏移量
  
  for (let i = 1; i < count; i++) {
    const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const stackPosition = {
      x: currentNode.position.x + stackOffset * i,
      y: currentNode.position.y + stackOffset * i
    }
    
    canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: stackPosition,
      zIndex: -i, // 堆叠在后面
      data: {
        title: `Image ${i + 1}`,
        nodeRole: 'output',
        status: 'pending',
        isStackedNode: true,
        stackIndex: i,
        parentNodeId: props.id,
        prompt: props.data.prompt,
        model: selectedModel.value,
        aspectRatio: selectedAspectRatio.value,
        imageSize: imageSize.value,
        referenceImages: referenceImages.value
      }
    })
    
    createdNodes.push(newNodeId)
  }
  
  // 更新主节点的堆叠信息
  canvasStore.updateNodeData(props.id, {
    stackedNodeIds: createdNodes,
    isStackParent: true
  })
  
  return createdNodes
}

// 单个节点执行生成任务（后台轮询，不阻塞UI）
async function executeNodeGeneration(nodeId, finalPrompt, taskIndex) {
  try {
    canvasStore.updateNodeData(nodeId, { 
      status: 'processing',
      progress: '生成中...'
    })
    
    const result = await sendImageGenerateRequest(finalPrompt)
    
    if (result.task_id || result.id) {
      const taskId = result.task_id || result.id
      console.log(`[ImageNode] 任务 ${taskIndex + 1} 已提交:`, taskId)
      
      // 后台轮询，不阻塞（使用独立的 Promise，不 await）
      pollTaskStatus(taskId, 'image', {
        interval: 2000,
        timeout: 300000,
        onProgress: (progress) => {
          canvasStore.updateNodeData(nodeId, { 
            progress: progress.status === 'processing' ? '生成中...' : progress.status
          })
        }
      }).then(finalResult => {
        const imageUrl = finalResult.url || finalResult.urls?.[0] || finalResult.images?.[0]
        if (imageUrl) {
          canvasStore.updateNodeData(nodeId, {
            status: 'success',
            output: { type: 'image', urls: [imageUrl] }
          })
        } else {
          canvasStore.updateNodeData(nodeId, {
            status: 'error',
            error: '未获取到生成结果'
          })
        }
      }).catch(error => {
        console.error(`[ImageNode] 任务 ${taskIndex + 1} 轮询失败:`, error)
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: error.message
        })
      })
      
      // 任务已提交，立即返回 taskId（不等待轮询结果）
      return taskId
    } else if (result.url) {
      canvasStore.updateNodeData(nodeId, {
        status: 'success',
        output: { type: 'image', urls: [result.url] }
      })
      return result.url
    }
    
    throw new Error('未获取到生成结果')
  } catch (error) {
    console.error(`[ImageNode] 任务 ${taskIndex + 1} 失败:`, error)
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      error: error.message
    })
    return null
  }
}

// 创建新的图像节点用于接收新任务（当前节点正在生成中时使用）
function createNewOutputNode() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  
  const stackOffset = 20 // 偏移量
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + stackOffset,
    y: currentNode.position.y + stackOffset
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      title: 'Image',
      nodeRole: 'output',
      status: 'idle',
      prompt: promptText.value,
      model: selectedModel.value,
      aspectRatio: selectedAspectRatio.value,
      imageSize: imageSize.value,
      referenceImages: referenceImages.value,
      // 复制上游连接
      hasUpstream: props.data.hasUpstream,
      inheritedData: props.data.inheritedData,
      imageOrder: props.data.imageOrder
    }
  })
  
  // 复制上游连接到新节点
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  upstreamEdges.forEach(edge => {
    canvasStore.addEdge({
      id: `edge_${edge.source}_${newNodeId}`,
      source: edge.source,
      target: newNodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    })
  })
  
  console.log('[ImageNode] 创建新输出节点:', newNodeId)
  return newNodeId
}

// 开始生成（输出节点用）
async function handleGenerate() {
  // 动态获取上游节点的最新提示词
  const upstreamPrompt = getUpstreamPrompt()
  
  // 使用用户输入的提示词，或者上游节点的提示词
  const finalPrompt = promptText.value.trim() || upstreamPrompt
  
  console.log('[ImageNode] 生成参数:', { 
    userPrompt: promptText.value.trim(), 
    upstreamPrompt,
    finalPrompt,
    model: selectedModel.value,
    imageSize: imageSize.value,
    count: selectedCount.value,
    currentStatus: props.data.status
  })
  
  if (referenceImages.value.length === 0 && !finalPrompt) {
    alert('请输入提示词或连接参考图片')
    return
  }
  
  // 检查总积分是否足够（单次消耗 * 次数）
  const totalCost = currentPointsCost.value * selectedCount.value
  if (userPoints.value < totalCost) {
    alert(`积分不足，${selectedCount.value}次生成需要 ${totalCost} 积分，您当前只有 ${userPoints.value} 积分`)
    return
  }
  
  // 检查并发限制
  if (selectedCount.value > userConcurrentLimit.value) {
    alert(`您的套餐最大支持 ${userConcurrentLimit.value} 次并发，请升级套餐`)
    return
  }
  
  isGenerating.value = true
  errorMessage.value = ''
  
  const generateCount = selectedCount.value
  
  // 🔥 核心逻辑：如果当前节点正在处理中，创建新节点来接收新任务
  let targetNodeId = props.id
  if (props.data.status === 'processing') {
    const newNodeId = createNewOutputNode()
    if (newNodeId) {
      targetNodeId = newNodeId
      // 选中新创建的节点
      canvasStore.selectNode(newNodeId)
      console.log('[ImageNode] 当前节点正在生成，创建新节点接收任务:', newNodeId)
    }
  }
  
  // 多批次生成时，创建堆叠的输出节点
  let allNodeIds = [targetNodeId]
  if (generateCount > 1) {
    // 对于目标节点创建额外的堆叠节点
    const currentNode = canvasStore.nodes.find(n => n.id === targetNodeId)
    if (currentNode) {
      for (let i = 1; i < generateCount; i++) {
        const stackedNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const stackOffset = 8
        canvasStore.addNode({
          id: stackedNodeId,
          type: 'image',
          position: {
            x: currentNode.position.x + stackOffset * i,
            y: currentNode.position.y + stackOffset * i
          },
          zIndex: -i,
          data: {
            title: `Image ${i + 1}`,
            nodeRole: 'output',
            status: 'pending',
            isStackedNode: true,
            stackIndex: i,
            parentNodeId: targetNodeId,
            prompt: promptText.value,
            model: selectedModel.value,
            aspectRatio: selectedAspectRatio.value,
            imageSize: imageSize.value,
            referenceImages: referenceImages.value
          }
        })
        allNodeIds.push(stackedNodeId)
      }
      console.log('[ImageNode] 创建堆叠节点:', allNodeIds.slice(1))
    }
  }
  
  // 更新目标节点状态
  canvasStore.updateNodeData(targetNodeId, { 
    status: 'processing',
    progress: generateCount > 1 ? `并行生成 ${generateCount} 张...` : '生成中...'
  })
  
  try {
    // 提交所有任务（任务提交后立即返回，不等待完成）
    const submitPromises = allNodeIds.map((nodeId, index) => {
      return new Promise(async (resolve) => {
        // 间隔发送请求
        if (index > 0) {
          await delay(CONCURRENT_INTERVAL * index)
        }
        const result = await executeNodeGeneration(nodeId, finalPrompt, index)
        resolve(result)
      })
    })
    
    // 等待所有任务提交完成（不是等待任务结果完成）
    const allResults = await Promise.all(submitPromises)
    const successResults = allResults.filter(r => r !== null)
    
    console.log('[ImageNode] 全部任务已提交:', successResults.length, '/', generateCount)
    
    if (successResults.length === 0) {
      throw new Error('所有任务提交都失败了')
    }
    
    // 任务提交成功后，立即恢复按钮状态，允许用户继续发起新任务
    isGenerating.value = false
    
  } catch (error) {
    console.error('[ImageNode] 生成失败:', error)
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(targetNodeId, {
      status: 'error',
      error: error.message
    })
    isGenerating.value = false
  }
}

// 保留原来的单次生成逻辑作为备用
async function handleGenerateSingle() {
  const upstreamPrompt = getUpstreamPrompt()
  const finalPrompt = promptText.value.trim() || upstreamPrompt
  
  if (referenceImages.value.length === 0 && !finalPrompt) {
    alert('请输入提示词或连接参考图片')
    return
  }
  
  isGenerating.value = true
  errorMessage.value = ''
  
  canvasStore.updateNodeData(props.id, { 
    status: 'processing',
    progress: '生成中...'
  })
  
  try {
    const allResults = []
    const generateCount = selectedCount.value
    
    for (let i = 0; i < generateCount; i++) {
      if (i > 0) {
        await delay(CONCURRENT_INTERVAL)
      }
      
      const result = await sendImageGenerateRequest(finalPrompt)
      
      if (result.task_id || result.id) {
        const taskId = result.task_id || result.id
        
        if (i === generateCount - 1) {
          const finalResult = await pollTaskStatus(taskId, 'image', {
            interval: 2000,
            timeout: 300000
          })
          
          const imageUrl = finalResult.url || finalResult.urls?.[0] || finalResult.images?.[0]
          if (imageUrl) {
            allResults.push(imageUrl)
          }
        }
      } else if (result.url) {
        allResults.push(result.url)
      } else if (result.urls || result.images) {
        const urls = result.urls || result.images || []
        allResults.push(...(Array.isArray(urls) ? urls : [urls]))
      }
    }
    
    // 更新节点输出
    if (allResults.length > 0) {
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'image',
          urls: allResults
        }
      })
    } else {
      throw new Error('生成完成但未返回图片URL')
    }
    
  } catch (error) {
    console.error('[ImageNode] 生成失败:', error)
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
  } finally {
    isGenerating.value = false
  }
}

// 重新生成
function handleRegenerate() {
  canvasStore.updateNodeData(props.id, { 
    status: 'idle',
    output: null,
    error: null
  })
}

// 处理键盘事件
function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleGenerate()
  }
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

function handleResizeMove(event) {
  if (!isResizing.value) return
  
  const deltaX = event.clientX - resizeStart.value.x
  const deltaY = event.clientY - resizeStart.value.y
  
  const viewport = canvasStore.viewport
  const zoom = viewport.zoom || 1
  
  if (resizeHandle.value === 'right' || resizeHandle.value === 'corner') {
    nodeWidth.value = Math.max(280, resizeStart.value.width + deltaX / zoom)
  }
  
  if (resizeHandle.value === 'bottom' || resizeHandle.value === 'corner') {
    nodeHeight.value = Math.max(200, resizeStart.value.height + deltaY / zoom)
  }
}

function handleResizeEnd() {
  isResizing.value = false
  resizeHandle.value = null
  
  canvasStore.updateNodeData(props.id, {
    width: nodeWidth.value,
    height: nodeHeight.value
  })
  
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}

// 右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'image', position: { x: 0, y: 0 }, data: props.data }
  )
}

// 添加按钮交互
function handleAddLeftClick(event) {
  event.stopPropagation()
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY },
    'node-left',
    props.id
  )
}

// ========== 右侧添加按钮交互（单击/长按拖拽） ==========
const LONG_PRESS_DURATION = 300 // 长按阈值（毫秒）
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

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

// 右侧添加按钮 - 鼠标移动（如果移动了就开始连线）
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
    canvasStore.openNodeSelector(
      { x: event.clientX, y: event.clientY },
      'node',
      props.id
    )
  }
}

// 开始拖拽连线 - 直接调用 store 方法
function startDragConnection(event) {
  // 获取当前节点在 store 中的数据
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    console.warn('[ImageNode] 未找到当前节点')
    return
  }
  
  // 计算节点右侧输出端口的画布坐标（从节点位置计算）
  // 节点位置 + 节点宽度 = 右侧边缘，Y 轴在节点中间 + 标签高度偏移
  const currentNodeWidth = props.data?.width || nodeWidth.value || 380
  const currentNodeHeight = props.data?.height || nodeHeight.value || 320
  const labelOffset = 28 // 标签高度偏移
  
  const outputX = currentNode.position.x + currentNodeWidth
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[ImageNode] 开始拖拽连线，起始位置:', { outputX, outputY, nodePosition: currentNode.position })
  
  // 调用 store 开始拖拽连线，使用节点输出端口位置作为起点
  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
}

// 下载图片
function downloadImage() {
  const images = hasOutput.value ? outputImages.value : sourceImages.value
  if (images.length > 0) {
    window.open(images[0], '_blank')
  }
}

// ========== 参考图片管理 ==========
// 触发参考图片上传
function triggerRefImageUpload() {
  console.log('[ImageNode] 触发参考图片上传, refImageInputRef:', refImageInputRef.value)
  if (refImageInputRef.value) {
    refImageInputRef.value.click()
  } else {
    console.error('[ImageNode] refImageInputRef 未绑定!')
  }
}

// 处理参考图片上传
async function handleRefImageUpload(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  event.target.value = '' // 重置 input
  
  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const imageUrl = await uploadImageFile(file)
        createUpstreamImageNode(imageUrl)
      }
    }
  } catch (error) {
    console.error('[ImageNode] 参考图片上传失败:', error)
  }
}

// 创建上游图片节点
function createUpstreamImageNode(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const existingUpstreamCount = canvasStore.edges.filter(e => e.target === props.id).length
  const offsetY = existingUpstreamCount * 200
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y + offsetY - 100
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      title: `参考图 ${existingUpstreamCount + 1}`,
      nodeRole: 'source',
      sourceImages: [imageUrl]
    }
  })
  
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  const currentOrder = props.data.imageOrder || [...referenceImages.value]
  canvasStore.updateNodeData(props.id, {
    imageOrder: [...currentOrder, imageUrl],
    hasUpstream: true
  })
}

// 删除参考图片
function removeReferenceImage(index) {
  const currentImages = [...(referenceImages.value || [])]
  const removedImage = currentImages[index]
  currentImages.splice(index, 1)
  
  canvasStore.updateNodeData(props.id, {
    imageOrder: currentImages,
    hasUpstream: currentImages.length > 0
  })
  
  // 查找并删除对应的上游节点和连接
  const edgesToRemove = []
  const nodesToRemove = []
  
  canvasStore.edges.forEach(edge => {
    if (edge.target === props.id) {
      const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
      if (sourceNode?.data?.sourceImages?.includes(removedImage)) {
        edgesToRemove.push(edge.id)
        nodesToRemove.push(sourceNode.id)
      }
    }
  })
  
  edgesToRemove.forEach(edgeId => canvasStore.removeEdge(edgeId))
  nodesToRemove.forEach(nodeId => canvasStore.removeNode(nodeId))
}

// ========== 参考图片拖拽排序 ==========
function handleImageMouseDown(event) {
  event.stopPropagation()
}

function handleImageDragStart(event, index) {
  event.stopPropagation()
  dragSortIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())
  event.target.classList.add('dragging')
}

function handleImageDragOver(event, index) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function handleImageDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    dragOverIndex.value = -1
  }
}

function handleImageDrop(event, dropIndex) {
  event.preventDefault()
  const dragIndex = dragSortIndex.value
  
  if (dragIndex === -1 || dragIndex === dropIndex) {
    resetDragState()
    return
  }
  
  const images = [...(referenceImages.value || [])]
  const [draggedImage] = images.splice(dragIndex, 1)
  images.splice(dropIndex, 0, draggedImage)
  
  canvasStore.updateNodeData(props.id, {
    imageOrder: images
  })
  
  resetDragState()
}

function handleImageDragEnd(event) {
  event.target.classList.remove('dragging')
  resetDragState()
}

function resetDragState() {
  dragSortIndex.value = -1
  dragOverIndex.value = -1
}

// ========== 参考图片区域拖拽上传 ==========
function handleRefDragEnter(event) {
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  
  if (event.dataTransfer?.types?.includes('Files')) {
    refDragCounter.value++
    isRefDragOver.value = true
  }
}

function handleRefDragOver(event) {
  event.preventDefault()
  
  if (dragSortIndex.value !== -1) {
    event.dataTransfer.dropEffect = 'move'
    return
  }
  
  if (event.dataTransfer?.types?.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleRefDragLeave(event) {
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  refDragCounter.value--
  if (refDragCounter.value === 0) {
    isRefDragOver.value = false
  }
}

async function handleRefDrop(event) {
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  isRefDragOver.value = false
  refDragCounter.value = 0
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const imageUrl = await uploadImageFile(file)
        createUpstreamImageNode(imageUrl)
      }
    }
  } catch (error) {
    console.error('[ImageNode] 拖拽上传失败:', error)
  }
}

// ========== 拖拽上传图片 ==========
const dragCounter = ref(0) // 用于正确处理子元素的拖拽事件

function handleDragEnter(event) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value++
  isDragOver.value = true
}

function handleDragOver(event) {
  event.preventDefault()
  event.stopPropagation()
  // 设置拖拽效果
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(event) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragOver.value = false
  }
}

async function handleDrop(event) {
  event.preventDefault()
  event.stopPropagation()
  isDragOver.value = false
  dragCounter.value = 0
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  
  // 检查是否为图片文件
  if (!file.type.startsWith('image/')) {
    alert('请拖入图片文件')
    return
  }
  
  try {
    const imageUrl = await uploadImageFile(file)
    
    // 更新节点图片
    canvasStore.updateNodeData(props.id, {
      nodeRole: 'source',
      sourceImages: [imageUrl]
    })
    
    // 同时更新下游节点的参考图
    const edges = canvasStore.edges.filter(e => e.source === props.id)
    edges.forEach(edge => {
      canvasStore.updateNodeData(edge.target, {
        referenceImages: [imageUrl]
      })
    })
  } catch (error) {
    console.error('[ImageNode] 拖拽上传失败:', error)
    alert('图片上传失败，请重试')
  }
}
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 隐藏的文件上传 input -->
    <input 
      ref="fileInputRef"
      type="file" 
      accept="image/*"
      style="display: none"
      @change="isSourceNode ? updateSourceImage($event) : handleFileUpload($event)"
    />
    
    <!-- 隐藏的参考图片上传 input（使用唯一ID避免冲突） -->
    <input 
      :id="`ref-image-upload-${id}`"
      ref="refImageInputRef"
      type="file" 
      accept="image/*"
      multiple
      style="display: none"
      @change="handleRefImageUpload"
    />
    
    <!-- 左侧输入端口（必须在根元素下） -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 节点标签 -->
    <div class="node-label">Image</div>
    
    <!-- 节点主体 -->
    <div class="node-wrapper">
      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加参考图片输入"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 节点卡片 -->
      <div 
        class="node-card" 
        :class="{ 
          'drag-over': isDragOver,
          'is-processing': data.status === 'processing',
          'is-stacked': data.isStackedNode
        }"
        :style="contentStyle"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <!-- 彗星环绕发光特效（生成中显示） -->
        <svg v-if="data.status === 'processing'" class="comet-border" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <!-- 彗星渐变 -->
            <linearGradient id="comet-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="transparent" />
              <stop offset="70%" stop-color="rgba(74, 222, 128, 0.3)" />
              <stop offset="90%" stop-color="rgba(74, 222, 128, 0.8)" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <!-- 发光滤镜 -->
            <filter id="comet-glow" x="-50%" y="-50%" width="200%" height="200%">
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
            stroke="url(#comet-gradient)" 
            stroke-width="2"
            stroke-linecap="round"
            filter="url(#comet-glow)"
          />
        </svg>
        <!-- ========== 源节点：显示上传的图片 ========== -->
        <template v-if="isSourceNode && hasSourceImage">
          <!-- 上传按钮（右上角） -->
          <button class="upload-overlay-btn" @click="handleReupload">
            <span class="upload-icon">⬆</span>
            <span>上传</span>
          </button>
          
          <!-- 拖拽覆盖层 -->
          <div v-if="isDragOver" class="drag-overlay">
            <div class="drag-hint">
              <span class="drag-icon">📷</span>
              <span>放开以更换图片</span>
            </div>
          </div>
          
          <!-- 图片预览 -->
          <div class="source-image-preview">
            <img :src="sourceImages[0]" alt="上传的图片" />
          </div>
        </template>
        
        <!-- ========== 输出节点：显示生成结果或空状态 ========== -->
        <template v-else>
          <!-- 主内容区域 -->
          <div class="node-content">
            <!-- 加载中状态 - 简洁文字显示 -->
            <div v-if="data.status === 'processing'" class="preview-loading">
              <span class="processing-text">生成中</span>
            </div>
            
            <!-- 错误状态 -->
            <div v-else-if="data.status === 'error'" class="preview-error">
              <div class="error-icon">❌</div>
              <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
              <button class="retry-btn" @click="handleRegenerate">重试</button>
            </div>
            
            <!-- 输出预览 -->
            <div 
              v-else-if="hasOutput" 
              class="preview-images"
              :class="{ 'single-image': outputImages.length === 1 }"
            >
              <img 
                v-for="(img, index) in outputImages.slice(0, 4)" 
                :key="index"
                :src="img" 
                :alt="`生成结果 ${index + 1}`"
                class="preview-image"
              />
            </div>
            
            <!-- 有上游连接时 - 显示等待状态 -->
            <div v-else-if="hasUpstream" class="ready-state">
              <div class="ready-icon">🖼️</div>
              <div class="ready-text">
                <template v-if="inheritedPrompt">
                  <span class="prompt-preview">{{ inheritedPrompt.slice(0, 50) }}{{ inheritedPrompt.length > 50 ? '...' : '' }}</span>
                </template>
                <template v-else-if="referenceImages.length > 0">
                  已连接参考图片
                </template>
                <template v-else>
                  已连接，点击选中配置参数
                </template>
              </div>
              <div class="ready-hint">选中节点后在下方配置并生成</div>
            </div>
            
            <!-- 空状态 - 快捷操作 -->
            <div v-else class="empty-state">
              <div class="hint-text">尝试：</div>
              <div 
                v-for="action in quickActions"
                :key="action.label"
                class="quick-action"
                @click.stop="action.action"
              >
                <span class="action-icon">{{ action.icon }}</span>
                <span class="action-label">{{ action.label }}</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- Resize Handles -->
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
    
    <!-- 右侧输出端口（必须在根元素下） -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 底部配置面板（仅输出节点选中时显示） -->
    <div v-if="selected && !isSourceNode" class="config-panel" @mousedown.stop>
      <!-- 参考图片预览（支持拖拽上传和排序） -->
      <div 
        class="panel-frames"
        :class="{ 'drag-over': isRefDragOver }"
        @mousedown.stop
        @dragenter="handleRefDragEnter"
        @dragover="handleRefDragOver"
        @dragleave="handleRefDragLeave"
        @drop="handleRefDrop"
      >
        <div class="panel-frames-header">
          <span class="panel-frames-label">参考图片</span>
          <span class="panel-frames-hint">拖拽图片到此处 · 拖动调整顺序</span>
        </div>
        <div class="panel-frames-list">
          <!-- 现有图片（支持拖拽排序） -->
          <div 
            v-for="(img, index) in referenceImages" 
            :key="img + index"
            class="panel-frame-item"
            :class="{ 
              'drag-over': dragOverIndex === index,
              'dragging': dragSortIndex === index
            }"
            draggable="true"
            @mousedown="handleImageMouseDown"
            @dragstart="handleImageDragStart($event, index)"
            @dragover="handleImageDragOver($event, index)"
            @dragleave="handleImageDragLeave"
            @drop="handleImageDrop($event, index)"
            @dragend="handleImageDragEnd"
          >
            <img :src="img" :alt="`图片 ${index + 1}`" />
            <span class="panel-frame-label">{{ index + 1 }}</span>
            <button class="panel-frame-remove" @click.stop="removeReferenceImage(index)">×</button>
          </div>
          <!-- 添加按钮（使用 label 触发文件选择，更可靠） -->
          <label 
            :for="`ref-image-upload-${id}`"
            class="panel-frame-add"
            @mousedown.stop
          >
            <span class="add-icon">+</span>
            <span class="add-text">添加</span>
          </label>
        </div>
        <!-- 拖拽覆盖层 -->
        <div v-if="isRefDragOver" class="panel-drag-overlay">
          <span>释放以添加图片</span>
        </div>
      </div>
      
      <!-- 提示词输入 -->
      <div class="prompt-section">
        <textarea
          v-model="promptText"
          class="prompt-input"
          placeholder="描述你想要生成的内容，并在下方调整生成参数。(按下Enter 生成，Shift+Enter 换行)"
          rows="2"
          @keydown="handleKeyDown"
        ></textarea>
      </div>
      
      <!-- 参数配置行 -->
      <div class="config-row">
        <div class="config-left">
          <!-- 模型选择器 -->
          <div class="model-selector">
            <span class="model-icon">{{ models.find(m => m.value === selectedModel)?.icon || '🍌' }}</span>
            <select v-model="selectedModel" class="model-select-input">
              <option v-for="m in models" :key="m.value" :value="m.value">
                {{ m.label }}
              </option>
            </select>
            <span class="select-arrow">▾</span>
          </div>
          
          <!-- 比例选择（下拉框） -->
          <div class="ratio-selector">
            <span class="ratio-icon">📐</span>
            <select v-model="selectedAspectRatio" class="ratio-select-input">
              <option v-for="ratio in aspectRatios" :key="ratio.value" :value="ratio.value">
                {{ ratio.label }}
              </option>
            </select>
          </div>
          
          <!-- 尺寸切换（仅 nano-banana-2 显示） -->
          <div v-if="showResolutionOption" class="param-chip-group">
            <div 
              v-for="size in imageSizes" 
              :key="size.value"
              class="param-chip"
              :class="{ active: imageSize === size.value }"
              @click="imageSize = size.value"
            >
              {{ size.label }}
            </div>
          </div>
        </div>
        
        <div class="config-right">
          <!-- 数量（可点击切换） -->
          <span 
            class="count-display clickable" 
            @click="toggleCount"
            :title="`点击切换：1x → 2x → 4x（当前套餐最大 ${userConcurrentLimit}x）`"
          >
            {{ selectedCount }}x
          </span>
          
          <!-- 生成按钮 - 只在任务提交中禁用，节点生成中仍可点击发起新任务 -->
          <button 
            class="generate-btn"
            :disabled="isGenerating"
            @click="handleGenerate"
          >
            <span v-if="isGenerating" class="btn-loading">⏳</span>
            <svg v-else class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: visible;
  /* 覆盖 canvas-node 的默认边框，只使用内部 node-card 的边框 */
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* 节点标签 */
.node-label {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
}

/* 节点包装器 */
.node-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

/* 节点卡片 - 无边框设计 */
.node-card {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
}

/* 源节点（有图片）- 无边框 */
.image-node.is-source-node .node-card {
  background: transparent;
  border: none;
  overflow: visible;
}

/* 有输出结果且为单图时 - 无边框 */
.image-node.has-single-output .node-card {
  background: transparent;
  border: none;
  overflow: visible;
}

.image-node:hover .node-card {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.image-node.is-source-node:hover .node-card,
.image-node.has-single-output:hover .node-card {
  border-color: transparent;
}

.image-node.selected .node-card {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

/* ========== 彗星环绕发光特效（生成中） ========== */
.node-card.is-processing {
  position: relative;
  overflow: visible;
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

/* 处理中的节点边框发光 */
.node-card.is-processing {
  box-shadow: 
    0 0 10px rgba(74, 222, 128, 0.2),
    0 0 20px rgba(74, 222, 128, 0.1),
    inset 0 0 0 1px rgba(74, 222, 128, 0.3);
}

/* 堆叠节点样式 */
.node-card.is-stacked {
  opacity: 0.85;
  transform: scale(0.98);
  transition: all 0.3s ease;
}

.node-card.is-stacked:hover {
  opacity: 1;
  transform: scale(1);
  z-index: 10;
}

/* 拖拽悬停状态 */
.node-card.drag-over {
  border-color: var(--canvas-accent-success, #22c55e);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
}

/* 拖拽覆盖层 */
.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(34, 197, 94, 0.15);
  backdrop-filter: blur(2px);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  pointer-events: none; /* 防止阻止拖拽事件 */
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--canvas-accent-success, #22c55e);
  font-size: 14px;
  font-weight: 500;
}

.drag-icon {
  font-size: 32px;
}

/* ========== 源节点样式 - 无边框设计 ========== */
.source-image-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  overflow: hidden;
}

.source-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
  pointer-events: none;
  /* 添加轻微阴影增加层次感 */
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.upload-overlay-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  color: var(--canvas-text-primary, #fff);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-overlay-btn:hover {
  background: rgba(50, 50, 50, 0.95);
  border-color: var(--canvas-accent-primary, #3b82f6);
}

.upload-icon {
  font-size: 14px;
}

/* ========== 输出节点样式 ========== */
.node-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

/* 预览状态 - 简洁文字 */
.preview-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 12px;
}

.processing-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #888);
  letter-spacing: 2px;
}

.preview-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}

.error-icon {
  font-size: 24px;
}

.error-text {
  font-size: 12px;
  color: var(--canvas-accent-error, #ef4444);
  max-width: 200px;
}

.retry-btn {
  margin-top: 8px;
  padding: 6px 16px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 6px;
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 12px;
  cursor: pointer;
}

.retry-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
}

/* 输出预览 - 无边框设计 */
.preview-images {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 8px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 12px;
  overflow: hidden;
}

.preview-image {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.preview-image:hover {
  transform: scale(1.02);
}

/* 单图时 - 全尺寸无边框展示 */
.preview-images.single-image {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
}

.preview-images.single-image .preview-image {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 准备状态（有上游连接） */
.ready-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 20px;
}

.ready-icon {
  font-size: 48px;
  opacity: 0.6;
}

.ready-text {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  max-width: 200px;
}

.prompt-preview {
  color: var(--canvas-text-primary, #fff);
  font-style: italic;
}

.ready-hint {
  color: var(--canvas-text-tertiary, #666);
  font-size: 12px;
}

/* 空状态 */
.empty-state {
  flex: 1;
  padding: 8px;
}

.hint-text {
  color: var(--canvas-text-tertiary, #666);
  font-size: 13px;
  margin-bottom: 12px;
}

.quick-action {
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

.quick-action:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #fff);
}

.action-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
}

/* ========== 底部配置面板 ========== */
.config-panel {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  min-width: max(100%, 520px);
  max-width: 90vw;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  overflow: hidden;
  animation: slideDown 0.2s ease;
  z-index: 1000;
  pointer-events: auto;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 参考图片面板 */
.panel-frames {
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
  position: relative;
  transition: all 0.2s ease;
}

.panel-frames.drag-over {
  background: rgba(34, 197, 94, 0.1);
  border-color: var(--canvas-accent-success, #22c55e);
}

.panel-frames-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.panel-frames-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #888);
  padding: 4px 10px;
  background: var(--canvas-bg-tertiary, #2a2a2a);
  border-radius: 4px;
}

.panel-frames-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
}

.panel-frames-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.panel-frame-item {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--canvas-border-default, #3a3a3a);
  cursor: grab;
  transition: all 0.2s ease;
  user-select: none;
}

.panel-frame-item:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.panel-frame-item:active {
  cursor: grabbing;
}

.panel-frame-item.dragging {
  opacity: 0.4;
  transform: scale(0.9);
  border-color: var(--canvas-accent-primary, #3b82f6);
  z-index: 10;
}

.panel-frame-item.drag-over {
  transform: scale(1.05);
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
}

.panel-frame-item.drag-over::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--canvas-accent-primary, #3b82f6);
  border-radius: 2px;
  z-index: 20;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.panel-frame-item:hover .panel-frame-remove {
  opacity: 1;
}

.panel-frame-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.panel-frame-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  text-align: center;
  padding: 2px 0;
}

.panel-frame-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  font-size: 14px;
  font-weight: 600;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.panel-frame-remove:hover {
  background: #ef4444;
}

.panel-frame-add {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  border: 1px dashed var(--canvas-border-default, #3a3a3a);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
  box-sizing: border-box;
}

.panel-frame-add:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.1);
}

.panel-frame-add .add-icon {
  font-size: 20px;
  color: var(--canvas-text-tertiary, #666);
}

.panel-frame-add .add-text {
  font-size: 9px;
  color: var(--canvas-text-tertiary, #666);
}

.panel-frame-add:hover .add-icon,
.panel-frame-add:hover .add-text {
  color: var(--canvas-accent-primary, #3b82f6);
}

.panel-drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(34, 197, 94, 0.2);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--canvas-accent-success, #22c55e);
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  pointer-events: none;
}

.prompt-section {
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.prompt-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--canvas-text-primary, #fff);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
}

.prompt-input::placeholder {
  color: var(--canvas-text-placeholder, #4a4a4a);
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 16px;
  flex-wrap: nowrap;
}

.config-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.config-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* 模型选择器 */
.model-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.model-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.model-icon {
  font-size: 14px;
}

.model-select-input {
  background: rgba(0, 0, 0, 0.4);
  border: none;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  padding: 2px 4px;
  padding-right: 4px;
  border-radius: 4px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

.model-select-input option {
  background: #1a1a1a;
  color: #ffffff;
  padding: 8px;
}

.model-select-input:hover {
  background: rgba(0, 0, 0, 0.6);
}

.select-arrow {
  color: var(--canvas-text-tertiary, #999);
  font-size: 10px;
  margin-left: -4px;
}

/* 比例选择器 */
.ratio-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.ratio-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.ratio-icon {
  font-size: 12px;
}

.ratio-select-input {
  background: rgba(0, 0, 0, 0.4);
  border: none;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  padding: 2px 4px;
  border-radius: 4px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  padding-right: 2px;
}

.ratio-select-input option {
  background: #1a1a1a;
  color: #ffffff;
  padding: 8px;
}

.ratio-select-input:hover {
  background: rgba(0, 0, 0, 0.6);
}

/* 参数选择芯片 */
.param-chip {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 6px;
  color: var(--canvas-text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.param-chip:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
  color: var(--canvas-text-primary, #fff);
}

.param-chip.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
}

.param-chip-group {
  display: flex;
  gap: 6px;
}

.count-display {
  font-size: 14px;
  color: var(--canvas-text-secondary, #888);
  font-weight: 500;
}

.count-display.clickable {
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  transition: all 0.2s;
}

.count-display.clickable:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
}

.generate-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.5);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-arrow {
  stroke: white;
}

.btn-loading {
  font-size: 14px;
}

/* ========== 端口样式 - 完全隐藏（但保留给 Vue Flow 用于边渲染） ========== */
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

/* ========== 添加按钮 ========== */
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

.node-wrapper:hover .node-add-btn {
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

/* ========== Resize Handles ========== */
.resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.node-card:hover .resize-handle {
  opacity: 1;
}

.resize-handle-right {
  right: -2px;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
}

.resize-handle-right:hover {
  background: var(--canvas-accent-primary, #3b82f6);
}

.resize-handle-bottom {
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 4px;
  cursor: ns-resize;
}

.resize-handle-bottom:hover {
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
