<script setup>
/**
 * VideoNode.vue - 视频节点（统一设计）
 * 
 * 设计规范：
 * - 主体区域：空状态显示快捷操作，有输出显示视频预览
 * - 左侧(+)：可选参考图片输入（支持多图，如首帧/尾帧）
 * - 右侧(+)：输出连接
 * - 底部配置面板：选中时显示，包含提示词输入和生成参数
 */
import { ref, computed, inject, watch, onMounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getTenantHeaders, isModelEnabled, getModelDisplayName } from '@/config/tenant'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')
const promptText = ref(props.data.prompt || '')

// 拖拽上传状态
const isDragOver = ref(false)
const dragCounter = ref(0)
const frameInputRef = ref(null)

// 图片列表拖拽排序状态
const dragSortIndex = ref(-1)
const dragOverIndex = ref(-1)

// 生成模式：image（图生视频）, text（纯文本）
const generationMode = ref(props.data.generationMode || 'text')

// 生成参数
const selectedModel = ref(props.data.model || 'sora-2')
const selectedAspectRatio = ref(props.data.aspectRatio || '16:9')
const selectedDuration = ref(props.data.duration || '10')
const selectedCount = ref(props.data.count || 1)

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

// VEO3模型列表（不支持时长参数）
const VEO3_MODELS = ['veo3.1-components', 'veo3.1', 'veo3.1-pro']

// 当前模型是否为VEO3系列
const isVeo3Model = computed(() => VEO3_MODELS.includes(selectedModel.value))

// 积分配置（从后端加载）
const pointsCostConfig = ref({
  'sora-2': { '10': 20, '15': 30 },
  'sora-2-pro': { '10': 300, '15': 450, '25': 750 },
  'veo3.1-components': 100,
  'veo3.1': 150,
  'veo3.1-pro': 200
})

// 可用的时长选项（根据模型动态计算）
const availableDurations = computed(() => {
  if (isVeo3Model.value) {
    return [] // VEO3模型不支持时长选择
  }
  const config = pointsCostConfig.value[selectedModel.value] || {}
  return Object.keys(config).filter(key => key !== 'hd_extra').sort((a, b) => Number(a) - Number(b))
})

// 获取模型显示名称
function getModelName(modelKey) {
  const customName = getModelDisplayName ? getModelDisplayName(modelKey, 'video') : null
  if (customName) return customName
  
  const defaultNames = {
    'sora-2': 'Sora 2',
    'sora-2-pro': 'Sora 2 Pro',
    'veo3.1-components': 'VEO 3.1',
    'veo3.1': 'VEO 3.1 标准',
    'veo3.1-pro': 'VEO 3.1 Pro'
  }
  return defaultNames[modelKey] || modelKey
}

// 可用模型列表（从启用的模型中筛选）
const models = computed(() => {
  const allModels = [
    { value: 'sora-2', label: 'Sora 2', icon: '🎬' },
    { value: 'sora-2-pro', label: 'Sora 2 Pro', icon: '⭐' },
    { value: 'veo3.1-components', label: 'VEO 3.1', icon: '🎥' },
    { value: 'veo3.1', label: 'VEO 3.1 标准', icon: '📹' },
    { value: 'veo3.1-pro', label: 'VEO 3.1 Pro', icon: '🌟' }
  ]
  
  // 如果有模型启用检查函数，则过滤
  if (typeof isModelEnabled === 'function') {
    return allModels.filter(m => isModelEnabled(m.value, 'video'))
  }
  return allModels
})

const aspectRatios = [
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' }
]

// 时长选项（动态计算）
const durations = computed(() => {
  return availableDurations.value.map(d => ({
    value: d,
    label: `${d}s`
  }))
})

// 从后端加载视频配置
async function loadVideoConfig() {
  try {
    const response = await fetch('/api/video/config', { headers: getTenantHeaders() })
    if (response.ok) {
      const data = await response.json()
      if (data.points_cost) {
        pointsCostConfig.value = data.points_cost
        console.log('[VideoNode] 视频配置已加载:', data.points_cost)
      }
    }
  } catch (e) {
    console.error('[VideoNode] 加载视频配置失败:', e)
  }
}

