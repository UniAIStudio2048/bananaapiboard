<script setup>
/**
 * AudioNode.vue - 音频节点（统一设计）
 * 
 * 设计规范（与 VideoNode 保持一致）：
 * - 顶部标签：显示 "Audio"
 * - 主体区域：空状态显示快捷操作，有输出显示音频播放器
 * - 左侧(+)：可选输入
 * - 右侧(+)：输出连接
 * - 快捷操作：图片对口型、音频生视频、音频提取文案
 */
import { ref, computed, watch, nextTick, inject, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getTenantHeaders, getAvailableMusicModels, refreshBrandConfig } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import { formatPoints } from '@/utils/format'
import MusicTagsSelector from '@/components/canvas/MusicTagsSelector.vue'
import apiClient from '@/api/client'
import { uploadCanvasMedia } from '@/api/canvas/workflow'

const { t } = useI18n()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals, getSelectedNodes } = useVueFlow()

// 可用音乐模型列表 - 从租户配置动态获取
const musicModels = computed(() => {
  return getAvailableMusicModels()
})

// 音乐生成相关状态
const selectedMusicModel = ref(props.data.musicModel || musicModels.value[0]?.value || 'chirp-v4')
const customMode = ref(props.data.customMode || false)
const musicPrompt = ref(props.data.musicPrompt || '')
const title = ref(props.data.title || '')
const tags = ref(props.data.tags || '')
const negativeTags = ref(props.data.negativeTags || '')
const makeInstrumental = ref(props.data.makeInstrumental || false)
const isGeneratingMusic = ref(false)

// 模型下拉框状态
const isMusicModelDropdownOpen = ref(false)
const musicModelSelectorRef = ref(null)
const dropdownDirection = ref('down')

// 高级选项折叠状态
const showAdvancedOptions = ref(false)

// 当前选中模型的配置
const currentMusicModelConfig = computed(() => {
  return musicModels.value.find(m => m.value === selectedMusicModel.value) || musicModels.value[0]
})

// 音乐生成积分消耗（生成2首歌）
const musicPointsCost = computed(() => (currentMusicModelConfig.value?.pointsCost || 20) * 2)

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 继承的数据（来自上游节点）
const inheritedText = computed(() => props.data.inheritedData?.content || '')

// 监听继承数据，自动填充到提示词
watch(inheritedText, (newText) => {
  if (newText && !musicPrompt.value) {
    musicPrompt.value = newText
  }
}, { immediate: true })

// 监听音乐生成参数变化，保存到节点数据
watch([selectedMusicModel, customMode, musicPrompt, title, tags, negativeTags, makeInstrumental],
  ([model, mode, prompt, t, tgs, ntgs, inst]) => {
    canvasStore.updateNodeData(props.id, {
      musicModel: model,
      customMode: mode,
      musicPrompt: prompt,
      title: t,
      tags: tgs,
      negativeTags: ntgs,
      makeInstrumental: inst
    })
  }
)

// 切换模型下拉框
function toggleMusicModelDropdown(event) {
  event.stopPropagation()
  
  // 计算下拉方向
  if (musicModelSelectorRef.value) {
    const rect = musicModelSelectorRef.value.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const dropdownHeight = 200
    
    if (rect.bottom + dropdownHeight > viewportHeight && rect.top > dropdownHeight) {
      dropdownDirection.value = 'up'
    } else {
      dropdownDirection.value = 'down'
    }
  }
  
  isMusicModelDropdownOpen.value = !isMusicModelDropdownOpen.value
}

// 选择模型
function selectMusicModel(modelValue) {
  selectedMusicModel.value = modelValue
  isMusicModelDropdownOpen.value = false
  // 保存到节点数据
  canvasStore.updateNodeData(props.id, { musicModel: modelValue })
}

// 点击外部关闭下拉框
function handleMusicModelDropdownClickOutside(event) {
  const dropdown = event.target.closest('.music-model-selector')
  if (!dropdown) {
    isMusicModelDropdownOpen.value = false
  }
}

// 处理下拉列表滚轮事件
function handleDropdownWheel(event) {
  event.stopPropagation()
}

// 生成音乐
async function handleGenerateMusic() {
  // 检查积分
  if (userPoints.value < musicPointsCost.value) {
    await showInsufficientPointsDialog(musicPointsCost.value, userPoints.value, 1)
    return
  }

  // 检查输入
  if (!musicPrompt.value.trim()) {
    await showAlert('请输入音乐描述或歌词', '提示')
    return
  }

  // 自定义模式下必须填写歌名
  if (customMode.value && !title.value.trim()) {
    await showAlert('自定义模式需要填写歌名', '提示')
    return
  }

  isGeneratingMusic.value = true

  // 更新节点状态，保存所有参数
  canvasStore.updateNodeData(props.id, {
    status: 'processing',
    musicPrompt: musicPrompt.value,
    musicModel: selectedMusicModel.value,
    customMode: customMode.value,
    title: title.value,
    tags: tags.value,
    negativeTags: negativeTags.value,
    makeInstrumental: makeInstrumental.value
  })

  try {
    // 调试日志：确认发送前的参数值
    console.log('[AudioNode] 发送参数:', {
      customMode: customMode.value,
      title: title.value,
      tags: tags.value,
      promptLength: musicPrompt.value?.length,
      makeInstrumental: makeInstrumental.value
    })
    
    const requestBody = {
      custom_mode: customMode.value ? '1' : '0',
      prompt: musicPrompt.value,
      model: selectedMusicModel.value,
      make_instrumental: makeInstrumental.value ? '1' : '0'
    }

    // 自定义模式下才发送title（必填）
    if (customMode.value && title.value) {
      requestBody.title = title.value
    }

    // tags和negative_tags无论哪种模式都可以发送
    if (tags.value) {
      requestBody.tags = tags.value
    }
    if (negativeTags.value) {
      requestBody.negative_tags = negativeTags.value
    }

    const response = await apiClient.post('/api/music/generate', requestBody)
    
    console.log('[AudioNode] 音乐生成任务已提交:', response)
    
    const taskIds = response.task_ids || []
    
    // 保存任务ID到节点数据
    canvasStore.updateNodeData(props.id, {
      taskIds,
      status: 'processing'
    })
    
    // 任务提交成功，立即恢复按钮状态
    isGeneratingMusic.value = false
    
    // 开始轮询任务状态
    pollMusicStatus(taskIds)
    
  } catch (error) {
    console.error('[AudioNode] 音乐生成失败:', error)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.response?.data?.error || error.message || '生成失败'
    })
    isGeneratingMusic.value = false
  }
}

