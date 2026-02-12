<script setup>
/**
 * VideoGenNode.vue - 视频生成节点
 * 用于文生视频和图生视频
 */
import { ref, computed, inject, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { generateVideoFromText, generateVideoFromImage, pollTaskStatus } from '@/api/canvas/nodes'
import { getAvailableVideoModels, getTenantHeaders } from '@/config/tenant'
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

// 模型下拉框状态
const isModelDropdownOpen = ref(false)

// 生成参数 - 默认使用新版 sora2 整合模型
const selectedModel = ref(props.data.model || 'sora2')
const selectedDuration = ref(props.data.duration || '10')
const selectedAspectRatio = ref(props.data.aspectRatio || '16:9')
const offPeak = ref(props.data.offPeak || false) // Vidu 错峰模式

// 可用模型列表 - 从配置动态获取，过滤掉旧版模型
const models = computed(() => {
  const allModels = getAvailableVideoModels()
  // 过滤掉旧版 sora-2 和 sora-2-pro，只保留新版 sora2 系列和其他模型
  return allModels.filter(m => !['sora-2', 'sora-2-pro'].includes(m.value))
})

// 当前选中的模型配置
const currentModelConfig = computed(() => {
  return models.value.find(m => m.value === selectedModel.value) || {}
})

// 当前模型是否为 Vidu 系列（支持错峰模式）
// 注意：腾讯 AIGC 的 Vidu 不支持错峰，需要排除
const isViduModel = computed(() => {
  const modelConfig = currentModelConfig.value
  // 腾讯 AIGC 模型不支持原生 Vidu 的错峰等功能
  if (modelConfig?.apiType === 'tencentaigc') return false
  return modelConfig?.apiType === 'vidu' || selectedModel.value.toLowerCase().includes('vidu')
})

// 当前模型是否为腾讯 AIGC 模型（Kling/Hailuo/Vidu 通过腾讯云点播）
const isTencentAigcModel = computed(() => {
  return currentModelConfig.value?.apiType === 'tencentaigc'
})

// 当前模型是否为 Kling Omni-Video O1（全能视频模型，包括文/图生视频和视频编辑）
const isKlingOmniModel = computed(() => {
  return currentModelConfig.value?.isKlingOmni || currentModelConfig.value?.apiType === 'kling-omni' || currentModelConfig.value?.apiType === 'kling-omni-edit'
})

// 当前模型是否为 Kling O1 视频编辑模型
const isKlingOmniEditModel = computed(() => {
  return currentModelConfig.value?.isKlingOmniEdit || currentModelConfig.value?.apiType === 'kling-omni-edit'
})

// O1 视频参考模式：feature=特征参考, base=视频编辑
const omniVideoReferType = ref(props.data.omniVideoReferType || 'feature')
// O1 是否保留视频原声
const omniKeepSound = ref(props.data.omniKeepSound || 'yes')

// 节点尺寸 - 视频生成节点使用16:9比例
const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 240)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'video-gen-node': true,
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

// 是否有输出
const hasOutput = computed(() => !!props.data.output?.url)

// 处理视频 URL，确保使用相对路径（避免跨域问题）
const normalizedVideoUrl = computed(() => {
  const url = props.data.output?.url
  if (!url) return ''
  
  // 如果已经是相对路径，直接返回
  if (url.startsWith('/api/')) return url
  
  // 处理完整 URL，提取 /api/cos-proxy/... 部分
  if (url.includes('/api/cos-proxy/')) {
    const cosProxyIndex = url.indexOf('/api/cos-proxy/')
    return url.substring(cosProxyIndex)
  }
  
  // 处理完整 URL，提取 /api/images/file/... 部分
  const match = url.match(/\/api\/images\/file\/[a-zA-Z0-9-]+/)
  if (match) {
    return match[0]
  }
  
  // 其他情况保持原样（如七牛云 CDN URL）
  return url
})

// 检查是否有上游连接
const hasUpstreamEdge = computed(() => {
  return canvasStore.edges.some(edge => edge.target === props.id)
})

// 继承的数据（仅在有上游连接时使用）
const inheritedText = computed(() => {
  if (!hasUpstreamEdge.value) return ''
  return props.data.inheritedData?.content || ''
})
const inheritedImages = computed(() => {
  if (!hasUpstreamEdge.value) return []
  return props.data.inheritedData?.urls || []
})