onMounted(() => {
  loadVideoConfig()
})

// 节点尺寸 - 视频节点使用16:9比例
const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 280)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'video-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'success': props.data.status === 'success',
  'error': props.data.status === 'error',
  'resizing': isResizing.value
}))

// 节点内容样式
const contentStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  minHeight: `${nodeHeight.value}px`
}))

// 是否有输出
const hasOutput = computed(() => !!props.data.output?.url)

// 进度百分比（从 progress 字符串中提取数字）
const progressPercent = computed(() => {
  const progress = props.data.progress
  if (!progress) return 0
  
  // 尝试从 progress 字符串中提取百分比数字
  // 支持格式：50%, 50, "50%", "进度: 50%", "Processing 50%" 等
  const match = String(progress).match(/(\d+)%?/)
  if (match) {
    return Math.min(100, Math.max(0, parseInt(match[1], 10)))
  }
  
  // 如果是状态文本，给一个估计值
  const statusMap = {
    '排队中': 5,
    'pending': 5,
    'queued': 5,
    '准备中': 10,
    'not_start': 10,
    '生成中': 50,
    'processing': 50,
    'in_progress': 50,
    'running': 60
  }
  
  const lowerProgress = String(progress).toLowerCase()
  for (const [key, value] of Object.entries(statusMap)) {
    if (lowerProgress.includes(key.toLowerCase())) {
      return value
    }
  }
  
  return 0
})

// 判断是否有上游连接（用于显示"已连接"状态）
const hasUpstream = computed(() => {
  return props.data.hasUpstream || props.data.inheritedFrom || props.data.inheritedData
})

// 收集上游节点的所有图片（不考虑顺序）
function collectUpstreamImages() {
  const upstreamImages = []
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  
  for (const edge of upstreamEdges) {
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    // 图片节点：获取图片
    if (sourceNode.type === 'image-input' || sourceNode.type === 'image' || sourceNode.type === 'image-gen') {
      // 优先使用输出结果
      if (sourceNode.data?.output?.urls?.length > 0) {
        upstreamImages.push(...sourceNode.data.output.urls)
      } else if (sourceNode.data?.output?.url) {
        upstreamImages.push(sourceNode.data.output.url)
      }
      // 其次使用源图片
      else if (sourceNode.data?.sourceImages?.length > 0) {
        upstreamImages.push(...sourceNode.data.sourceImages)
      }
    }
  }
  
  return upstreamImages
}

// 参考图片（来自左侧输入，支持多张图片，支持自定义顺序）
const referenceImages = computed(() => {
  // 收集上游图片
  const upstreamImages = collectUpstreamImages()
  
  // 如果有用户自定义的顺序，按顺序返回
  const customOrder = props.data.imageOrder || []
  if (customOrder.length > 0 && upstreamImages.length > 0) {
    // 按自定义顺序排列，同时包含新添加的图片
    const orderedImages = []
    const remainingImages = [...upstreamImages]
    
    // 先按顺序添加已排序的图片
    for (const url of customOrder) {
      const index = remainingImages.indexOf(url)
      if (index !== -1) {
        orderedImages.push(url)
        remainingImages.splice(index, 1)
      }
    }
    
    // 再添加新图片（不在自定义顺序中的）
    orderedImages.push(...remainingImages)
    
    return orderedImages
  }
  
  // 没有自定义顺序，直接返回上游图片
  if (upstreamImages.length > 0) {
    return upstreamImages
  }
  
  // 其次使用继承的图片数据
  if (props.data.inheritedData?.type === 'image' && props.data.inheritedData?.urls?.length > 0) {
    return props.data.inheritedData.urls
  }
  
  // 最后使用直接设置的 referenceImages
  if (props.data.referenceImages?.length > 0) {
    return props.data.referenceImages
  }
  
  return []
})
const firstFrame = computed(() => referenceImages.value[0] || null)
const lastFrame = computed(() => referenceImages.value[1] || referenceImages.value[0] || null)