// 轮询音乐生成状态
async function pollMusicStatus(taskIds) {
  const startTime = Date.now()
  const maxDuration = 15 * 60 * 1000 // 15分钟超时
  const pollInterval = 3000 // 3秒轮询一次
  
  const poll = async () => {
    const elapsed = Date.now() - startTime
    const elapsedMinutes = Math.floor(elapsed / 60000)
    const elapsedSeconds = Math.floor((elapsed % 60000) / 1000)
    
    // 15分钟超时
    if (elapsed >= maxDuration) {
      canvasStore.updateNodeData(props.id, {
        status: 'timeout',
        error: '生成超时（超过15分钟），请稍后查看历史记录'
      })
      console.log('[AudioNode] 音乐生成超时')
      return
    }
    
    // 更新进度显示
    canvasStore.updateNodeData(props.id, {
      progress: `已等待 ${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`
    })
    
    try {
      const promises = taskIds.map(taskId =>
        apiClient.get(`/api/music/query/${taskId}`)
      )
      
      const responses = await Promise.all(promises)
      // apiClient 直接返回数据，不是 { data: ... } 格式
      const results = responses.map(r => ({ status: r.status, data: r.data || r }))
      
      console.log('[AudioNode] 轮询结果:', results)
      
      const allCompleted = results.every(r => r.status === 'completed')
      const anyFailed = results.some(r => r.status === 'failed')
      const anyStreaming = results.some(r => r.status === 'streaming')
      
      if (anyFailed) {
        const failedResult = results.find(r => r.status === 'failed')
        canvasStore.updateNodeData(props.id, {
          status: 'error',
          error: failedResult.data?.error_message || '生成失败',
          progress: null
        })
        console.log('[AudioNode] 音乐生成失败')
      } else if (allCompleted) {
        // 完成后更新节点数据
        const firstResult = results[0]
        const songData = firstResult.data
        const songTitle = songData.title || '生成的音乐'
        canvasStore.updateNodeData(props.id, {
          status: 'success',
          musicHistory: results.map(r => r.data),
          audioUrl: songData.audio_url || songData.audio_stream_url,
          audioData: songData.audio_url || songData.audio_stream_url,
          title: songTitle,
          label: songTitle, // 自动更新节点标签为歌曲名称
          imageUrl: songData.image_large_url || songData.image_url,
          videoUrl: songData.video_url,
          progress: null,
          output: {
            type: 'audio',
            url: songData.audio_url || songData.audio_stream_url
          }
        })
        // 同步更新本地标签显示
        localLabel.value = songTitle
        console.log('[AudioNode] ✅ 音乐生成完成:', songTitle)
        // 刷新用户积分
        window.dispatchEvent(new CustomEvent('user-info-updated'))
      } else if (anyStreaming) {
        // 流式状态：音频预览就绪
        const streamingResult = results.find(r => r.status === 'streaming')
        canvasStore.updateNodeData(props.id, {
          status: 'streaming',
          audioUrl: streamingResult.data?.audio_url,
          title: streamingResult.data?.title,
          imageUrl: streamingResult.data?.image_url
        })
        console.log('[AudioNode] 音乐流式预览就绪')
        setTimeout(poll, pollInterval)
      } else {
        // 还在队列中
        setTimeout(poll, pollInterval)
      }
      
    } catch (error) {
      console.error('[AudioNode] 轮询失败:', error)
      // 网络错误继续重试
      setTimeout(poll, pollInterval)
    }
  }
  
  poll()
}

// 键盘快捷键
function handleMusicKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleGenerateMusic()
  }
}

// 自动调整文本框高度
function autoResizeTextarea() {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 重置高度以获取正确的 scrollHeight
  textarea.style.height = 'auto'
  
  // 计算最小高度 (2行约48px) 和最大高度 (8行约200px)
  const minHeight = 48
  const maxHeight = 200
  const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))
  
  textarea.style.height = newHeight + 'px'
}

// 监听 musicPrompt 变化，自动调整高度
watch(musicPrompt, () => {
  nextTick(() => {
    autoResizeTextarea()
  })
})

// 处理提示词框滚轮事件（阻止冒泡，让滚轮作用于文本框滚动条）
function handlePromptWheel(event) {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 检查是否有内容需要滚动
  const hasScroll = textarea.scrollHeight > textarea.clientHeight
  if (hasScroll) {
    // 阻止事件冒泡，让滚轮只作用于文本框
    event.stopPropagation()
  }
}

// 组件挂载时添加全局点击事件监听并刷新配置
onMounted(async () => {
  document.addEventListener('click', handleMusicModelDropdownClickOutside)
  document.addEventListener('click', handleSpeedDropdownClickOutside)
  
  // 刷新品牌配置以获取最新的音乐模型配置
  try {
    await refreshBrandConfig()
    console.log('[AudioNode] 已刷新品牌配置，音乐模型:', musicModels.value)
  } catch (e) {
    console.warn('[AudioNode] 刷新品牌配置失败:', e)
  }
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleMusicModelDropdownClickOutside)
  document.removeEventListener('click', handleSpeedDropdownClickOutside)
})

// 标签编辑状态
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data.label || 'Audio')

// 文件上传引用
const fileInputRef = ref(null)
const audioRef = ref(null)
const promptTextareaRef = ref(null)

// 播放状态
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(props.data.volume ?? 1) // 音量 0-1
const showVolumeIndicator = ref(false) // 是否显示音量指示器
let volumeIndicatorTimer = null

// 播放速度
const playbackRate = ref(props.data.playbackRate || 1)
const playbackRateOptions = [1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const showSpeedDropdown = ref(false)

// 拖拽状态
const isDragOver = ref(false)
const dragCounter = ref(0)

// 节点尺寸 - 与 VideoNode 类似的比例
const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 280)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
let resizeRafId = null

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'audio-node': true,
  'selected': props.selected,
  'has-output': hasAudio.value,
  'resizing': isResizing.value
}))

// 是否显示底部配置面板 - 单独选中时显示
const showConfigPanel = computed(() => {
  return props.selected === true && getSelectedNodes.value.length <= 1
})

// ========== 音频工具栏相关 ==========
// 是否显示工具栏（单独选中且有音频内容）- 与 ImageNode 保持一致
const showToolbar = computed(() => {
  return props.selected && getSelectedNodes.value.length <= 1 && hasAudio.value
})

// 是否有音频
const hasAudio = computed(() => {
  return props.data?.audioUrl || props.data?.output?.url || props.data?.audioData
})

// 是否有数据丢失（旧格式迁移时 blob URL 失效）
const hasDataLost = computed(() => props.data._dataLost === true)
const dataLostReason = computed(() => props.data._lostReason || '本地临时文件已失效')

// 是否正在上传中
const isUploading = computed(() => props.data.isUploading === true)

// 是否上传失败
const uploadFailed = computed(() => props.data.uploadFailed === true)

// 是否正在生成中
const isGenerating = computed(() => {
  const status = props.data?.status
  return status === 'processing' || status === 'streaming' || status === 'queued'
})

// 生成状态信息
const generatingStatus = computed(() => {
  const status = props.data?.status
  const progress = props.data?.progress
  
  if (status === 'processing' || status === 'queued') {
    return { text: '生成中...', icon: '🎵', progress }
  } else if (status === 'streaming') {
    return { text: '流式预览就绪', icon: '🎶', progress }
  } else if (status === 'timeout') {
    return { text: '生成超时', icon: '⏰', progress: null }
  } else if (status === 'error') {
    return { text: props.data?.error || '生成失败', icon: '❌', progress: null }
  }
  return null
})

// 获取音频URL
const audioUrl = computed(() => {
  return props.data?.audioUrl || props.data?.output?.url || props.data?.audioData || ''
})

// 音频标题
const audioTitle = computed(() => {
  return props.data?.title || props.data?.fileName || '音频'
})

// 节点内容样式
const contentStyle = computed(() => {
  if (hasAudio.value) {
    return { width: `${nodeWidth.value}px` }
  }
  return {
    width: `${nodeWidth.value}px`,
    minHeight: `${nodeHeight.value}px`
  }
})

// 格式化时间
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 播放进度百分比
const progressPercent = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
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
  const newLabel = localLabel.value.trim() || 'Audio'
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
    localLabel.value = props.data.label || 'Audio'
  }
}

// 快捷操作 - 简化版
const quickActions = [
  { 
    icon: '↑',
    label: '上传本地音频', 
    action: () => triggerUpload()
  },
  { 
    icon: '♫',
    label: '音频生视频', 
    action: () => handleAudioToVideo()
  }
]