// 标准化视频 URL（转换为相对路径避免跨域）
function normalizeUrl(url) {
  if (!url) return ''
  if (url.startsWith('/api/')) return url
  if (url.includes('/api/cos-proxy/')) {
    return url.substring(url.indexOf('/api/cos-proxy/'))
  }
  const match = url.match(/\/api\/images\/file\/[a-zA-Z0-9-]+/)
  if (match) return match[0]
  return url
}

// 继承的视频（来自上游视频节点）
const inheritedVideos = computed(() => {
  if (!hasUpstreamEdge.value) return []
  const inherited = props.data.inheritedData
  // 如果继承数据类型是视频，返回视频URL（标准化处理）
  if (inherited?.type === 'video' && inherited?.url) {
    return [normalizeUrl(inherited.url)]
  }
  return []
})

// 是否有上游图片或视频（用于判断生成模式）
const isImageToVideo = computed(() => inheritedImages.value.length > 0)
const isVideoToVideo = computed(() => inheritedVideos.value.length > 0)

// 是否有任何参考素材（图片或视频）
const hasReferenceMedia = computed(() => inheritedImages.value.length > 0 || inheritedVideos.value.length > 0)

// 积分消耗计算 - 从模型配置中读取
const pointsCost = computed(() => {
  const currentModel = models.value.find(m => m.value === selectedModel.value)
  
  let cost = 20
  
  // 按时长计费的模型（Sora 2、Sora 2 Pro）
  if (currentModel?.hasDurationPricing) {
    const durationCost = currentModel.pointsCost?.[selectedDuration.value]
    if (durationCost) cost = durationCost
  } else {
    // 其他模型使用固定积分（VEO 3.1 系列）
    const baseCost = currentModel?.pointsCost
    cost = typeof baseCost === 'number' ? baseCost : 20
  }
  
  // Vidu 错峰模式折扣
  if (isViduModel.value && offPeak.value) {
    const discount = currentModel?.offPeakDiscount || 0.7
    cost = Math.ceil(cost * discount)
  }
  
  return cost
})


// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 可用时长选项 - 从模型配置中读取
const availableDurations = computed(() => {
  const durations = currentModelConfig.value?.durations
  if (durations && durations.length > 0) {
    return durations
  }
  // 兜底默认值
  if (selectedModel.value === 'sora2-pro' || selectedModel.value === 'sora-2-pro') {
    return ['10', '15', '25']
  }
  return ['10', '15']
})

// 可用方向选项 - 从模型配置中读取
const availableAspectRatios = computed(() => {
  const aspectRatios = currentModelConfig.value?.aspectRatios
  if (aspectRatios && aspectRatios.length > 0) {
    return aspectRatios
  }
  // 如果配置明确为空数组，表示该模型不支持画面比例选择
  if (Array.isArray(aspectRatios) && aspectRatios.length === 0) {
    return []
  }
  // 兜底默认值
  return [
    { value: '16:9', label: '横屏' },
    { value: '9:16', label: '竖屏' }
  ]
})

// 是否显示画面比例选择器
const showAspectRatioSelector = computed(() => {
  return availableAspectRatios.value.length > 0
})