// 继承的文本提示词（来自上游文本节点）
const inheritedPrompt = computed(() => {
  const data = props.data.inheritedData
  if (data?.type === 'text' && data?.content) {
    return data.content
  }
  return ''
})

// 获取上游节点的最新数据（实时读取，不依赖缓存）
function getUpstreamData() {
  // 查找所有连接到当前节点的上游边
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  if (upstreamEdges.length === 0) return { prompt: '', images: [] }
  
  let prompt = ''
  let images = []
  
  // 遍历所有上游节点，收集数据
  for (const edge of upstreamEdges) {
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    // 文本节点：获取文本内容
    if (sourceNode.type === 'text-input' || sourceNode.type === 'text') {
      const text = sourceNode.data?.text || ''
      // 去除 HTML 标签
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = text
      const cleanText = tempDiv.textContent || tempDiv.innerText || ''
      if (cleanText && !prompt) {
        prompt = cleanText
      }
    }
    
    // 图片节点：获取图片
    if (sourceNode.type === 'image-input' || sourceNode.type === 'image' || sourceNode.type === 'image-gen') {
      // 优先使用输出结果
      if (sourceNode.data?.output?.urls?.length > 0) {
        images = [...images, ...sourceNode.data.output.urls]
      } else if (sourceNode.data?.output?.url) {
        images.push(sourceNode.data.output.url)
      }
      // 其次使用源图片
      else if (sourceNode.data?.sourceImages?.length > 0) {
        images = [...images, ...sourceNode.data.sourceImages]
      }
    }
  }
  
  return { prompt, images }
}

// 监听继承数据变化，自动填充提示词
watch(() => props.data.inheritedData, (newData) => {
  if (newData?.type === 'text' && newData?.content && !promptText.value) {
    promptText.value = newData.content
  }
}, { immediate: true })