// 图片对口型：创建图片节点 + 视频节点，连接 图片->视频, 音频->视频
function handleLipSync() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在上方创建图片节点
  const imageNodePosition = {
    x: currentNode.position.x,
    y: currentNode.position.y - 350
  }
  const imageNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: imageNodeId,
    type: 'image-input',
    position: imageNodePosition,
    data: {
      title: '人物图片',
      sourceImages: ['/logo.svg'],
      status: 'success'
    }
  })
  
  // 在右侧创建视频节点
  const videoNodePosition = {
    x: currentNode.position.x + 500,
    y: currentNode.position.y - 100
  }
  const videoNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: videoNodeId,
    type: 'video',
    position: videoNodePosition,
    data: {
      title: t('canvas.nodes.video'),
      label: t('canvas.nodes.video'),
      status: 'idle',
      generationMode: 'lip-sync'
    }
  })
  
  // 连接图片节点到视频节点
  canvasStore.addEdge({
    source: imageNodeId,
    target: videoNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 连接当前音频节点到视频节点
  canvasStore.addEdge({
    source: props.id,
    target: videoNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中视频节点
  canvasStore.selectNode(videoNodeId)
}

// 音频生视频：创建视频节点，连接 音频->视频
function handleAudioToVideo() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在右侧创建视频节点
  const videoNodePosition = {
    x: currentNode.position.x + 500,
    y: currentNode.position.y
  }
  const videoNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: videoNodeId,
    type: 'video',
    position: videoNodePosition,
    data: {
      title: t('canvas.nodes.video'),
      label: t('canvas.nodes.video'),
      status: 'idle',
      generationMode: 'audio-to-video'
    }
  })
  
  // 连接当前音频节点到视频节点
  canvasStore.addEdge({
    source: props.id,
    target: videoNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中视频节点
  canvasStore.selectNode(videoNodeId)
}

// 音频提取文案：创建文本节点，连接 音频->文本
function handleAudioToText() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在右侧创建文本节点
  const textNodePosition = {
    x: currentNode.position.x + 500,
    y: currentNode.position.y
  }
  const textNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: textNodeId,
    type: 'text-input',
    position: textNodePosition,
    data: {
      title: '提取文案',
      text: '',
      placeholder: '音频转文字结果将显示在这里...'
    }
  })
  
  // 连接当前音频节点到文本节点
  canvasStore.addEdge({
    source: props.id,
    target: textNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中文本节点
  canvasStore.selectNode(textNodeId)
}

// 触发上传
function triggerUpload() {
  fileInputRef.value?.click()
}

// 处理文件上传 - 使用 blob URL 秒加载 + 后台异步上传到云存储
async function handleFileUpload(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  if (!file.type.startsWith('audio/')) {
    alert('请上传音频文件')
    return
  }
  
  try {
    // 🚀 使用 blob URL 实现秒加载预览
    const blobUrl = URL.createObjectURL(file)
    console.log('[AudioNode] 秒加载 - 使用 blob URL 预览:', blobUrl)
    
    // 立即更新节点显示（使用 blob URL）
    // 🔧 同时清除上传失败/数据丢失状态
    canvasStore.updateNodeData(props.id, {
      audioUrl: blobUrl,
      fileName: file.name,
      title: file.name,
      status: 'success',
      output: {
        type: 'audio',
        url: blobUrl
      },
      isUploading: true, // 标记正在上传
      // 清除错误状态
      uploadFailed: false,
      uploadError: null,
      _dataLost: false,
      _lostReason: null
    })
    
    // 🔄 后台异步上传到云存储
    uploadAudioFileAsync(file, blobUrl, props.id)
    
  } catch (error) {
    console.error('[AudioNode] 上传失败:', error)
    await showAlert('音频文件处理失败，请重试', '错误')
  }
  
  // 清空文件选择
  event.target.value = ''
}

// 后台异步上传音频文件到云存储
async function uploadAudioFileAsync(file, blobUrl, nodeId) {
  try {
    console.log('[AudioNode] 后台异步上传音频开始:', file.name, '大小:', Math.round(file.size / 1024), 'KB')
    
    const result = await uploadCanvasMedia(file, 'audio')
    const cloudUrl = result.url
    
    console.log('[AudioNode] 音频上传成功，云URL:', cloudUrl)
    
    // 更新节点数据，将 blob URL 替换为云存储 URL
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      canvasStore.updateNodeData(nodeId, {
        audioUrl: cloudUrl,
        output: { ...node.data.output, url: cloudUrl },
        isUploading: false
      })
      console.log('[AudioNode] 节点已更新为云存储URL')
    }
    
    // 释放 blob URL 内存
    try {
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      // 忽略
    }
    
  } catch (error) {
    console.error('[AudioNode] 音频上传失败:', error.message)
    // 上传失败时保留 blob URL，标记上传失败
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      canvasStore.updateNodeData(nodeId, {
        isUploading: false,
        uploadFailed: true,
        uploadError: error.message
      })
    }
  }
}

// 切换播放/暂停
function togglePlay() {
  if (!audioRef.value) return
  
  if (isPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

// 音频事件处理
function handleTimeUpdate() {
  if (audioRef.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

function handleLoadedMetadata() {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
    canvasStore.updateNodeData(props.id, { audioDuration: audioRef.value.duration })
    // 应用保存的播放速度
    audioRef.value.playbackRate = playbackRate.value
  }
}

function handlePlay() {
  isPlaying.value = true
}

function handlePause() {
  isPlaying.value = false
}

function handleEnded() {
  isPlaying.value = false
  currentTime.value = 0
}

// 鼠标悬停自动播放
function handleMouseEnter() {
  if (!audioRef.value || !hasAudio.value) return
  audioRef.value.volume = volume.value
  audioRef.value.play().catch(() => {
    // 忽略自动播放被阻止的错误
  })
}

// 鼠标离开暂停播放
function handleMouseLeave() {
  if (!audioRef.value) return
  audioRef.value.pause()
}

// 滚轮调整音量
function handleWheel(event) {
  if (!audioRef.value || !hasAudio.value) return
  
  event.preventDefault()
  event.stopPropagation()
  
  // 向上滚动增加音量，向下滚动减少音量
  const delta = event.deltaY < 0 ? 0.1 : -0.1
  const newVolume = Math.max(0, Math.min(1, volume.value + delta))
  
  volume.value = newVolume
  audioRef.value.volume = newVolume
  
  // 保存音量到节点数据
  canvasStore.updateNodeData(props.id, { volume: newVolume })
  
  // 显示音量指示器
  showVolumeIndicator.value = true
  if (volumeIndicatorTimer) {
    clearTimeout(volumeIndicatorTimer)
  }
  volumeIndicatorTimer = setTimeout(() => {
    showVolumeIndicator.value = false
  }, 1500)
}

// 点击进度条跳转
function handleProgressClick(event) {
  if (!audioRef.value || !duration.value) return
  
  const rect = event.currentTarget.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  audioRef.value.currentTime = percent * duration.value
}

// 拖拽上传
function handleDragEnter(e) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter.value++
  isDragOver.value = true
}

function handleDragLeave(e) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragOver.value = false
  }
}

function handleDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

async function handleDrop(e) {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  dragCounter.value = 0
  
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  if (!file.type.startsWith('audio/')) return
  
  try {
    // 🔧 改进：使用 blob URL 立即显示 + 后台上传到云端（不再存储 base64）
    const blobUrl = URL.createObjectURL(file)
    
    canvasStore.updateNodeData(props.id, {
      audioUrl: blobUrl,
      fileName: file.name,
      title: file.name,
      status: 'success',
      output: {
        type: 'audio',
        url: blobUrl
      },
      isUploading: true
    })
    
    // 🔧 后台异步上传到云端
    uploadAudioFileAsync(file, blobUrl, props.id)
  } catch (error) {
    console.error('[AudioNode] 拖拽上传失败:', error)
  }
}

