<script setup>
/**
 * InplaceImageEditor.vue - 原地图片编辑器
 * 
 * 功能：
 * - 点击重绘/擦除时，图片节点原地放大居中（平滑动画）
 * - 显示简洁的蒙版绘制工具栏（黑白灰风格）
 * - 下方显示提示词输入框
 * - 调用 nano-banana-2 模型进行重绘/擦除
 * - 自动创建输出节点接收结果
 * 
 * 交互设计：
 * - 不弹出新窗口，在画布上原地编辑
 * - 无遮罩背景，画布仍然可见
 * - 图片从节点位置平滑放大居中显示
 * - 简洁的工具栏：画笔、矩形选框、橡皮擦、笔刷大小、撤销、重做
 * - 底部提示词输入框 + 生成按钮
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { generateImageFromImage, uploadImages, pollTaskStatus } from '@/api/canvas/nodes'
import { useI18n } from '@/i18n'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

const { t, currentLanguage } = useI18n()
const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// 后端积分配置
const pointsCostConfig = ref({
  'nano-banana-2': {
    '1K': 3,
    '2K': 4,
    '4K': 5
  }
})

// 从后端加载积分配置
async function loadPointsConfig() {
  try {
    const response = await fetch(getApiUrl('/api/points-config'), {
      headers: getTenantHeaders()
    })
    if (response.ok) {
      const data = await response.json()
      if (data.points_cost?.['nano-banana-2']) {
        // 后端返回的key是小写，需要转换
        const backendConfig = data.points_cost['nano-banana-2']
        pointsCostConfig.value['nano-banana-2'] = {
          '1K': backendConfig['1k'] || backendConfig['1K'] || 3,
          '2K': backendConfig['2k'] || backendConfig['2K'] || 4,
          '4K': backendConfig['4k'] || backendConfig['4K'] || 5
        }
        console.log('[InplaceImageEditor] 积分配置已加载:', pointsCostConfig.value)
      }
    }
  } catch (error) {
    console.error('[InplaceImageEditor] 加载积分配置失败:', error)
  }
}

// 画布引用
const containerRef = ref(null)
const canvasRef = ref(null)
const maskCanvasRef = ref(null)
const ctx = ref(null)
const maskCtx = ref(null)

// 动画状态
const isAnimating = ref(false)
const animationPhase = ref('idle') // 'idle' | 'entering' | 'active' | 'leaving'
const sourceRect = ref(null) // 原图节点的位置和尺寸
const targetRect = ref(null) // 目标位置（居中放大后）

// 状态
const isVisible = computed(() => canvasStore.isInEditMode && 
  ['repaint', 'erase'].includes(canvasStore.editTool))

const editTool = computed(() => canvasStore.editTool)
const editingNodeId = computed(() => canvasStore.editingNodeId)

// 获取当前编辑的节点和图片
const editingNode = computed(() => {
  if (!editingNodeId.value) return null
  return canvasStore.nodes.find(n => n.id === editingNodeId.value)
})

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

// 绘图状态
const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)
const brushSize = ref(30)
const currentDrawTool = ref('brush') // 'brush', 'rect', 'eraser'

// 历史记录
const history = ref([])
const historyIndex = ref(-1)
const maxHistory = 20

// 提示词
const prompt = ref('')
const isGenerating = ref(false)

// 生成参数
const selectedSize = ref('1K') // 1K, 2K, 4K
const selectedCount = ref(1) // 1, 2, 4

// 尺寸选项（点击循环切换）
const sizeOptions = ['1K', '2K', '4K']

// 张数选项（点击循环切换）
const countOptions = [1, 2, 4]

// 切换尺寸
function toggleSize() {
  const currentIndex = sizeOptions.indexOf(selectedSize.value)
  const nextIndex = (currentIndex + 1) % sizeOptions.length
  selectedSize.value = sizeOptions[nextIndex]
}

// 切换张数
function toggleCount() {
  const currentIndex = countOptions.indexOf(selectedCount.value)
  const nextIndex = (currentIndex + 1) % countOptions.length
  selectedCount.value = countOptions[nextIndex]
}

// 计算单次积分（根据尺寸从后端配置获取）
const pointsPerBatch = computed(() => {
  const config = pointsCostConfig.value['nano-banana-2']
  return config[selectedSize.value] || 5
})

// 计算当前需要的积分（单次积分 * 批次数）
const requiredPoints = computed(() => {
  return pointsPerBatch.value * selectedCount.value
})

// 用户当前积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 积分是否足够
const hasEnoughPoints = computed(() => {
  return userPoints.value >= requiredPoints.value
})

// 积分文本（多语言）
const pointsLabel = computed(() => {
  const labels = {
    'zh-CN': '积分',
    'zh-TW': '積分',
    'en': 'pts',
    'ja': 'ポイント',
    'ko': '포인트',
    'es': 'pts',
    'fr': 'pts',
    'de': 'Pkt',
    'ru': 'очк',
    'ar': 'نقاط',
    'pt': 'pts'
  }
  return labels[currentLanguage.value] || labels['en']
})

// 图片加载状态
const isLoading = ref(true)
const imageLoaded = ref(false)
const originalImage = new Image()
originalImage.crossOrigin = 'anonymous'

// 画布尺寸
const canvasWidth = ref(600)
const canvasHeight = ref(400)

// 重绘模式提示词前缀（统一英文）
const repaintPromptPrefix = 'fill the content within the white mask area without leaving any white borders. '

// 擦除模式提示词（根据是否有用户输入）
function getErasePrompt(userInput) {
  if (userInput && userInput.trim()) {
    // 有用户输入：指定要擦除的对象
    return `Remove the "${userInput.trim()}" inside the masked area and fill it with the same texture and color as the surrounding background`
  } else {
    // 无用户输入：移除白色区域
    return 'Remove the white area'
  }
}

// 节点标签（根据语言）
const getNodeLabel = computed(() => {
  const labels = {
    'zh-CN': '重绘结果',
    'zh-TW': '重繪結果',
    'en': 'Repaint Result',
    'ja': '再描画結果',
    'ko': '다시 그리기 결과',
    'es': 'Resultado de retoque',
    'fr': 'Résultat de retouche',
    'de': 'Inpainting-Ergebnis',
    'ru': 'Результат ретуши',
    'ar': 'نتيجة إعادة الرسم',
    'pt': 'Resultado do retoque'
  }
  return labels[currentLanguage.value] || labels['en']
})

// 重绘模式提示词提示
const repaintPlaceholder = computed(() => {
  return editTool.value === 'erase' 
    ? '描述要移除的内容...' 
    : '描述你想改变什么...'
})

// 底部提示
const bottomHint = computed(() => {
  return editTool.value === 'erase' 
    ? '绘制蒙版以擦除' 
    : '绘制蒙版以重绘'
})

// 获取节点在屏幕上的位置
function getNodeScreenPosition() {
  if (!editingNodeId.value) return null
  
  // 查找节点的 DOM 元素
  const nodeElement = document.querySelector(`[data-id="${editingNodeId.value}"]`)
  if (!nodeElement) {
    // 尝试其他选择器
    const altElement = document.querySelector(`.vue-flow__node[data-id="${editingNodeId.value}"]`)
    if (altElement) {
      return altElement.getBoundingClientRect()
    }
    return null
  }
  
  // 获取节点内的图片元素
  const imgElement = nodeElement.querySelector('.node-preview-image, .output-image img, .source-preview img, img')
  if (imgElement) {
    return imgElement.getBoundingClientRect()
  }
  
  return nodeElement.getBoundingClientRect()
}

// 计算目标位置（居中放大）
function calculateTargetRect() {
  const maxWidth = Math.min(window.innerWidth * 0.7, 900)
  const maxHeight = Math.min(window.innerHeight * 0.55, 700)
  
  let w = originalImage.width || 600
  let h = originalImage.height || 400
  
  // 保持宽高比缩放
  const scale = Math.min(maxWidth / w, maxHeight / h)
  w = w * scale
  h = h * scale
  
  // 居中位置
  const x = (window.innerWidth - w) / 2
  const y = (window.innerHeight - h) / 2 - 60 // 稍微上移，给底部控制区留空间
  
  return { x, y, width: w, height: h }
}

// 动画样式
const imageAnimationStyle = computed(() => {
  if (animationPhase.value === 'entering' && sourceRect.value) {
    // 从原位置开始
    return {
      position: 'fixed',
      left: `${sourceRect.value.x}px`,
      top: `${sourceRect.value.y}px`,
      width: `${sourceRect.value.width}px`,
      height: `${sourceRect.value.height}px`,
      transform: 'none',
      transition: 'none',
      zIndex: 10001
    }
  }
  
  if (animationPhase.value === 'active' && targetRect.value) {
    // 过渡到目标位置
    return {
      position: 'fixed',
      left: `${targetRect.value.x}px`,
      top: `${targetRect.value.y}px`,
      width: `${targetRect.value.width}px`,
      height: `${targetRect.value.height}px`,
      transform: 'none',
      transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 10001
    }
  }
  
  if (animationPhase.value === 'leaving' && sourceRect.value) {
    // 返回原位置
    return {
      position: 'fixed',
      left: `${sourceRect.value.x}px`,
      top: `${sourceRect.value.y}px`,
      width: `${sourceRect.value.width}px`,
      height: `${sourceRect.value.height}px`,
      transform: 'none',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 10001
    }
  }
  
  return {}
})

// 初始化（带动画）
async function init() {
  if (!currentImageUrl.value) return
  
  isLoading.value = true
  imageLoaded.value = false
  isAnimating.value = true
  
  try {
    // 获取原节点位置
    sourceRect.value = getNodeScreenPosition()
    
    // 加载图片
    await loadImage(currentImageUrl.value)
    
    // 计算目标位置
    targetRect.value = calculateTargetRect()
    canvasWidth.value = Math.round(targetRect.value.width)
    canvasHeight.value = Math.round(targetRect.value.height)
    
    // 开始进入动画
    animationPhase.value = 'entering'
    await nextTick()
    
    // 延迟触发过渡动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        animationPhase.value = 'active'
      })
    })
    
    // 等待动画完成后初始化画布
    setTimeout(async () => {
      isAnimating.value = false
      await nextTick()
      setupCanvas()
      drawImage()
      saveToHistory()
      isLoading.value = false
      imageLoaded.value = true
    }, 550)
    
  } catch (error) {
    console.error('[InplaceImageEditor] 初始化失败:', error)
    isLoading.value = false
    isAnimating.value = false
    animationPhase.value = 'active'
  }
}

// 加载图片
function loadImage(url) {
  return new Promise((resolve, reject) => {
    originalImage.onload = () => resolve()
    originalImage.onerror = reject
    originalImage.src = url
  })
}

// 设置画布
function setupCanvas() {
  if (canvasRef.value) {
    ctx.value = canvasRef.value.getContext('2d')
  }
  if (maskCanvasRef.value) {
    maskCtx.value = maskCanvasRef.value.getContext('2d')
    // 清空蒙版画布
    maskCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  }
}

// 绘制原始图片
function drawImage() {
  if (!ctx.value) return
  ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  ctx.value.drawImage(originalImage, 0, 0, canvasWidth.value, canvasHeight.value)
}

// 保存到历史记录
function saveToHistory() {
  if (!maskCanvasRef.value) return
  
  // 删除当前位置之后的历史
  history.value = history.value.slice(0, historyIndex.value + 1)
  
  // 保存当前蒙版状态
  const imageData = maskCanvasRef.value.toDataURL('image/png')
  history.value.push(imageData)
  
  // 限制历史记录数量
  if (history.value.length > maxHistory) {
    history.value.shift()
  } else {
    historyIndex.value++
  }
}

// 撤销
function undo() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    restoreFromHistory()
  }
}

// 重做
function redo() {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    restoreFromHistory()
  }
}

// 从历史记录恢复
function restoreFromHistory() {
  const dataUrl = history.value[historyIndex.value]
  if (!dataUrl || !maskCtx.value) return
  
  const img = new Image()
  img.onload = () => {
    maskCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
    maskCtx.value.drawImage(img, 0, 0)
  }
  img.src = dataUrl
}

// 开始绘制
function startDraw(e) {
  isDrawing.value = true
  const rect = maskCanvasRef.value.getBoundingClientRect()
  lastX.value = e.clientX - rect.left
  lastY.value = e.clientY - rect.top
}

// 绘制
function draw(e) {
  if (!isDrawing.value || !maskCtx.value) return
  
  const rect = maskCanvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  if (currentDrawTool.value === 'brush') {
    // 画笔模式 - 半透明白色蒙版（黑白灰风格）
    maskCtx.value.beginPath()
    maskCtx.value.moveTo(lastX.value, lastY.value)
    maskCtx.value.lineTo(x, y)
    maskCtx.value.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    maskCtx.value.lineWidth = brushSize.value
    maskCtx.value.lineCap = 'round'
    maskCtx.value.lineJoin = 'round'
    maskCtx.value.stroke()
  } else if (currentDrawTool.value === 'eraser') {
    // 橡皮擦模式
    maskCtx.value.globalCompositeOperation = 'destination-out'
    maskCtx.value.beginPath()
    maskCtx.value.moveTo(lastX.value, lastY.value)
    maskCtx.value.lineTo(x, y)
    maskCtx.value.strokeStyle = 'rgba(255, 255, 255, 1)'
    maskCtx.value.lineWidth = brushSize.value
    maskCtx.value.lineCap = 'round'
    maskCtx.value.lineJoin = 'round'
    maskCtx.value.stroke()
    maskCtx.value.globalCompositeOperation = 'source-over'
  }
  
  lastX.value = x
  lastY.value = y
}

// 结束绘制
function endDraw() {
  if (isDrawing.value) {
    isDrawing.value = false
    saveToHistory()
  }
}

// 清除蒙版
function clearMask() {
  if (maskCtx.value) {
    maskCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
    saveToHistory()
  }
}

// 切换工具
function selectTool(tool) {
  currentDrawTool.value = tool
}

// 合成带蒙版的图片
function getMergedImageDataUrl() {
  // 创建临时画布合成图片和蒙版
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = canvasWidth.value
  tempCanvas.height = canvasHeight.value
  const tempCtx = tempCanvas.getContext('2d')
  
  // 先绘制原图
  tempCtx.drawImage(canvasRef.value, 0, 0)
  
  // 再绘制蒙版（白色区域会叠加显示）
  tempCtx.drawImage(maskCanvasRef.value, 0, 0)
  
  return tempCanvas.toDataURL('image/png')
}

// 将 DataURL 转换为 File
function dataUrlToFile(dataUrl, filename) {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

// 创建输出节点
function createOutputNodes(count, sourceNodeId) {
  const sourceNode = canvasStore.nodes.find(n => n.id === sourceNodeId)
  if (!sourceNode) return []
  
  const createdNodeIds = []
  const nodeWidth = 380
  const nodeGap = 50
  
  for (let i = 0; i < count; i++) {
    const newNode = canvasStore.addNode({
      type: 'image',
      position: {
        x: sourceNode.position.x + nodeWidth + nodeGap + (i * (nodeWidth + nodeGap)),
        y: sourceNode.position.y
      },
      data: {
        label: `${getNodeLabel.value} ${i + 1}`,
        status: 'processing',
        nodeRole: 'output'
      }
    }, true) // skipHistory = true
    
    // 创建连接边
    canvasStore.addEdge({
      source: sourceNodeId,
      target: newNode.id,
      sourceHandle: 'output',
      targetHandle: 'input'
    })
    
    createdNodeIds.push(newNode.id)
  }
  
  return createdNodeIds
}

// 生成
async function handleGenerate() {
  if (isGenerating.value) return
  if (!editingNodeId.value) return
  
  // 检查积分是否足够
  if (!hasEnoughPoints.value) {
    const insufficientMsg = {
      'zh-CN': `积分不足，需要 ${requiredPoints.value} 积分，当前只有 ${userPoints.value} 积分`,
      'zh-TW': `積分不足，需要 ${requiredPoints.value} 積分，當前只有 ${userPoints.value} 積分`,
      'en': `Insufficient points. Need ${requiredPoints.value} pts, you have ${userPoints.value} pts`,
      'ja': `ポイント不足。${requiredPoints.value}ポイント必要、現在${userPoints.value}ポイント`,
      'ko': `포인트 부족. ${requiredPoints.value}포인트 필요, 현재 ${userPoints.value}포인트`
    }
    alert(insufficientMsg[currentLanguage.value] || insufficientMsg['en'])
    return
  }
  
  isGenerating.value = true
  
  try {
    // 1. 合成带蒙版的图片
    const mergedImageDataUrl = getMergedImageDataUrl()
    const mergedFile = dataUrlToFile(mergedImageDataUrl, `repaint_${Date.now()}.png`)
    
    console.log('[InplaceImageEditor] 上传合成图片...')
    
    // 2. 上传合成后的图片
    const uploadResult = await uploadImages([mergedFile])
    if (!uploadResult || uploadResult.length === 0) {
      throw new Error('图片上传失败')
    }
    const uploadedImageUrl = uploadResult[0]
    
    console.log('[InplaceImageEditor] 图片已上传:', uploadedImageUrl)
    
    // 3. 构建提示词（根据工具类型使用不同模板）
    let finalPrompt = ''
    if (editTool.value === 'erase') {
      // 擦除模式：根据是否有用户输入使用不同提示词
      finalPrompt = getErasePrompt(prompt.value)
    } else {
      // 重绘模式：前缀 + 用户输入
      finalPrompt = repaintPromptPrefix + (prompt.value || '')
    }
    
    console.log('[InplaceImageEditor] 开始生成', {
      tool: editTool.value,
      prompt: finalPrompt,
      size: selectedSize.value,
      count: selectedCount.value
    })
    
    // 4. 保存源节点ID（关闭编辑器前）
    const sourceNodeId = editingNodeId.value
    
    // 5. 创建输出节点（根据张数创建对应数量的节点）
    const outputNodeIds = createOutputNodes(selectedCount.value, sourceNodeId)
    
    // 6. 关闭编辑器
    await handleCloseWithoutAnimation()
    
    // 7. 调用 nano-banana-2 API 生成图片
    const generateResult = await generateImageFromImage({
      prompt: finalPrompt,
      images: [uploadedImageUrl],
      model: 'nano-banana-2',
      image_size: selectedSize.value,
      aspectRatio: 'auto'
    })
    
    console.log('[InplaceImageEditor] 生成任务已创建:', generateResult)
    
    // 8. 轮询任务状态
    if (generateResult.task_id) {
      // 启动后台轮询
      pollAndUpdateNodes(generateResult.task_id, outputNodeIds)
    } else if (generateResult.url || generateResult.urls) {
      // 直接返回结果（同步模式）
      const urls = generateResult.urls || [generateResult.url]
      updateNodesWithResults(outputNodeIds, urls)
    }
    
  } catch (error) {
    console.error('[InplaceImageEditor] 生成失败:', error)
    alert('生成失败: ' + error.message)
  } finally {
    isGenerating.value = false
  }
}

// 轮询任务状态并更新节点
async function pollAndUpdateNodes(taskId, nodeIds) {
  try {
    const result = await pollTaskStatus(taskId, 'image', {
      interval: 2000,
      timeout: 12 * 60 * 1000, // 12 分钟，与后端超时一致
      onProgress: (status) => {
        console.log('[InplaceImageEditor] 任务进度:', status)
      }
    })
    
    console.log('[InplaceImageEditor] 任务完成:', result)
    
    // 获取结果URL
    const urls = result.urls || (result.url ? [result.url] : [])
    updateNodesWithResults(nodeIds, urls)
    
  } catch (error) {
    console.error('[InplaceImageEditor] 轮询失败:', error)
    // 更新节点为失败状态
    nodeIds.forEach(nodeId => {
      canvasStore.updateNodeData(nodeId, {
        status: 'error',
        error: error.message
      })
    })
  }
}

// 用结果更新节点
function updateNodesWithResults(nodeIds, urls) {
  nodeIds.forEach((nodeId, index) => {
    if (urls[index]) {
      canvasStore.updateNodeData(nodeId, {
        status: 'success',
        output: {
          urls: [urls[index]],
          url: urls[index]
        }
      })
    } else {
      // 没有对应的URL，可能是生成数量不足
      canvasStore.updateNodeData(nodeId, {
        status: 'error',
        error: '未生成对应图片'
      })
    }
  })
}

// 关闭编辑器（带动画）
async function handleClose() {
  // 开始离开动画
  animationPhase.value = 'leaving'
  isAnimating.value = true
  
  // 等待动画完成
  await new Promise(resolve => setTimeout(resolve, 400))
  
  // 清理状态
  resetState()
  canvasStore.exitEditMode()
}

// 关闭编辑器（无动画，用于生成后关闭）
async function handleCloseWithoutAnimation() {
  // 清理状态
  resetState()
  canvasStore.exitEditMode()
}

// 重置状态
function resetState() {
  history.value = []
  historyIndex.value = -1
  prompt.value = ''
  currentDrawTool.value = 'brush'
  animationPhase.value = 'idle'
  isAnimating.value = false
  sourceRect.value = null
  targetRect.value = null
  selectedSize.value = '1K'
  selectedCount.value = 1
}

// 快捷键
function handleKeyDown(e) {
  if (!isVisible.value) return
  
  if (e.key === 'Escape') {
    handleClose()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    // Ctrl+Z 撤销
    e.preventDefault()
    undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    // Ctrl+Y 重做
    e.preventDefault()
    redo()
  }
}

// 监听可见性变化
watch(isVisible, (visible) => {
  if (visible) {
    nextTick(() => {
      init()
    })
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mouseup', endDraw)
  // 加载积分配置
  loadPointsConfig()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('mouseup', endDraw)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="editor-fade">
      <div v-if="isVisible" class="inplace-editor-overlay">
        
        <!-- 动画中的图片（用于过渡效果） -->
        <div 
          v-if="isAnimating && currentImageUrl"
          class="animating-image"
          :style="imageAnimationStyle"
        >
          <img :src="currentImageUrl" alt="" />
        </div>
        
        <!-- 主编辑容器 -->
        <div 
          v-show="!isAnimating || animationPhase === 'active'"
          class="inplace-editor-container" 
          ref="containerRef"
        >
          
          <!-- 顶部工具栏 -->
          <div class="editor-toolbar">
            <!-- 关闭按钮 -->
            <button class="close-btn" @click="handleClose" title="关闭 (ESC)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            
            <!-- 工具按钮 -->
            <div class="tool-group">
              <button 
                class="tool-btn" 
                :class="{ active: currentDrawTool === 'brush' }"
                @click="selectTool('brush')"
                title="画笔"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  <path d="M2 2l7.586 7.586"/>
                </svg>
              </button>
              
              <button 
                class="tool-btn" 
                :class="{ active: currentDrawTool === 'rect' }"
                @click="selectTool('rect')"
                title="矩形选框"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
              </button>
              
              <button 
                class="tool-btn" 
                :class="{ active: currentDrawTool === 'eraser' }"
                @click="selectTool('eraser')"
                title="橡皮擦"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l6.9 6.9c.6.6.6 1.5 0 2.1L13.4 21.5"/>
                </svg>
              </button>
            </div>
            
            <!-- 笔刷大小 -->
            <div class="brush-size-control">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-icon">
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <input 
                type="range" 
                v-model.number="brushSize" 
                min="5" 
                max="80"
                class="brush-slider"
              />
            </div>
            
            <!-- 撤销/重做 -->
            <div class="tool-group">
              <button 
                class="tool-btn" 
                @click="undo" 
                :disabled="historyIndex <= 0"
                title="撤销 (Ctrl+Z)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 10h10a5 5 0 0 1 5 5v2"/>
                  <path d="M7 6L3 10l4 4"/>
                </svg>
              </button>
              
              <button 
                class="tool-btn" 
                @click="redo" 
                :disabled="historyIndex >= history.length - 1"
                title="重做 (Ctrl+Y)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10H11a5 5 0 0 0-5 5v2"/>
                  <path d="M17 6l4 4-4 4"/>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- 图片编辑区域 -->
          <div class="editor-canvas-area">
            <div v-if="isLoading && !isAnimating" class="loading-state">
              <div class="spinner"></div>
              <span>加载中...</span>
            </div>
            
            <div 
              v-show="!isLoading || isAnimating"
              class="canvas-wrapper" 
              :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
            >
              <!-- 原图画布 -->
              <canvas 
                ref="canvasRef"
                :width="canvasWidth"
                :height="canvasHeight"
                class="image-canvas"
              ></canvas>
              
              <!-- 蒙版画布 -->
              <canvas 
                ref="maskCanvasRef"
                :width="canvasWidth"
                :height="canvasHeight"
                class="mask-canvas"
                @mousedown="startDraw"
                @mousemove="draw"
                @mouseup="endDraw"
                @mouseleave="endDraw"
              ></canvas>
            </div>
          </div>
          
          <!-- 底部控制区 -->
          <div class="editor-bottom">
            <!-- 提示词输入 -->
            <div class="prompt-input-area">
              <div class="prompt-input-wrapper">
                <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9 12h6M12 9v6"/>
                </svg>
                <textarea 
                  v-model="prompt"
                  :placeholder="repaintPlaceholder"
                  class="prompt-textarea"
                  rows="2"
                  @keydown.enter.ctrl="handleGenerate"
                ></textarea>
              </div>
            </div>
            
            <!-- 操作栏 -->
            <div class="action-bar">
              <div class="action-left">
                <button class="clear-btn" @click="clearMask" title="清除蒙版">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  <span>清除蒙版</span>
                </button>
                <span class="hint-text">{{ bottomHint }}</span>
              </div>
              
              <div class="action-right">
                <!-- 尺寸切换（点击循环） -->
                <button class="toggle-chip" @click="toggleSize" title="点击切换尺寸">
                  <span class="chip-label">{{ selectedSize }}</span>
                </button>
                
                <!-- 张数切换（点击循环） -->
                <button class="toggle-chip" @click="toggleCount" title="点击切换张数">
                  <span class="chip-label">x{{ selectedCount }}</span>
                </button>
                
                <!-- 积分显示 -->
                <div class="points-display" :class="{ insufficient: !hasEnoughPoints }">
                  <span class="points-value">{{ requiredPoints }}</span>
                  <span class="points-label">{{ pointsLabel }}</span>
                </div>
                
                <!-- 生成按钮 -->
                <button 
                  class="generate-btn"
                  :disabled="isGenerating || !hasEnoughPoints"
                  @click="handleGenerate"
                  :title="!hasEnoughPoints ? '积分不足' : ''"
                >
                  <template v-if="isGenerating">
                    <span class="spinner-small"></span>
                    <span>生成中...</span>
                  </template>
                  <template v-else>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="gen-icon">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                    <span>生成</span>
                  </template>
                </button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 无遮罩背景 - 画布仍然可见 */