// 积分消耗计算
const pointsCost = computed(() => {
  // VEO3模型使用固定积分
  if (isVeo3Model.value) {
    return pointsCostConfig.value[selectedModel.value] || 100
  }
  
  const modelConfig = pointsCostConfig.value[selectedModel.value] || {}
  return modelConfig[selectedDuration.value] || 20
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 模式标签显示
const modeLabel = computed(() => {
  // 根据是否有参考图片自动判断模式
  if (referenceImages.value.length > 0) {
    return '图生视频'
  }
  return '文生视频'
})

// 快捷操作
const quickActions = [
  { 
    icon: '✍️', 
    label: '文生视频', 
    action: () => {
      generationMode.value = 'text'
      canvasStore.selectNode(props.id)
    }
  },
  { 
    icon: '🖼️', 
    label: '图生视频', 
    action: () => {
      generationMode.value = 'image'
      canvasStore.selectNode(props.id)
    }
  }
]

// 监听参数变化，保存到store
watch([selectedModel, selectedAspectRatio, selectedDuration, selectedCount, promptText, generationMode], 
  ([model, aspectRatio, duration, count, prompt, mode]) => {
    canvasStore.updateNodeData(props.id, {
      model,
      aspectRatio,
      duration,
      count,
      prompt,
      generationMode: mode
    })
  }
)

// 设置生成模式
function setGenerationMode(mode) {
  generationMode.value = mode
  canvasStore.selectNode(props.id)
}

// 并发间隔时间（毫秒）
const CONCURRENT_INTERVAL = 5000

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 单次生成请求
async function sendGenerateRequest(finalPrompt, finalImages) {
  const token = localStorage.getItem('token')
  
  // 构建请求数据
  const formData = new FormData()
  formData.append('prompt', finalPrompt || '根据图片生成视频')
  formData.append('model', selectedModel.value)
  formData.append('aspect_ratio', selectedAspectRatio.value)
  
  // VEO3 模型不需要时长参数
  if (!isVeo3Model.value) {
    formData.append('duration', selectedDuration.value)
  }
  
  // 如果有参考图片，添加图片 URL
  if (finalImages.length > 0) {
    for (const imageUrl of finalImages) {
      formData.append('image_urls', imageUrl)
    }
  }
  
  const response = await fetch('/api/videos/generate', {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.message || data.error || '生成失败')
  }
  
  return data
}

// 开始生成
async function handleGenerate() {
  // 动态获取上游节点的最新数据
  const upstreamData = getUpstreamData()
  
  // 合并提示词：用户输入 > 上游文本 > 继承数据
  const finalPrompt = promptText.value.trim() || upstreamData.prompt || inheritedPrompt.value
  
  // 合并参考图片：上游图片 > 继承图片 > 已设置的参考图
  const finalImages = upstreamData.images.length > 0 ? upstreamData.images : referenceImages.value
  
  console.log('[VideoNode] 生成参数:', { 
    userPrompt: promptText.value.trim(),
    upstreamPrompt: upstreamData.prompt,
    finalPrompt,
    upstreamImages: upstreamData.images,
    finalImages,
    model: selectedModel.value,
    duration: selectedDuration.value,
    count: selectedCount.value
  })
  
  if (!finalPrompt && finalImages.length === 0) {
    alert('请输入提示词或连接参考图片')
    return
  }
  
  // 检查总积分是否足够（单次消耗 * 次数）
  const totalCost = pointsCost.value * selectedCount.value
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
  canvasStore.updateNodeData(props.id, { 
    status: 'processing', 
    progress: generateCount > 1 ? `准备发送 ${generateCount} 个请求...` : '排队中'
  })
  
  try {
    // 多次请求，每次间隔5秒
    for (let i = 0; i < generateCount; i++) {
      if (i > 0) {
        canvasStore.updateNodeData(props.id, { 
          progress: `等待发送第 ${i + 1}/${generateCount} 个请求...`
        })
        await delay(CONCURRENT_INTERVAL)
      }
      
      console.log(`[VideoNode] 发送第 ${i + 1}/${generateCount} 个生成请求...`)
      canvasStore.updateNodeData(props.id, { 
        progress: `发送第 ${i + 1}/${generateCount} 个请求...`
      })
      
      const data = await sendGenerateRequest(finalPrompt, finalImages)
      const taskId = data.task_id || data.id
      console.log(`[VideoNode] 第 ${i + 1} 个任务已提交:`, taskId)
      
      // 最后一个请求开始后台轮询（不阻塞UI）
      if (i === generateCount - 1) {
        if (taskId) {
          // 任务提交成功，立即恢复按钮状态
          isGenerating.value = false
          // 后台轮询，不阻塞
          pollVideoTask(taskId)
        } else if (data.video_url || data.url) {
          canvasStore.updateNodeData(props.id, {
            status: 'success',
            output: {
              type: 'video',
              url: data.video_url || data.url
            }
          })
          isGenerating.value = false
        }
      }
    }
    
    // 刷新用户积分
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
  } catch (error) {
    console.error('[VideoNode] 生成失败:', error)
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
    isGenerating.value = false
  }
}

// 轮询视频任务状态
async function pollVideoTask(taskId) {
  const token = localStorage.getItem('token')
  const MAX_POLL_TIME = 600000 // 10分钟超时
  const POLL_INTERVAL = 4000 // 4秒轮询一次
  const startTime = Date.now()
  
  const poll = async () => {
    try {
      // 检查超时
      if (Date.now() - startTime > MAX_POLL_TIME) {
        throw new Error('生成超时，请稍后在历史记录中查看')
      }
      
      const response = await fetch(`/api/videos/task/${taskId}`, {
        headers: { 
          ...getTenantHeaders(), 
          ...(token ? { Authorization: `Bearer ${token}` } : {}) 
        }
      })
      
      if (!response.ok) {
        throw new Error('查询任务状态失败')
      }
      
      const data = await response.json()
      console.log('[VideoNode] 任务状态:', data)
      
      // 更新进度
      canvasStore.updateNodeData(props.id, { 
        progress: data.progress || '生成中...'
      })
      
      // 检查完成状态
      const status = (data.status || '').toLowerCase()
      if (status === 'completed' || status === 'success') {
        const videoUrl = data.video_url || data.url
        if (videoUrl) {
          canvasStore.updateNodeData(props.id, {
            status: 'success',
            output: {
              type: 'video',
              url: videoUrl
            }
          })
          isGenerating.value = false
          return
        }
      }
      
      // 检查失败状态
      if (status === 'failed' || status === 'failure' || status === 'error') {
        throw new Error(data.fail_reason || '视频生成失败')
      }
      
      // 继续轮询
      setTimeout(poll, POLL_INTERVAL)
      
    } catch (error) {
      console.error('[VideoNode] 轮询失败:', error)
      errorMessage.value = error.message || '生成失败'
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: error.message
      })
      isGenerating.value = false
    }
  }
  
  // 开始轮询
  poll()
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
    nodeWidth.value = Math.max(320, resizeStart.value.width + deltaX / zoom)
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

// ========== 首尾帧图片拖拽上传 ==========
// 上传图片文件
async function uploadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 触发文件选择并创建左侧图片节点
function triggerFrameUpload() {
  if (frameInputRef.value) {
    frameInputRef.value.click()
  }
}

// 处理文件选择 - 直接创建上游图片节点
async function handleFrameFileChange(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  event.target.value = '' // 重置 input
  
  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const imageUrl = await uploadImageFile(file)
        // 为每张图片创建上游节点
        createUpstreamImageNode(imageUrl)
      }
    }
  } catch (error) {
    console.error('[VideoNode] 上传失败:', error)
  }
}