// 右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'audio-input', position: { x: 0, y: 0 }, data: props.data }
  )
}

// 左侧添加按钮
function handleAddLeftClick(event) {
  event.stopPropagation()
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY },
    'node-left',
    props.id
  )
}

// ========== 右侧添加按钮交互（单击/长按） ==========
const LONG_PRESS_DURATION = 300
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

function handleAddRightMouseDown(event) {
  event.stopPropagation()
  event.preventDefault()
  
  isLongPress = false
  pressStartPos = { x: event.clientX, y: event.clientY }
  
  pressTimer = setTimeout(() => {
    isLongPress = true
    startDragConnection(event)
  }, LONG_PRESS_DURATION)
  
  document.addEventListener('mousemove', handleAddRightMouseMove)
  document.addEventListener('mouseup', handleAddRightMouseUp)
}

function handleAddRightMouseMove(event) {
  const dx = event.clientX - pressStartPos.x
  const dy = event.clientY - pressStartPos.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  if (distance > 5 && !isLongPress) {
    clearTimeout(pressTimer)
    isLongPress = true
    startDragConnection(event)
  }
}

function handleAddRightMouseUp(event) {
  clearTimeout(pressTimer)
  document.removeEventListener('mousemove', handleAddRightMouseMove)
  document.removeEventListener('mouseup', handleAddRightMouseUp)
  
  if (!isLongPress) {
    canvasStore.openNodeSelector(
      { x: event.clientX, y: event.clientY },
      'node',
      props.id
    )
  }
}

function startDragConnection(event) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 计算节点右侧输出端口的画布坐标
  // 使用响应式的节点尺寸（最准确）
  const currentNodeWidth = nodeWidth.value || props.data?.width || 420
  const currentNodeHeight = nodeHeight.value || props.data?.height || 280
  const labelHeight = 28 // 节点标签高度
  const labelMarginBottom = 8 // 标签与卡片之间的间距
  const labelOffset = labelHeight + labelMarginBottom // 标签总偏移（高度 + 间距）
  const handleOffset = 34 // +号按钮中心相对于节点卡片边缘的偏移量
  
  const outputX = currentNode.position.x + currentNodeWidth + handleOffset
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[AudioNode] 开始拖拽连线，起始位置:', { 
    outputX, 
    outputY, 
    nodePosition: currentNode.position,
    nodeWidth: currentNodeWidth,
    nodeHeight: currentNodeHeight
  })
  
  // 调用 store 开始拖拽连线，使用节点输出端口位置作为起点
  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
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
  
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId)
  }
  
  const clientX = event.clientX
  const clientY = event.clientY
  
  resizeRafId = requestAnimationFrame(() => {
    if (!isResizing.value) return
    
    const deltaX = clientX - resizeStart.value.x
    const deltaY = clientY - resizeStart.value.y
    
    const viewport = canvasStore.viewport
    const zoom = viewport.zoom || 1
    
    if (resizeHandle.value === 'right' || resizeHandle.value === 'corner') {
      nodeWidth.value = Math.max(320, resizeStart.value.width + deltaX / zoom)
    }
    
    if (resizeHandle.value === 'bottom' || resizeHandle.value === 'corner') {
      nodeHeight.value = Math.max(200, resizeStart.value.height + deltaY / zoom)
    }
    
    // 实时更新连线位置
    updateNodeInternals(props.id)
    
    resizeRafId = null
  })
}

function handleResizeEnd() {
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
  
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

// 重置/更换音频
function handleReupload() {
  canvasStore.updateNodeData(props.id, {
    audioUrl: null,
    audioData: null,
    output: null,
    status: 'idle'
  })
}

// ========== 工具栏处理函数 ==========

// 统一使用后端代理下载音频，解决跨域和第三方CDN预览问题
// 🔧 修复：确保下载原音频，去除七牛云压缩参数
async function handleToolbarDownload() {
  const url = audioUrl.value
  if (!url) return
  
  // 生成文件名
  const fileName = props.data?.title || props.data?.fileName || `audio_${Date.now()}`
  const filename = fileName.endsWith('.mp3') || fileName.endsWith('.wav') ? fileName : `${fileName}.mp3`
  
  try {
    let blob
    
    if (url.startsWith('data:')) {
      // Base64 数据 - 直接在本地处理
      const parts = url.split(',')
      const mimeMatch = parts[0].match(/:(.*?);/)
      const mime = mimeMatch ? mimeMatch[1] : 'audio/mpeg'
      const binary = atob(parts[1])
      const array = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i)
      }
      blob = new Blob([array], { type: mime })
    } else {
      // 🔧 修复：使用 buildDownloadUrl 构建下载链接，会自动清理七牛云压缩参数
      const { buildDownloadUrl, isQiniuCdnUrl } = await import('@/api/client')
      const downloadUrl = buildDownloadUrl(url, filename)
      
      // 七牛云 URL 直接下载（节省服务器流量）
      if (isQiniuCdnUrl(url)) {
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = filename
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        console.log('[AudioNode] 七牛云直接下载原音频:', filename)
        setTimeout(() => document.body.removeChild(link), 100)
        return
      }
      
      // 其他 URL 走后端代理下载
      const response = await fetch(downloadUrl, {
        headers: getTenantHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      blob = await response.blob()
    }
    
    // 创建下载链接
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(downloadUrl)
    console.log('[AudioNode] 下载原音频成功:', filename)
  } catch (error) {
    console.error('[AudioNode] 下载失败:', error)
    // 🔧 修复：使用带认证头的下载方式，解决前后端分离架构下的 401 错误
    try {
      const { buildDownloadUrl, downloadWithAuth } = await import('@/api/client')
      const downloadUrl = buildDownloadUrl(url, filename)
      await downloadWithAuth(downloadUrl, filename)
    } catch (e) {
      console.error('[AudioNode] 所有下载方式都失败:', e)
    }
  }
}

// 切换播放速度下拉
function toggleSpeedDropdown(event) {
  event.stopPropagation()
  showSpeedDropdown.value = !showSpeedDropdown.value
}

// 选择播放速度
function selectPlaybackRate(rate) {
  playbackRate.value = rate
  showSpeedDropdown.value = false
  
  // 更新音频元素的播放速度
  if (audioRef.value) {
    audioRef.value.playbackRate = rate
  }
  
  // 保存到节点数据
  canvasStore.updateNodeData(props.id, { playbackRate: rate })
}

// 监听编组整组执行触发
watch(() => props.data.executeTriggered, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal && props.data.triggeredByGroup) {
    console.log(`[AudioNode] 编组触发执行: ${props.id}`)
    handleGenerateMusic()
  }
})

// 点击外部关闭速度下拉
function handleSpeedDropdownClickOutside(event) {
  const dropdown = event.target.closest('.speed-dropdown')
  if (!dropdown) {
    showSpeedDropdown.value = false
  }
}

</script>