// 监听视频加载，自适应尺寸
function handleVideoLoad(event) {
  const video = event.target
  const aspectRatio = video.videoWidth / video.videoHeight
  
  // 如果是默认尺寸，则根据视频比例调整
  if (nodeWidth.value <= 450 && Math.abs(nodeWidth.value / nodeHeight.value - 16/9) < 0.2) {
    if (aspectRatio > 1) {
      nodeHeight.value = nodeWidth.value / aspectRatio
    } else if (aspectRatio < 1) {
      nodeWidth.value = nodeHeight.value * aspectRatio
    }
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

// 模型下拉框方法
function toggleModelDropdown(event) {
  event.stopPropagation()
  isModelDropdownOpen.value = !isModelDropdownOpen.value
}

function selectModel(modelValue) {
  selectedModel.value = modelValue
  isModelDropdownOpen.value = false
  
  // 获取新模型的配置
  const newModelConfig = models.value.find(m => m.value === modelValue)
  
  // 更新时长选项 - 使用模型配置的 durations 数组
  const durations = newModelConfig?.durations || ['10', '15']
  if (durations.length > 0 && !durations.includes(selectedDuration.value)) {
    selectedDuration.value = durations[0]
  }
  
  // 更新方向选项 - 使用模型配置的 aspectRatios 数组
  const aspectRatios = newModelConfig?.aspectRatios || [{ value: '16:9', label: '横屏' }]
  const aspectValues = aspectRatios.map(ar => ar.value)
  if (aspectValues.length > 0 && !aspectValues.includes(selectedAspectRatio.value)) {
    selectedAspectRatio.value = aspectValues[0]
  }
  
  // Kling O1 视频编辑模型默认使用 base（视频编辑）模式
  if (newModelConfig?.isKlingOmniEdit) {
    omniVideoReferType.value = 'base'
  } else if (newModelConfig?.isKlingOmni) {
    omniVideoReferType.value = 'feature'
  }
}

function handleModelDropdownClickOutside(event) {
  // 检查点击是否在下拉框外
  const dropdown = event.target.closest('.model-selector-custom')
  if (!dropdown) {
    isModelDropdownOpen.value = false
  }
}

// 组件挂载时添加全局点击事件监听
onMounted(() => {
  document.addEventListener('click', handleModelDropdownClickOutside)
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleModelDropdownClickOutside)
})

// 开始生成
async function handleGenerate() {
  if (userPoints.value < pointsCost.value) {
    alert(t('imageGen.insufficientPoints'))
    return
  }
  
  canvasStore.updateNodeData(props.id, { 
    status: 'processing',
    model: selectedModel.value,
    duration: selectedDuration.value,
    aspectRatio: selectedAspectRatio.value,
    offPeak: isViduModel.value ? offPeak.value : false,
    omniVideoReferType: isKlingOmniModel.value ? omniVideoReferType.value : undefined,
    omniKeepSound: isKlingOmniModel.value ? omniKeepSound.value : undefined
  })
  
  try {
    let result
    
    if (isImageToVideo.value) {
      // 图生视频
      const genParams = {
        prompt: inheritedText.value || props.data.text || '',
        imageUrl: inheritedImages.value[0],
        model: selectedModel.value,
        duration: selectedDuration.value,
        aspectRatio: selectedAspectRatio.value,
        offPeak: isViduModel.value && offPeak.value
      }
      // O1 特有参数：视频参考
      if (isKlingOmniModel.value && inheritedVideos.value.length > 0) {
        genParams.klingOmniVideoUrl = inheritedVideos.value[0]
        genParams.klingOmniVideoReferType = omniVideoReferType.value
        genParams.klingOmniKeepSound = omniKeepSound.value
      }
      result = await generateVideoFromImage(genParams)
    } else if (isKlingOmniModel.value && isVideoToVideo.value) {
      // O1 视频参考/编辑模式（无参考图片，有参考视频）
      result = await generateVideoFromText({
        prompt: inheritedText.value || props.data.text || '',
        model: selectedModel.value,
        duration: selectedDuration.value,
        aspectRatio: selectedAspectRatio.value,
        klingOmniVideoUrl: inheritedVideos.value[0],
        klingOmniVideoReferType: omniVideoReferType.value,
        klingOmniKeepSound: omniKeepSound.value
      })
    } else {
      // 文生视频
      result = await generateVideoFromText({
        prompt: inheritedText.value || props.data.text || '',
        model: selectedModel.value,
        duration: selectedDuration.value,
        aspectRatio: selectedAspectRatio.value,
        offPeak: isViduModel.value && offPeak.value
      })
    }
    
    // 轮询任务状态（视频生成需要较长时间，超时设为45分钟，与后端一致）
    if (result.task_id) {
      const finalResult = await pollTaskStatus(result.task_id, 'video', {
        timeout: 45 * 60 * 1000, // 45分钟，与后端超时一致
        onProgress: (status) => {
          console.log('[VideoGen] 任务进度:', status)
        }
      })
      
      let videoUrl = finalResult.video_url || finalResult.url
      
      // 如果不是七牛云 URL，延迟几秒再查询一次获取可能已上传的七牛云 URL
      if (videoUrl && !isQiniuCdnUrl(videoUrl)) {
        console.log('[VideoGen] 首次返回非七牛云URL，延迟3秒后再次查询...')
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        try {
          const { getVideoTaskStatus } = await import('@/api/canvas/nodes')
          const updatedResult = await getVideoTaskStatus(result.task_id)
          if (updatedResult.video_url && isQiniuCdnUrl(updatedResult.video_url)) {
            videoUrl = updatedResult.video_url
            console.log('[VideoGen] 获取到七牛云URL:', videoUrl.substring(0, 60))
          }
        } catch (e) {
          console.warn('[VideoGen] 再次查询失败，使用原URL:', e.message)
        }
      }
      
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        taskId: result.task_id,
        output: {
          type: 'video',
          url: videoUrl
        }
      })
    } else if (result.video_url || result.url) {
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'video',
          url: result.video_url || result.url
        }
      })
    }
    
    // 刷新用户积分
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
  } catch (error) {
    console.error('[VideoGen] 生成失败:', error)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
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

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function downloadVideo() {
  if (!props.data.output?.url) return
  
  const videoUrl = props.data.output.url
  const filename = `video_${props.id || Date.now()}.mp4`
  
  console.log('[VideoGenNode] 开始下载:', { url: videoUrl.substring(0, 60), filename })
  
  try {
    const { smartDownload } = await import('@/api/client')
    await smartDownload(videoUrl, filename)
    console.log('[VideoGenNode] 下载成功:', filename)
  } catch (error) {
    console.error('[VideoGenNode] 下载失败:', error)
  }
}

// 打开右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  const nodeType = isImageToVideo.value ? 'image-to-video' : 'text-to-video'
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: nodeType, position: { x: 0, y: 0 }, data: props.data }
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
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 节点头部 -->
    <div class="canvas-node-header">
      <div class="canvas-node-title">
        <span class="icon">{{ isImageToVideo ? '▢' : '▶' }}</span>
        {{ data.title || (isImageToVideo ? '图生视频' : '文生视频') }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="下载" @click="downloadVideo" v-if="hasOutput">↓</button>
        <button class="canvas-node-action-btn" title="更多">≡</button>
      </div>
    </div>
    
    <!-- 节点内容 -->
    <div class="canvas-node-content" :style="contentStyle">
      <!-- 预览区域 -->
      <div class="canvas-node-preview video-preview">
        <!-- 加载中 -->
        <div v-if="data.status === 'processing'" class="preview-loading">
          <div class="canvas-loading-spinner"></div>
          <span>视频生成中...</span>
          <span class="loading-hint">预计 1-3 分钟</span>
        </div>
        
        <!-- 错误状态 -->
        <div v-else-if="data.status === 'error'" class="preview-error">
          <span class="error-icon">❌</span>
          <span class="error-text">{{ data.error || '生成失败' }}</span>
          <button class="retry-btn" @click="handleRegenerate">重试</button>
        </div>
        
        <!-- 生成结果 -->
        <video 
          v-else-if="hasOutput" 
          :src="normalizedVideoUrl" 
          controls
          class="video-player"
          @loadedmetadata="handleVideoLoad"
        ></video>
        
        <!-- 等待输入 -->
        <div v-else class="canvas-node-preview-empty">
          <div v-if="inheritedText || hasReferenceMedia">
            <div class="inherited-label">
              {{ isVideoToVideo ? (isKlingOmniModel ? (omniVideoReferType === 'base' ? '视频编辑模式' : '视频参考已就绪') : '参考视频已就绪') : (isImageToVideo ? '参考图片已就绪' : '提示词已就绪') }}
            </div>
            <div v-if="inheritedText" class="inherited-text">
              {{ inheritedText.slice(0, 80) }}{{ inheritedText.length > 80 ? '...' : '' }}
            </div>
          </div>
          <div v-else>等待输入...</div>
        </div>
      </div>
      
      <!-- 参考素材（图片或视频） -->
      <div v-if="hasReferenceMedia" class="reference-images">
        <!-- 参考视频缩略图 -->
        <div v-if="inheritedVideos.length > 0" class="reference-image reference-video">
          <video 
            :src="inheritedVideos[0]" 
            class="reference-video-thumbnail"
            muted
            preload="metadata"
          ></video>
          <div class="video-indicator">▶</div>
        </div>
        <!-- 参考图片缩略图 -->
        <div v-else-if="inheritedImages.length > 0" class="reference-image">
          <img :src="inheritedImages[0]" alt="参考图" />
        </div>
        <span class="reference-label">{{ isVideoToVideo ? '参考视频' : '首帧参考图' }}</span>
      </div>
      
      <!-- 生成控制 -->
      <div class="gen-controls">
        <div class="gen-params">
          <!-- 模型选择器（自定义下拉框，支持显示描述） -->
          <div class="model-selector-custom" @click.stop>
            <div 
              class="model-selector-trigger"
              @click="toggleModelDropdown"
            >
              <span class="model-icon">{{ models.find(m => m.value === selectedModel)?.icon || '▶' }}</span>
              <span class="model-name">{{ models.find(m => m.value === selectedModel)?.label || selectedModel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 下拉选项列表 -->
            <Transition name="dropdown-fade">
              <div v-if="isModelDropdownOpen" class="model-dropdown-list">
                <div 
                  v-for="m in models" 
                  :key="m.value"
                  class="model-dropdown-item"
                  :class="{ 'active': selectedModel === m.value }"
                  @click="selectModel(m.value)"
                >
                  <div class="model-item-main">
                    <span class="model-item-icon">{{ m.icon }}</span>
                    <span class="model-item-label">{{ m.label }}</span>
                  </div>
                  <div v-if="m.description" class="model-item-desc">
                    {{ m.description }}
                  </div>
                </div>
              </div>
            </Transition>
          </div>
          
          <!-- 时长选择（视频编辑 base 模式下禁用，时长跟随输入视频） -->
          <select 
            v-model="selectedDuration" 
            class="param-select"
            :disabled="isKlingOmniEditModel && omniVideoReferType === 'base' && inheritedVideos.length > 0"
            :title="isKlingOmniEditModel && omniVideoReferType === 'base' && inheritedVideos.length > 0 ? '视频编辑模式下时长跟随输入视频' : ''"
          >
            <option v-for="d in availableDurations" :key="d" :value="d">{{ d }}s</option>
          </select>
          
          <!-- 画幅/方向选择 - 从模型配置动态获取（部分模型不支持） -->
          <select v-if="showAspectRatioSelector" v-model="selectedAspectRatio" class="param-select">
            <option 
              v-for="ar in availableAspectRatios" 
              :key="ar.value" 
              :value="ar.value"
            >{{ ar.label }}</option>
          </select>
          
          <!-- Vidu 错峰模式开关 -->
          <label v-if="isViduModel" class="off-peak-toggle" :class="{ 'active': offPeak }">
            <input type="checkbox" v-model="offPeak" />
            <span class="toggle-icon">🌙</span>
            <span class="toggle-text">{{ offPeak ? '错峰' : '错峰' }}</span>
          </label>
          
          <!-- O1 视频参考控制（仅当有上游视频且为 O1 模型时显示） -->
          <template v-if="isKlingOmniModel && inheritedVideos.length > 0">
            <select v-model="omniVideoReferType" class="param-select">
              <option value="feature">视频参考</option>
              <option value="base">视频编辑</option>
            </select>
          </template>
          <!-- O1 保留原声开关（视频编辑模型始终显示，文/图生视频模型仅有视频时显示） -->
          <template v-if="(isKlingOmniEditModel && inheritedVideos.length > 0) || (isKlingOmniModel && inheritedVideos.length > 0)">
            <label class="off-peak-toggle" :class="{ 'active': omniKeepSound === 'yes' }">
              <input type="checkbox" :checked="omniKeepSound === 'yes'" @change="omniKeepSound = $event.target.checked ? 'yes' : 'no'" />
              <span class="toggle-icon">🔊</span>
              <span class="toggle-text">原声</span>
            </label>
          </template>
        </div>
        
        <div class="gen-actions">
          <!-- 积分消耗显示 -->
          <span class="points-cost-display">
            {{ pointsCost }} {{ t('imageGen.points') }}
          </span>
          
          <!-- 生成按钮 -->
          <button 
            v-if="!hasOutput"
            class="canvas-node-btn"
            :disabled="data.status === 'processing' || (!inheritedText && !inheritedImages.length && !inheritedVideos.length)"
            @click="handleGenerate"
          >
            {{ data.status === 'processing' ? '...' : '→ 生成' }}
          </button>
          
          <!-- 重新生成按钮 -->
          <button 
            v-else
            class="canvas-node-btn secondary"
            @click="handleRegenerate"
          >
            ⟲ 重新生成
          </button>
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
      v-if="hasOutput"
      class="node-add-btn"
      title="创建下一个节点"
      @click="handleAddClick"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.video-gen-node {
  min-width: 280px;
}

.video-preview {
  min-height: 160px;
}

.video-player {
  width: 100%;
  max-height: 200px;
  border-radius: var(--canvas-radius-sm);
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--canvas-text-secondary);
  font-size: 13px;
}

.loading-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary);
}