// 创建上游图片节点
function createUpstreamImageNode(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 计算新节点位置（在当前节点左侧，根据已有上游节点数量垂直排列）
  const existingUpstreamCount = canvasStore.edges.filter(e => e.target === props.id).length
  const offsetY = existingUpstreamCount * 200
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x - 500,
    y: currentNode.position.y + offsetY - 100
  }
  
  // 创建图片节点
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
  
  // 创建连接
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 更新图片顺序
  const currentOrder = props.data.imageOrder || [...referenceImages.value]
  canvasStore.updateNodeData(props.id, {
    imageOrder: [...currentOrder, imageUrl],
    hasUpstream: true
  })
}

// 判断是否为外部文件拖拽（非内部排序）
function isExternalFileDrag(event) {
  const types = event.dataTransfer?.types || []
  // 如果是内部拖动排序，只有 text/plain
  // 如果是外部文件拖入，会有 Files
  return types.includes('Files') && !dragSortIndex.value !== -1 && dragSortIndex.value === -1
}

// 拖拽进入（仅处理外部文件）
function handleFrameDragEnter(event) {
  // 如果是内部排序拖拽，不处理
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  
  // 只在外部文件拖入时显示覆盖层
  if (event.dataTransfer?.types?.includes('Files')) {
    dragCounter.value++
    isDragOver.value = true
  }
}

// 拖拽悬停（仅处理外部文件）
function handleFrameDragOver(event) {
  event.preventDefault()
  
  // 如果是内部排序拖拽，设置为 move 效果
  if (dragSortIndex.value !== -1) {
    event.dataTransfer.dropEffect = 'move'
    return
  }
  
  // 外部文件拖入，设置为 copy 效果
  if (event.dataTransfer?.types?.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

// 拖拽离开（仅处理外部文件）
function handleFrameDragLeave(event) {
  // 如果是内部排序拖拽，不处理
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragOver.value = false
  }
}

// 拖拽放置 - 仅处理外部文件上传
async function handleFrameDrop(event) {
  // 如果是内部排序拖拽，不在这里处理（由 handleImageDrop 处理）
  if (dragSortIndex.value !== -1) {
    return
  }
  
  event.preventDefault()
  event.stopPropagation()
  isDragOver.value = false
  dragCounter.value = 0
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const imageUrl = await uploadImageFile(file)
        // 为每张图片创建上游节点
        createUpstreamImageNode(imageUrl)
      }
    }
  } catch (error) {
    console.error('[VideoNode] 拖拽上传失败:', error)
  }
}

// 更新参考图片（并在左侧创建对应的图片节点）
// 删除某张参考图片
function removeReferenceImage(index) {
  const currentImages = [...(referenceImages.value || [])]
  const removedImage = currentImages[index]
  currentImages.splice(index, 1)
  
  // 更新图片顺序
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
  
  // 删除连接和节点
  edgesToRemove.forEach(edgeId => canvasStore.removeEdge(edgeId))
  nodesToRemove.forEach(nodeId => canvasStore.removeNode(nodeId))
}