.inplace-editor-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/* 动画中的图片 */
.animating-image {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.animating-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.inplace-editor-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 95vw;
  max-height: 95vh;
  pointer-events: auto;
}

/* 顶部工具栏 - 黑白灰风格 */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(28, 28, 32, 0.98);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
}

.close-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 9px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn svg {
  width: 16px;
  height: 16px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.tool-group {
  display: flex;
  gap: 4px;
  padding: 0 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.tool-group:first-of-type {
  border-left: none;
}

.tool-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn svg {
  width: 18px;
  height: 18px;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.tool-btn.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.tool-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 笔刷大小控制 */
.brush-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.size-icon {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.brush-slider {
  width: 70px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  outline: none;
}

.brush-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.brush-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* 图片编辑区域 */
.editor-canvas-area {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.6);
  padding: 60px;
  background: rgba(28, 28, 32, 0.95);
  border-radius: 16px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.canvas-wrapper {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  background: #000;
}

.image-canvas {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 14px;
}

.mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  border-radius: 14px;
}

/* 底部控制区 */
.editor-bottom {
  width: 100%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-input-area {
  width: 100%;
}

.prompt-input-wrapper {
  position: relative;
  display: flex;
  align-items: flex-start;
}

.prompt-icon {
  position: absolute;
  left: 14px;
  top: 14px;
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.3);
}

.prompt-textarea {
  width: 100%;
  padding: 12px 16px 12px 44px;
  background: rgba(28, 28, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  color: #fff;
  font-size: 14px;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.prompt-textarea::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.prompt-textarea:focus {
  border-color: rgba(255, 255, 255, 0.2);
}

/* 操作栏 */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(28, 28, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn svg {
  width: 14px;
  height: 14px;
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.hint-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.action-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 切换按钮（点击循环切换） */
.toggle-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 8px 14px;
  background: rgba(28, 28, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.toggle-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.toggle-chip:active {
  transform: scale(0.96);
}

.chip-label {
  letter-spacing: 0.5px;
}

/* 积分显示 */
.points-display {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: rgba(28, 28, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
}

.points-display.insufficient {
  border-color: rgba(239, 68, 68, 0.5);
  color: rgba(239, 68, 68, 0.9);
}

.points-value {
  font-weight: 700;
  font-size: 14px;
}

.points-label {
  opacity: 0.7;
  font-size: 12px;
}

/* 生成按钮 - 黑白灰风格 */
.generate-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: #fff;
  border: none;
  border-radius: 12px;
  color: #000;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(255, 255, 255, 0.2);
}

.generate-btn:active:not(:disabled) {
  transform: translateY(0);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gen-icon {
  width: 16px;
  height: 16px;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: #000;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 进入/离开动画 */
.editor-fade-enter-active {
  transition: opacity 0.1s ease;
}

.editor-fade-leave-active {
  transition: opacity 0.3s ease;
}

.editor-fade-enter-from,
.editor-fade-leave-to {
  opacity: 0;
}

/* 工具栏和底部控制区的淡入动画 */
.editor-fade-enter-active .editor-toolbar,
.editor-fade-enter-active .editor-bottom {
  animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