.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.error-icon {
  font-size: 24px;
}

.error-text {
  color: var(--canvas-accent-error);
  font-size: 12px;
}

.retry-btn {
  padding: 6px 12px;
  background: var(--canvas-bg-elevated);
  border: 1px solid var(--canvas-border-subtle);
  border-radius: var(--canvas-radius-sm);
  color: var(--canvas-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.retry-btn:hover {
  border-color: var(--canvas-accent-primary);
  color: var(--canvas-accent-primary);
}

.inherited-label {
  font-size: 11px;
  color: var(--canvas-accent-success);
  margin-bottom: 4px;
}

.inherited-text {
  font-size: 12px;
  color: var(--canvas-text-secondary);
  line-height: 1.4;
}

.reference-images {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle);
}

.reference-image {
  width: 48px;
  height: 48px;
  border-radius: var(--canvas-radius-sm);
  overflow: hidden;
  background: var(--canvas-bg-secondary);
}

.reference-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 视频参考缩略图样式 */
.reference-image.reference-video {
  position: relative;
}

.reference-video-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: white;
  pointer-events: none;
}

.reference-label {
  font-size: 12px;
  color: var(--canvas-text-tertiary);
}

.gen-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle);
  flex-wrap: wrap;
  gap: 8px;
}

.gen-params {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-select {
  background: var(--canvas-bg-secondary);
  border: 1px solid var(--canvas-border-subtle);
  border-radius: 4px;
  color: var(--canvas-text-primary);
  font-size: 11px;
  padding: 4px 6px;
  cursor: pointer;
}

.param-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.gen-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  left: -39px !important;
  top: calc(50% + 14px) !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -39px !important;
  top: calc(50% + 14px) !important;
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
  transition: all 0.2s ease;
  z-index: 10;
}