<template>
  <div 
    :class="nodeClass" 
    @contextmenu="handleContextMenu"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <!-- 左侧输入端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 音频工具栏（选中且有音频时显示）- 与 ImageNode 保持一致 -->
    <div v-show="showToolbar" class="audio-toolbar">
      <!-- 倍速选择器 -->
      <div class="speed-dropdown" @click.stop>
        <button class="toolbar-btn speed-btn" title="播放速度" @click="toggleSpeedDropdown">
          <span class="speed-value">{{ playbackRate }}x</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <!-- 速度下拉列表 -->
        <Transition name="dropdown-fade">
          <div v-if="showSpeedDropdown" class="speed-dropdown-list">
            <div
              v-for="rate in playbackRateOptions"
              :key="rate"
              class="speed-option"
              :class="{ 'active': playbackRate === rate }"
              @click="selectPlaybackRate(rate)"
            >
              {{ rate }}x
            </div>
          </div>
        </Transition>
      </div>
      
      <div class="toolbar-divider"></div>
      
      <!-- 下载按钮 -->
      <button class="toolbar-btn icon-only" title="下载" @mousedown.stop.prevent="handleToolbarDownload" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    
    <!-- 节点标签 -->
    <div 
      v-if="!isEditingLabel" 
      class="node-label"
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
      class="node-label-input"
      @blur="saveLabelEdit"
      @keydown="handleLabelKeyDown"
      @click.stop
      @mousedown.stop
    />
    
    <!-- 节点主体 -->
    <div class="node-wrapper">
      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加输入节点"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 节点卡片 -->
      <div 
        class="node-card" 
        :class="{ 'drag-over': isDragOver }"
        :style="contentStyle"
      >
        <!-- 隐藏的文件上传 -->
        <input 
          ref="fileInputRef"
          type="file" 
          accept="audio/*"
          class="hidden-file-input"
          @change="handleFileUpload"
        />
        
        <!-- 有音频时显示播放器 -->
        <div
          v-if="hasAudio"
          class="audio-output-wrapper"
          @mouseenter="handleMouseEnter"
          @mouseleave="handleMouseLeave"
          @wheel.prevent="handleWheel"
        >
          <!-- 隐藏的 audio 元素 -->
          <audio
            ref="audioRef"
            :src="audioUrl"
            @timeupdate="handleTimeUpdate"
            @loadedmetadata="handleLoadedMetadata"
            @play="handlePlay"
            @pause="handlePause"
            @ended="handleEnded"
          />

          <!-- 音量指示器 -->
          <div v-if="showVolumeIndicator" class="volume-indicator">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path v-if="volume > 0.5" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              <path v-else-if="volume > 0" d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
              <path v-else d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
            <span class="volume-value">{{ Math.round(volume * 100) }}%</span>
          </div>

          <!-- 音频可视化区域 -->
          <div class="audio-visual">
            <div class="audio-wave">
              <span v-for="i in 7" :key="i" :class="{ active: isPlaying }"></span>
            </div>
          </div>

          <!-- 播放控制 -->
          <div class="audio-controls">
            <button class="play-btn" @click="togglePlay">
              <svg v-if="isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>

            <!-- 进度条 -->
            <div class="progress-bar" @click="handleProgressClick">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>

            <!-- 时间显示 -->
            <div class="time-display">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </div>
          </div>

          <!-- 文件名 -->
          <div class="audio-title">{{ audioTitle }}</div>

        </div>
        
        <!-- 生成中状态 -->
        <div v-else-if="isGenerating || generatingStatus" class="node-content generating-state">
          <div class="generating-indicator">
            <div class="generating-icon" :class="{ spinning: isGenerating }">
              {{ generatingStatus?.icon || '🎵' }}
            </div>
            <div class="generating-text">{{ generatingStatus?.text || '处理中...' }}</div>
            <div v-if="generatingStatus?.progress" class="generating-progress">
              {{ generatingStatus.progress }}
            </div>
            <!-- 流式预览：显示可播放的预览 -->
            <div v-if="props.data?.status === 'streaming' && props.data?.audioUrl" class="streaming-preview">
              <audio :src="props.data.audioUrl" controls class="streaming-audio"></audio>
            </div>
          </div>
        </div>
        
        <!-- 数据丢失状态（旧格式 blob URL 失效） -->
        <div v-else-if="hasDataLost" class="node-content">
          <div class="error-state data-lost">
            <div class="error-icon">⚠️</div>
            <div class="error-text">{{ dataLostReason }}</div>
            <button class="retry-btn" @click="triggerUpload">重新上传</button>
          </div>
        </div>
        
        <!-- 上传中状态 -->
        <div v-else-if="isUploading" class="node-content">
          <div class="upload-progress">
            <span class="processing-text">上传中...</span>
          </div>
        </div>
        
        <!-- 上传失败状态 -->
        <div v-else-if="uploadFailed" class="node-content">
          <div class="error-state upload-failed">
            <div class="error-icon">⚠️</div>
            <div class="error-text">文件上传失败，保存时数据可能丢失</div>
            <button class="retry-btn" @click="triggerUpload">重新上传</button>
          </div>
        </div>
        
        <!-- 无音频时显示空状态 -->
        <div v-else class="node-content">
          <div class="empty-state">
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
        
        <!-- 拖拽覆盖层 -->
        <div v-if="isDragOver" class="drag-overlay">
          <div class="drag-hint">释放以上传音频</div>
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
      
      <!-- 右侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-right"
        title="单击：添加节点 | 长按/拖拽：连接到其他节点"
        @mousedown="handleAddRightMouseDown"
      >
        +
      </button>
    </div>
    
    <!-- 底部配置面板（选中时显示） - 黑白现代风格 -->
    <div v-show="showConfigPanel" class="config-panel" @mousedown.stop>
      <!-- 音乐生成配置（无音频时显示） -->
      <div v-if="!hasAudio" class="music-gen-panel">
        <!-- 大文本输入区 -->
        <div class="prompt-area">
          <textarea
            ref="promptTextareaRef"
            v-model="musicPrompt"
            class="prompt-textarea"
            placeholder="描述您想要的音乐。"
            @keydown="handleMusicKeyDown"
            @wheel="handlePromptWheel"
            @input="autoResizeTextarea"
          ></textarea>
        </div>
        
        <!-- 控制栏 -->
        <div class="control-bar">
          <!-- 左侧：类型选择 -->
          <div class="type-selector">
            <span class="type-icon">♫</span>
            <span class="type-label">音乐</span>
            <span class="type-arrow">▾</span>
          </div>
          
          <!-- 模型选择器 -->
          <div class="model-selector" ref="musicModelSelectorRef" @click.stop>
            <div class="model-trigger" @click="toggleMusicModelDropdown">
              <span class="model-icon">∥</span>
              <span class="model-name">{{ currentMusicModelConfig?.label || selectedMusicModel }}</span>
              <span class="model-arrow" :class="{ 'rotate': isMusicModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 模型下拉列表 -->
            <Transition name="dropdown-fade">
              <div 
                v-if="isMusicModelDropdownOpen" 
                class="model-dropdown-list"
                :class="{ 'dropdown-up': dropdownDirection === 'up', 'dropdown-down': dropdownDirection === 'down' }"
                @wheel="handleDropdownWheel"
              >
                <div
                  v-for="m in musicModels"
                  :key="m.value"
                  class="model-option"
                  :class="{ 'active': selectedMusicModel === m.value }"
                  @click="selectMusicModel(m.value)"
                >
                  <span class="option-name">{{ m.label }}</span>
                  <span v-if="m.description" class="option-desc">{{ m.description }}</span>
                </div>
              </div>
            </Transition>
          </div>
          
          <!-- 字数统计 -->
          <span class="char-count">{{ musicPrompt.length }}/4100</span>
          
          <!-- 积分显示 -->
          <div class="points-badge">
            <span class="points-icon">◎</span>
            <span class="points-value">{{ formatPoints(musicPointsCost) }}积分</span>
          </div>
          
          <!-- 生成按钮 -->
          <button
            class="gen-btn"
            :disabled="isGeneratingMusic || !musicPrompt.trim()"
            @click="handleGenerateMusic"
          >
            <svg v-if="!isGeneratingMusic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
            <span v-else class="loading-dots">···</span>
          </button>
        </div>
        
        <!-- 展开/收起按钮 -->
        <button class="collapse-trigger" @click="showAdvancedOptions = !showAdvancedOptions">
          <span class="collapse-icon" :class="{ 'expanded': showAdvancedOptions }">∧</span>
          <span>{{ showAdvancedOptions ? '收起' : '展开' }}</span>
        </button>
        
        <!-- 高级选项 -->
        <Transition name="slide-down">
          <div v-if="showAdvancedOptions" class="advanced-options">
            <!-- 纯音乐开关 -->
            <div class="option-row">
              <span class="option-label">纯音乐</span>
              <label class="toggle-switch">
                <input type="checkbox" v-model="makeInstrumental" />
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <!-- 生成模式 -->
            <div class="option-row">
              <span class="option-label">生成模式</span>
              <div class="mode-tabs">
                <button :class="['mode-tab', { active: !customMode }]" @click="customMode = false">灵感</button>
                <button :class="['mode-tab', { active: customMode }]" @click="customMode = true">自定义</button>
              </div>
            </div>
            
            <!-- 歌名（仅自定义模式） -->
            <div v-if="customMode" class="option-row vertical">
              <span class="option-label">歌名</span>
              <input v-model="title" type="text" class="option-input" placeholder="输入歌名" />
            </div>
            
            <!-- 风格标签 -->
            <div class="option-row vertical">
              <span class="option-label">风格标签</span>
              <MusicTagsSelector v-model="tags" />
            </div>
            
            <!-- 排除标签 -->
            <div class="option-row vertical">
              <span class="option-label">排除标签</span>
              <input v-model="negativeTags" type="text" class="option-input" placeholder="逗号分隔" />
            </div>
          </div>
        </Transition>
      </div>
      
      <!-- 有音频时的面板 -->
      <div v-else class="audio-info-panel">
        <div class="audio-info-header">
          <span class="audio-info-title">{{ audioTitle }}</span>
        </div>
        <div class="audio-actions-row">
          <div class="audio-actions-left">
            <button class="audio-action-btn" @click.stop="handleLipSync">
              <span class="action-icon">◐</span>
              <span class="action-text">对口型</span>
            </button>
            <button class="audio-action-btn" @click.stop="handleAudioToVideo">
              <span class="action-icon">▶</span>
              <span class="action-text">生视频</span>
            </button>
            <button class="audio-action-btn" @click.stop="handleAudioToText">
              <span class="action-icon">✎</span>
              <span class="action-text">提文案</span>
            </button>
          </div>
          <div class="audio-actions-right">
            <!-- 重新生成按钮 - 蓝色圆形icon -->
            <button
              class="audio-regenerate-btn"
              @click.stop="handleReupload"
              title="重新生成"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 右侧输出端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />
  </div>