// ========== 图片列表拖拽排序 ==========
// 阻止图片项的 mousedown 事件冒泡，防止触发节点拖拽
function handleImageMouseDown(event) {
  event.stopPropagation()
}

function handleImageDragStart(event, index) {
  event.stopPropagation()
  dragSortIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())
  // 添加拖拽样式
  event.target.classList.add('dragging')
}

function handleImageDragOver(event, index) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function handleImageDragLeave(event) {
  // 只在离开整个元素时才重置
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
  
  // 重新排序图片
  const images = [...(referenceImages.value || [])]
  const [draggedImage] = images.splice(dragIndex, 1)
  images.splice(dropIndex, 0, draggedImage)
  
  // 保存新的图片顺序到节点数据
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

// 右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'video', position: { x: 0, y: 0 }, data: props.data }
  )
}

// ========== 添加按钮交互（单击/长按） ==========
const LONG_PRESS_DURATION = 300 // 长按阈值（毫秒）
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

// 左侧添加按钮
function handleAddLeftClick(event) {
  event.stopPropagation()
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY },
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
    console.warn('[VideoNode] 未找到当前节点')
    return
  }
  
  // 计算节点右侧输出端口的画布坐标（从节点位置计算）
  // 节点位置 + 节点宽度 = 右侧边缘，Y 轴在节点中间 + 标签高度偏移
  const currentNodeWidth = props.data?.width || nodeWidth.value || 420
  const currentNodeHeight = props.data?.height || nodeHeight.value || 280
  const labelOffset = 28 // 标签高度偏移
  
  const outputX = currentNode.position.x + currentNodeWidth
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[VideoNode] 开始拖拽连线，起始位置:', { outputX, outputY, nodePosition: currentNode.position })
  
  // 调用 store 开始拖拽连线，使用节点输出端口位置作为起点
  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
}

// 兼容旧的点击事件（备用）
function handleAddRightClick(event) {
  event.stopPropagation()
}