.canvas-node:hover .node-add-btn,
.video-gen-node.selected .node-add-btn {
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

.video-gen-node.resizing .canvas-node-content {
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

/* 模型选择器自定义样式 */
.model-selector-custom {
  position: relative;
  min-width: 140px;
}

.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #3a3a3a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.model-selector-trigger:hover {
  background: var(--canvas-bg-secondary, #252525);
  border-color: var(--canvas-border-default, #4a4a4a);
}

/* 黑白灰风格图标 - 实色渐变 */
.model-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  /* 黑白灰渐变背景 */
  background: linear-gradient(145deg, #4a4a4a 0%, #2d2d2d 50%, #1a1a1a 100%);
  color: #ffffff;
  border-radius: 6px;
  border: 1px solid #5a5a5a;
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.model-icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.model-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-primary, #e5e5e5);
}

.select-arrow {
  font-size: 10px;
  color: var(--canvas-text-secondary, #a0a0a0);
  transition: transform 0.2s ease;
}

.select-arrow.arrow-up {
  transform: rotate(180deg);
}

.model-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  overflow: hidden;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.model-dropdown-item {
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.model-dropdown-item:last-child {
  border-bottom: none;
}

.model-dropdown-item:hover {
  background: var(--canvas-bg-secondary, #252525);
}

.model-dropdown-item.active {
  background: rgba(59, 130, 246, 0.1);
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 下拉列表中的黑白灰图标 - 实色渐变 */
.model-item-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  /* 黑白灰渐变背景 */
  background: linear-gradient(145deg, #4a4a4a 0%, #2d2d2d 50%, #1a1a1a 100%);
  color: #ffffff;
  border-radius: 5px;
  border: 1px solid #5a5a5a;
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  flex-shrink: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.model-item-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-primary, #e5e5e5);
}

.model-item-desc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--canvas-text-secondary, #a0a0a0);
  line-height: 1.4;
}

/* 下拉框动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 错峰模式开关样式 */
.off-peak-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--canvas-bg-secondary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #3a3a3a);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  font-size: 11px;
  color: var(--canvas-text-secondary, #a0a0a0);
}

.off-peak-toggle input {
  display: none;
}

.off-peak-toggle:hover {
  border-color: var(--canvas-border-default, #4a4a4a);
}

.off-peak-toggle.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.5);
  color: rgb(165, 180, 252);
}

.off-peak-toggle .toggle-icon {
  font-size: 12px;
  line-height: 1;
}

.off-peak-toggle .toggle-text {
  font-weight: 500;
}
</style>