</template>

<style scoped>
.audio-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: visible;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* ========== 音频工具栏（与 ImageNode 的 image-toolbar 保持一致） ========== */
.audio-toolbar {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 20px;
  padding: 6px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  pointer-events: auto;
}

.audio-toolbar .toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.audio-toolbar .toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.audio-toolbar .toolbar-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.audio-toolbar .toolbar-btn.icon-only {
  padding: 6px;
}

.audio-toolbar .toolbar-btn.icon-only span {
  display: none;
}

.audio-toolbar .toolbar-divider {
  width: 1px;
  height: 20px;
  background: #3a3a3a;
  margin: 0 6px;
}

/* 倍速选择器 */
.speed-dropdown {
  position: relative;
}

.speed-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.speed-btn .speed-value {
  font-weight: 500;
  min-width: 32px;
  text-align: center;
}

.speed-btn svg {
  width: 12px;
  height: 12px;
}

.speed-dropdown-list {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e1e1e;
  border: 1px solid #333333;
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 300;
  min-width: 80px;
}

.speed-option {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #888;
  transition: all 0.15s;
}

.speed-option:hover {
  background: #2a2a2a;
  color: #fff;
}

.speed-option.active {
  background: #3a3a3a;
  color: #fff;
  font-weight: 500;
}