// 下载视频
function downloadVideo() {
  if (props.data.output?.url) {
    window.open(props.data.output.url, '_blank')
  }
}
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 左侧输入端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 节点标签 -->
    <div class="node-label">video</div>
    
    <!-- 节点主体 -->
    <div class="node-wrapper">
      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加参考图片（首帧/尾帧）"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 节点卡片 -->
      <div class="node-card" :style="contentStyle">
        <!-- 主内容区域 -->
        <div class="node-content">
          <!-- 加载中状态 -->
          <div v-if="data.status === 'processing'" class="preview-loading">
            <div class="loading-spinner"></div>
            <span class="loading-title">视频生成中...</span>
            <!-- 进度百分比 -->
            <span v-if="progressPercent > 0" class="progress-percent">{{ progressPercent }}%</span>
            <span class="loading-hint">预计 1-3 分钟</span>
          </div>
          
          <!-- 错误状态 -->
          <div v-else-if="data.status === 'error'" class="preview-error">
            <div class="error-icon">❌</div>
            <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
            <button class="retry-btn" @click="handleRegenerate">重试</button>
          </div>
          
          <!-- 输出预览 -->
          <div v-else-if="hasOutput" class="video-preview">
            <video 
              :src="data.output.url" 
              controls
              preload="auto"
              class="video-player"
              @loadeddata="$event.target.currentTime = 0.1"
            ></video>
            <div class="video-actions">
              <button class="action-btn" @click="downloadVideo">⬇️ 下载</button>
              <button class="action-btn" @click="handleRegenerate">🔄 重新生成</button>
            </div>
          </div>
          
          <!-- 有上游连接时 - 显示"已连接"等待状态 -->
          <div v-else-if="hasUpstream" class="ready-state">
            <div class="ready-icon">🎬</div>
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
    
    <!-- 右侧输出端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 隐藏的文件上传 input（支持多选） -->
    <input 
      ref="frameInputRef"
      type="file" 
      accept="image/*"
      multiple
      class="hidden-file-input"
      @change="handleFrameFileChange"
    />
    
    <!-- 底部配置面板（选中时显示） -->
    <div v-if="selected" class="config-panel" @mousedown.stop>
      <!-- 参考图片预览（支持拖拽上传） -->
      <div 
        class="panel-frames"
        :class="{ 'drag-over': isDragOver }"
        @mousedown.stop
        @dragenter="handleFrameDragEnter"
        @dragover="handleFrameDragOver"
        @dragleave="handleFrameDragLeave"
        @drop="handleFrameDrop"
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
          <!-- 添加按钮 -->
          <div 
            class="panel-frame-add"
            @mousedown.stop
            @click.stop="triggerFrameUpload"
          >
            <span class="add-icon">+</span>
            <span class="add-text">添加</span>
          </div>
        </div>
        <!-- 拖拽覆盖层 -->
        <div v-if="isDragOver" class="panel-drag-overlay">
          <span>释放以添加图片</span>
        </div>
      </div>
      
      <!-- 模式标签 + 提示词输入 -->
      <div class="prompt-section">
        <textarea
          v-model="promptText"
          class="prompt-input"
          placeholder="描述你想要生成的内容，并在下方调整生成参数。(按下Enter 生成，Shift+Enter 换行)"
          rows="3"
          @keydown="handleKeyDown"
        ></textarea>
      </div>
      
      <!-- 参数配置行 -->
      <div class="config-row">
        <div class="config-left">
          <!-- 模型选择器 -->
          <div class="model-selector">
            <span class="model-wave-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12h2l3-9 4 18 4-9 3 4h4"/>
              </svg>
            </span>
            <select v-model="selectedModel" class="model-select-input">
              <option v-for="model in models" :key="model.value" :value="model.value">
                {{ model.label }}
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
          
          <!-- 时长切换（VEO3模型不显示） -->
          <div v-if="!isVeo3Model && durations.length > 0" class="param-chip-group">
            <div 
              v-for="d in durations" 
              :key="d.value"
              class="param-chip"
              :class="{ active: selectedDuration === d.value }"
              @click="selectedDuration = d.value"
            >
              {{ d.label }}
            </div>
          </div>
        </div>
        
        <div class="config-right">
          <!-- 生成次数（可点击切换） -->
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
.video-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 确保配置面板不影响节点的选中框计算 */
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

/* 节点卡片 */
.node-card {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s ease;
}

.video-node:hover .node-card {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.video-node.selected .node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* 主内容区域 */
.node-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

/* 首尾帧预览 */
.frames-preview {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.frame-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.frame-item img {
  width: 80px;
  height: 45px;
  object-fit: cover;
  border-radius: 6px;
  background: var(--canvas-bg-secondary, #141414);
}

.frame-label {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
}

/* 预览状态 */
.preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--canvas-border-default, #3a3a3a);
  border-top-color: var(--canvas-accent-primary, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
}

.progress-percent {
  font-size: 24px;
  font-weight: 600;
  color: var(--canvas-accent-primary, #3b82f6);
  margin: 8px 0;
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

/* 视频预览 */
.video-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.video-player {
  width: 100%;
  flex: 1;
  border-radius: 8px;
  background: #000;
}

.video-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 6px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-text-primary, #fff);
}

/* 已连接等待状态（与 ImageNode 一致） */
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

/* 底部配置面板 - 自适应内容宽度，确保参数完整显示 */
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

/* 配置面板中的参考图片 */
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

/* 拖拽排序时的位置指示器 */
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

.mode-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--canvas-text-primary, #fff);
  margin-bottom: 8px;
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
  border-top: 1px solid var(--canvas-border-subtle, #2a2a2a);
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

.model-wave-icon {
  display: flex;
  align-items: center;
  color: var(--canvas-text-tertiary, #666);
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

/* 端口样式 - 完全隐藏（但保留给 Vue Flow 用于边渲染） */
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

/* Resize Handles */
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

/* 隐藏的文件输入 - 使用更可靠的隐藏方式 */
.hidden-file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
  z-index: -1;
}
</style>