/* 节点标签 */
.node-label {
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

.node-label:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

/* 标签编辑输入框 */
.node-label-input {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-accent-audio, #a855f7);
  border-radius: 4px;
  padding: 4px 8px;
  outline: none;
  min-width: 60px;
  max-width: 200px;
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
  transition: all 0.2s ease;
}

.audio-node:hover .node-card {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.audio-node.selected .node-card {
  border-color: var(--canvas-accent-audio, #a855f7);
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
}

.node-card.drag-over {
  border-color: var(--canvas-accent-audio, #a855f7);
  background: rgba(168, 85, 247, 0.1);
}

/* 有输出时 - 无边框设计 */
.audio-node.has-output .node-card {
  background: transparent;
  border: none;
  overflow: visible;
  padding: 0;
  min-height: auto !important;
  height: auto !important;
}

.audio-node.has-output.selected .node-card {
  background: transparent;
  border: none;
  box-shadow: none;
}

/* 主内容区域 */
.node-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

/* 空状态（与 VideoNode 统一） */
.empty-state {
  flex: 1;
  padding: 20px;
}

/* 错误/数据丢失状态 */
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}

.error-state .error-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.error-state .error-text {
  color: var(--canvas-text-secondary, #999);
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.4;
}

.error-state .retry-btn {
  padding: 8px 16px;
  background: var(--canvas-accent-audio, #a855f7);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.error-state .retry-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 上传进度状态 */
.upload-progress {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-progress .processing-text {
  color: var(--canvas-accent-audio, #a855f7);
  font-size: 14px;
}

.hint-text {
  color: var(--canvas-text-tertiary, #666666);
  font-size: 13px;
  margin-bottom: 16px;
}

.quick-action {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.quick-action:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

.action-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
  margin-right: 8px;
}

.action-label {
  flex: 1;
}

/* 生成中状态 */
.generating-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.generating-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
}

.generating-icon {
  font-size: 32px;
  animation: none;
}

.generating-icon.spinning {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.generating-text {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  font-weight: 500;
}

.generating-progress {
  color: var(--canvas-accent-audio, #a855f7);
  font-size: 12px;
  font-family: monospace;
}

.streaming-preview {
  margin-top: 8px;
  width: 100%;
}

.streaming-audio {
  width: 100%;
  height: 32px;
  border-radius: 8px;
}

/* ========== 音频输出预览 - 毛玻璃现代设计 ========== */
.audio-output-wrapper {
  position: relative;
  width: 100%;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, 
    rgba(35, 38, 48, 0.85) 0%,
    rgba(25, 28, 38, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.audio-node.selected .audio-output-wrapper {
  border-color: rgba(168, 85, 247, 0.4);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(168, 85, 247, 0.3),
    0 0 30px rgba(168, 85, 247, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* 音量指示器 */
.volume-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  z-index: 100;
  pointer-events: none;
  animation: fadeIn 0.15s ease;
}

.volume-indicator svg {
  opacity: 0.9;
}

.volume-value {
  min-width: 36px;
  text-align: center;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* 音频可视化 - 毛玻璃风格 */
.audio-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.12) 0%,
    rgba(139, 92, 246, 0.08) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(168, 85, 247, 0.15);
  border-radius: 14px;
  margin-bottom: 16px;
}

.audio-wave {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 50px;
}

.audio-wave span {
  width: 5px;
  background: linear-gradient(180deg, #a855f7 0%, #d8b4fe 100%);
  border-radius: 3px;
  transition: height 0.2s;
}

.audio-wave span:nth-child(1) { height: 18px; }
.audio-wave span:nth-child(2) { height: 28px; }
.audio-wave span:nth-child(3) { height: 40px; }
.audio-wave span:nth-child(4) { height: 50px; }
.audio-wave span:nth-child(5) { height: 40px; }
.audio-wave span:nth-child(6) { height: 28px; }
.audio-wave span:nth-child(7) { height: 18px; }

.audio-wave span.active {
  animation: wave 0.5s ease-in-out infinite;
}

.audio-wave span:nth-child(1).active { animation-delay: 0s; }
.audio-wave span:nth-child(2).active { animation-delay: 0.08s; }
.audio-wave span:nth-child(3).active { animation-delay: 0.16s; }
.audio-wave span:nth-child(4).active { animation-delay: 0.24s; }
.audio-wave span:nth-child(5).active { animation-delay: 0.32s; }
.audio-wave span:nth-child(6).active { animation-delay: 0.4s; }
.audio-wave span:nth-child(7).active { animation-delay: 0.48s; }

@keyframes wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.4); }
}

/* 播放控制 - 毛玻璃现代设计 */
.audio-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.play-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.9) 0%,
    rgba(147, 51, 234, 0.95) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  box-shadow: 
    0 4px 16px rgba(168, 85, 247, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.play-btn:hover {
  transform: scale(1.08);
  box-shadow: 
    0 6px 24px rgba(168, 85, 247, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.25);
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: linear-gradient(90deg, 
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.12) 100%
  );
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

.progress-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, 
    rgba(168, 85, 247, 0.9) 0%,
    rgba(216, 180, 254, 0.95) 100%
  );
  border-radius: 3px;
  transition: width 0.1s;
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.4);
}

.time-display {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 80px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* 标题 */
.audio-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

/* 拖拽覆盖层 */
.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(168, 85, 247, 0.2);
  backdrop-filter: blur(2px);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 100;
}

.drag-hint {
  padding: 12px 24px;
  background: rgba(168, 85, 247, 0.9);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
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

.node-wrapper:hover .node-add-btn,
.audio-node.selected .node-add-btn {
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
  background: var(--canvas-accent-audio, #a855f7);
}

.resize-handle-bottom {
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 4px;
  cursor: ns-resize;
}

.resize-handle-bottom:hover {
  background: var(--canvas-accent-audio, #a855f7);
}

.resize-handle-corner {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: var(--canvas-accent-audio, #a855f7);
  border-radius: 2px;
}

/* 隐藏的文件输入 */
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

/* ========== 底部配置面板 - 黑白现代风格 ========== */
.config-panel {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: 520px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: visible;
  z-index: 1000;
  pointer-events: auto;
}

/* ===== 音乐生成面板 ===== */
.music-gen-panel {
  display: flex;
  flex-direction: column;
}

/* 提示词输入区域 */
.prompt-area {
  position: relative;
  padding: 16px 16px 12px;
}

.prompt-textarea {
  width: 100%;
  min-height: 48px;
  max-height: 200px;
  padding: 4px 0;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  outline: none;
  overflow-y: auto;
  transition: height 0.15s ease;
}

/* 提示词框滚动条样式 - 黑白灰风格 */
.prompt-textarea::-webkit-scrollbar {
  width: 6px;
}

.prompt-textarea::-webkit-scrollbar-track {
  background: rgba(60, 60, 60, 0.3);
  border-radius: 3px;
}

.prompt-textarea::-webkit-scrollbar-thumb {
  background: rgba(150, 150, 150, 0.6);
  border-radius: 3px;
  transition: background 0.2s;
}

.prompt-textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(180, 180, 180, 0.8);
}

.prompt-textarea::-webkit-scrollbar-thumb:active {
  background: rgba(200, 200, 200, 0.9);
}

/* Firefox 滚动条样式 */
.prompt-textarea {
  scrollbar-width: thin;
  scrollbar-color: rgba(150, 150, 150, 0.6) rgba(60, 60, 60, 0.3);
}

.prompt-textarea::placeholder {
  color: #666666;
}

/* 控制栏 */
.control-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #141414;
  border-top: 1px solid #252525;
}

/* 类型选择器 */
.type-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #252525;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.type-selector:hover {
  background: #2a2a2a;
}

.type-icon {
  font-size: 16px;
  color: #888888;
}

.type-label {
  font-size: 14px;
  color: #ffffff;
  font-weight: 500;
}

.type-arrow {
  font-size: 10px;
  color: #666666;
}

/* 模型选择器 */
.model-selector {
  position: relative;
  flex: 1;
  min-width: 0;
}

.model-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #252525;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.model-trigger:hover {
  background: #2a2a2a;
}

.model-icon {
  font-size: 14px;
  color: #888888;
}

.model-name {
  flex: 1;
  font-size: 14px;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-arrow {
  font-size: 10px;
  color: #666666;
  transition: transform 0.2s;
}

.model-arrow.rotate {
  transform: rotate(180deg);
}

/* 模型下拉列表 */
.model-dropdown-list {
  position: absolute;
  left: 0;
  right: 0;
  background: #1e1e1e;
  border: 1px solid #333333;
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  z-index: 9999;
  max-height: 300px;
  overflow-y: auto;
}

/* 向上弹出（默认） */
.model-dropdown-list.dropdown-up {
  bottom: calc(100% + 8px);
  top: auto;
}

/* 向下弹出 */
.model-dropdown-list.dropdown-down {
  top: calc(100% + 8px);
  bottom: auto;
}

.model-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.model-option:hover {
  background: #2a2a2a;
}

.model-option.active {
  background: #333333;
}

.option-name {
  font-size: 14px;
  color: #ffffff;
}

.option-desc {
  font-size: 12px;
  color: #888888;
}

/* 字数统计 */
.char-count {
  font-size: 13px;
  color: #666666;
  white-space: nowrap;
}

/* 积分徽章 */
.points-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #252525;
  border-radius: 20px;
}

.points-icon {
  font-size: 14px;
  color: #888888;
}

.points-value {
  font-size: 13px;
  color: #ffffff;
  white-space: nowrap;
}

/* 生成按钮 - 蓝色风格，与 ImageNode 一致 */
.gen-btn {
  width: 36px;
  height: 36px;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  border-radius: 50%;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.gen-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.5);
}

.gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-dots {
  font-size: 16px;
  font-weight: bold;
}

/* 展开/收起按钮 */
.collapse-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
  background: transparent;
  border: none;
  border-top: 1px solid #252525;
  color: #888888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.collapse-trigger:hover {
  background: rgba(255, 255, 255, 0.02);
  color: #ffffff;
}

.collapse-icon {
  font-size: 12px;
  transition: transform 0.2s;
}

.collapse-icon.expanded {
  transform: rotate(180deg);
}

/* 高级选项 */
.advanced-options {
  padding: 16px 20px 20px;
  border-top: 1px solid #252525;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.option-row.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.option-label {
  font-size: 14px;
  color: #888888;
}

.option-input {
  width: 100%;
  padding: 10px 12px;
  background: #252525;
  border: 1px solid #333333;
  border-radius: 8px;
  color: #ffffff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.option-input:focus {
  border-color: #555555;
}

.option-input::placeholder {
  color: #555555;
}

/* 开关 */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #333333;
  border-radius: 24px;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #888888;
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #ffffff;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background: #000000;
}

/* 模式切换 */
.mode-tabs {
  display: flex;
  gap: 4px;
  background: #252525;
  padding: 4px;
  border-radius: 8px;
}

.mode-tab {
  padding: 6px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #888888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tab:hover {
  color: #ffffff;
}

.mode-tab.active {
  background: #333333;
  color: #ffffff;
}

/* ===== 有音频时的信息面板 ===== */
.audio-info-panel {
  padding: 0;
}

.audio-info-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.audio-info-title {
  font-size: 14px;
  color: #ffffff;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 16px;
}

.audio-actions-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.audio-actions-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* 快捷操作按钮 - 模仿图像节点的模型选择器样式 */
.audio-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.audio-action-btn:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.audio-action-btn .action-icon {
  font-size: 14px;
}

.audio-action-btn .action-text {
  font-size: 13px;
}

/* 重新生成按钮 - 蓝色圆形icon */
.audio-regenerate-btn {
  width: 36px;
  height: 36px;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  border-radius: 50%;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.audio-regenerate-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.5);
}

.audio-regenerate-btn:active {
  transform: scale(0.95);
}

/* 下拉动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  transform-origin: top;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: scaleY(0.9);
}

.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  max-height: 500px;
  transform: scaleY(1);
}

/* 模型下拉框淡入动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 滚动条样式 */
.model-dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.model-dropdown-list::-webkit-scrollbar-track {
  background: transparent;
}

.model-dropdown-list::-webkit-scrollbar-thumb {
  background: #444444;
  border-radius: 3px;
}

.advanced-options::-webkit-scrollbar {
  width: 6px;
}

.advanced-options::-webkit-scrollbar-track {
  background: transparent;
}

.advanced-options::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   AudioNode 白昼模式样式适配
   ======================================== */

/* 配置面板 - 白昼模式 */
:root.canvas-theme-light .audio-node .config-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12) !important;
}

/* 音乐生成面板 */
:root.canvas-theme-light .audio-node .music-gen-panel {
  background: rgba(255, 255, 255, 0.98);
}

/* 提示词输入区域 */
:root.canvas-theme-light .audio-node .prompt-area {
  background: transparent;
}

:root.canvas-theme-light .audio-node .prompt-textarea {
  background: transparent;
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .prompt-textarea::placeholder {
  color: #a8a29e;
}

/* 控制栏 */
:root.canvas-theme-light .audio-node .control-bar {
  background: rgba(0, 0, 0, 0.02);
  border-top-color: rgba(0, 0, 0, 0.06);
}

/* 类型选择器 */
:root.canvas-theme-light .audio-node .type-selector {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .type-selector:hover {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .type-icon {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .type-label {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .type-arrow {
  color: #78716c;
}

/* 模型选择器 */
:root.canvas-theme-light .audio-node .model-trigger {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .model-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .model-icon {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .model-name {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .model-arrow {
  color: #78716c;
}

/* 模型下拉列表 */
:root.canvas-theme-light .audio-node .model-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-node .model-option {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .model-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .model-option.active {
  background: rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .audio-node .option-name {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .option-desc {
  color: #78716c;
}

/* 字数统计 */
:root.canvas-theme-light .audio-node .char-count {
  color: #a8a29e;
}

/* 积分徽章 */
:root.canvas-theme-light .audio-node .points-badge {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .points-icon {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .points-value {
  color: #1c1917;
}

/* 展开/收起按钮 */
:root.canvas-theme-light .audio-node .collapse-trigger {
  border-top-color: rgba(0, 0, 0, 0.06);
  color: #78716c;
}

:root.canvas-theme-light .audio-node .collapse-trigger:hover {
  background: rgba(0, 0, 0, 0.02);
  color: #1c1917;
}

/* 高级选项 */
:root.canvas-theme-light .audio-node .advanced-options {
  border-top-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .option-label {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .option-input {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .option-input:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .audio-node .option-input::placeholder {
  color: #a8a29e;
}

/* 开关 */
:root.canvas-theme-light .audio-node .toggle-slider {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-node .toggle-slider::before {
  background: #78716c;
}

:root.canvas-theme-light .audio-node .toggle-switch input:checked + .toggle-slider {
  background: #3b82f6;
}

:root.canvas-theme-light .audio-node .toggle-switch input:checked + .toggle-slider::before {
  background: #ffffff;
}

/* 模式切换 */
:root.canvas-theme-light .audio-node .mode-tabs {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .mode-tab {
  color: #78716c;
}

:root.canvas-theme-light .audio-node .mode-tab:hover {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .mode-tab.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

/* 音频信息面板 */
:root.canvas-theme-light .audio-node .audio-info-panel {
  background: rgba(255, 255, 255, 0.98);
}

:root.canvas-theme-light .audio-node .audio-info-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .audio-info-title {
  color: #1c1917;
}

/* 音频操作按钮 */
:root.canvas-theme-light .audio-node .audio-action-btn {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .audio-action-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
}

/* 工具栏 */
:root.canvas-theme-light .audio-node .audio-toolbar {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-node .audio-toolbar .toolbar-btn {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .audio-toolbar .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .audio-toolbar .toolbar-divider {
  background: rgba(0, 0, 0, 0.1);
}

/* 速度下拉 */
:root.canvas-theme-light .audio-node .speed-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-node .speed-option {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .speed-option:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .speed-option.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

/* 节点标签 */
:root.canvas-theme-light .audio-node .node-label {
  color: #a855f7;
}

/* 滚动条 */
:root.canvas-theme-light .audio-node .model-dropdown-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .audio-node .model-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-node .model-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .audio-node .prompt-textarea::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .audio-node .prompt-textarea::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-node .prompt-textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

/* ========== 音频播放器 - 白昼模式毛玻璃适配 ========== */
:root.canvas-theme-light .audio-node .audio-output-wrapper {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.8) 0%,
    rgba(248, 250, 252, 0.85) 100%
  ) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
}

:root.canvas-theme-light .audio-node.selected .audio-output-wrapper {
  border-color: rgba(168, 85, 247, 0.3) !important;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(168, 85, 247, 0.2),
    0 0 30px rgba(168, 85, 247, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.95) !important;
}

/* 音频可视化 - 白昼模式 */
:root.canvas-theme-light .audio-node .audio-visual {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.08) 0%,
    rgba(139, 92, 246, 0.05) 100%
  ) !important;
  border-color: rgba(168, 85, 247, 0.12) !important;
}

:root.canvas-theme-light .audio-node .audio-wave span {
  background: linear-gradient(180deg, #a855f7 0%, #c084fc 100%) !important;
}

/* 播放按钮 - 白昼模式 */
:root.canvas-theme-light .audio-node .play-btn {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.95) 0%,
    rgba(147, 51, 234, 1) 100%
  ) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
  box-shadow: 
    0 4px 16px rgba(168, 85, 247, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
}

:root.canvas-theme-light .audio-node .play-btn:hover {
  box-shadow: 
    0 6px 24px rgba(168, 85, 247, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
}

/* 进度条 - 白昼模式 */
:root.canvas-theme-light .audio-node .progress-bar {
  background: linear-gradient(90deg, 
    rgba(0, 0, 0, 0.06) 0%,
    rgba(0, 0, 0, 0.08) 100%
  ) !important;
}

:root.canvas-theme-light .audio-node .progress-bar::before {
  border-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .audio-node .progress-fill {
  background: linear-gradient(90deg, 
    rgba(168, 85, 247, 0.95) 0%,
    rgba(192, 132, 252, 1) 100%
  ) !important;
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.3) !important;
}

/* 时间显示 - 白昼模式 */
:root.canvas-theme-light .audio-node .time-display {
  color: rgba(0, 0, 0, 0.45) !important;
}

/* 音频标题 - 白昼模式 */
:root.canvas-theme-light .audio-node .audio-title {
  color: rgba(0, 0, 0, 0.65) !important;
}

/* 音量指示器 - 白昼模式 */
:root.canvas-theme-light .audio-node .volume-indicator {
  background: rgba(255, 255, 255, 0.95) !important;
  color: #1c1917 !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
}
</style>
