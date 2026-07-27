<script setup>
defineOptions({
  inheritAttrs: false
})
/**
 * AudioNode.vue - 音频节点（统一设计）
 * 
 * 设计规范（与 VideoNode 保持一致）：
 * - 顶部标签：显示 "Audio"
 * - 主体区域：空状态显示快捷操作，有输出显示音频播放器
 * - 左侧(+)：可选输入
 * - 右侧(+)：输出连接
 * - 快捷创建：通过右侧输出端口连接到目标节点
 */
import { ref, computed, watch, nextTick, inject, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore, useUploadManager } from '@/stores/canvas'
import { useModelStatsStore } from '@/stores/canvas/modelStatsStore'
import { getTenantHeaders, getAvailableMusicModels, getAvailableAudioModels, refreshBrandConfig } from '@/config/tenant'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import { formatPoints } from '@/utils/format'
import { calculateAudioPointsCost } from '@/utils/audioPricing'
import { getTotalUserPoints } from '@/utils/points'
import { isTextareaResizeHandlePointer } from '@/utils/promptTextareaResize'
import { createConfigPanelWheelZoom } from '@/utils/configPanelWheelZoom'
import { handlePromptWheel as handlePromptWheelEvent } from '@/utils/promptWheel'
import { buildCanvasSubmitFingerprint, createCanvasDuplicateSubmitGuard } from '@/utils/canvasDuplicateSubmitGuard'
import { buildPromptSafetyDialog, isPromptSafetyBlockedError } from '@/utils/promptSafetyError'
import { getPromptEditorSelectionRange, hasPromptEditorOrphanTextNodes, removePromptEditorOrphanTextNodes, restorePromptEditorSelection, serializePromptEditorContent } from '@/utils/promptMention'
import { getElementCenterFlowPosition } from '@/utils/canvasConnectionPosition'
import MusicTagsSelector from '@/components/canvas/MusicTagsSelector.vue'
import AudioEditorModal from '@/components/canvas/AudioEditorModal.vue'
import apiClient from '@/api/client'
import { submitAudioEdit } from '@/api/canvas/nodes'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import { useTeamStore } from '@/stores/team'
import { registerTask, getTasksByNodeId, removeCompletedTask } from '@/stores/canvas/backgroundTaskManager'
import { formatVideoNodeErrorMessage } from './video-error-message.js'
import { useNodeVisibility } from '@/composables/useNodeVisibility'
import { useImageHoverPreview } from '@/composables/useImageHoverPreview'
import PromptMediaTag from '../PromptMediaTag.vue'
import VoicePresetPicker from '../VoicePresetPicker.vue'

const { onAudioHoverStart, onHoverEnd } = useImageHoverPreview()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const emit = defineEmits(['updateNodeInternals'])

const canvasStore = useCanvasStore()
const duplicateSubmitGuard = createCanvasDuplicateSubmitGuard()
const uploadManager = useUploadManager()
const modelStatsStore = useModelStatsStore()
modelStatsStore.ensureStarted()
const userInfo = inject('userInfo')
const canvasPromptInputScale = inject('canvasPromptInputScale', computed(() => ({ enabled: false, style: {} })))
const isPromptInputFixedScale = computed(() => !!canvasPromptInputScale.value?.enabled)
const promptInputFixedScaleStyle = computed(() => canvasPromptInputScale.value?.style || {})

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals, setViewport, getViewport, getSelectedNodes } = useVueFlow()

// 节点根元素引用（用于配置面板放大居中）
const nodeRef = ref(null)

// 🚀 节点可见性追踪：让 useNodeVisibility 把 data-node-visible 属性写到
// 最近的 .vue-flow__node 祖先元素上，触发 canvas.css 的 content-visibility 虚拟化。
const { isVisible: isNodeVisible } = useNodeVisibility(nodeRef)

// 配置面板放大相关（与 VideoNode 保持一致的交互逻辑）
const configPanelRef = ref(null)
const isConfigPanelExpanded = ref(false)
const EXPANDED_CONFIG_PANEL_NODE_ZOOM = 1
const { configPanelScale, handleConfigPanelWheel, resetConfigPanelScale } = createConfigPanelWheelZoom()
const interactionMode = inject('interactionMode', ref('comfyui'))

// 可用音乐模型列表 - 从租户配置动态获取
const musicModels = computed(() => {
  return [
    ...getAvailableMusicModels().map(model => ({ ...model, kind: 'music' })),
    ...getAvailableAudioModels().map(model => ({ ...model, kind: 'coze-audio', icon: model.icon || '◉' }))
  ]
})

const selectedAudioGroup = ref('')
const audioModelGroups = computed(() => {
  const groups = []
  const groupMap = new Map()
  musicModels.value.forEach(model => {
    const name = model.kind === 'music' ? '音乐' : (model.groupName || '其他')
    const value = `${model.kind}:${name}`
    if (!groupMap.has(value)) {
      const group = { name, value, logo: model.groupLogo || model.icon || '♫', models: [] }
      groupMap.set(value, group)
      groups.push(group)
    }
    groupMap.get(value).models.push(model)
  })
  return groups
})
const currentAudioGroupModels = computed(() => {
  const selectedGroup = audioModelGroups.value.find(group => group.value === selectedAudioGroup.value)
  return selectedGroup?.models || audioModelGroups.value[0]?.models || musicModels.value
})

// 音乐生成相关状态
const selectedMusicModel = ref(props.data.musicModel || musicModels.value[0]?.value || 'chirp-v4')
const customMode = ref(props.data.customMode || false)
const musicPrompt = ref(props.data.musicPrompt || '')
const promptEditorRenderKey = ref(0)
const hasManualPromptTextareaSize = ref(false)
const title = ref(props.data.title || '')
const tags = ref(props.data.tags || '')
const negativeTags = ref(props.data.negativeTags || '')
const makeInstrumental = ref(props.data.makeInstrumental || false)
const isGeneratingMusic = ref(false)
const voiceDialect = ref(props.data.voiceDialect || '')
const voiceAgeGender = ref(props.data.voiceAgeGender || '')
const voiceTexture = ref(props.data.voiceTexture || '')
const voicePace = ref(props.data.voicePace || '')
const voiceMood = ref(props.data.voiceMood || '')
const voiceCustomDescription = ref(props.data.voiceCustomDescription || (props.data.voiceStyle !== 'general' ? props.data.voiceStyle || '' : ''))
const selectedVoicePreset = ref(props.data.selectedVoicePreset || null)
const showVoicePresetPicker = ref(false)

const voiceDesignOptions = {
  dialect: ['普通话', '中文方言', '英文', '日语', '韩语'],
  ageGender: ['儿童', '青年男声', '青年女声', '中年男声', '中年女声', '老年男声', '老年女声'],
  texture: ['清亮通透', '温暖醇厚', '低沉磁性', '柔和甜美', '沙哑颗粒感'],
  pace: ['语速缓慢', '语速适中', '语速偏快', '节奏明快', '节奏舒缓'],
  mood: ['自然亲切', '沉稳专业', '轻松愉悦', '温柔治愈', '富有感染力']
}
const voiceDesignStyle = computed(() => [
  voiceDialect.value,
  voiceAgeGender.value,
  voiceTexture.value,
  voicePace.value,
  voiceMood.value,
  voiceCustomDescription.value.trim()
].filter(Boolean).join('，'))
const voiceStyleTriggerLabel = computed(() => voiceAgeGender.value ? `${voiceAgeGender.value}音色` : '音色')
const voicePresetTriggerLabel = computed(() => selectedVoicePreset.value?.name || '选择音色')

// 模型下拉框状态
const isMusicModelDropdownOpen = ref(false)
const musicModelSelectorRef = ref(null)
const dropdownDirection = ref('down')
const isVoiceStyleDropdownOpen = ref(false)
const voiceStyleSelectorRef = ref(null)
const voiceStyleDropdownDirection = ref('down')
const activeVoiceStyleCategory = ref(null)

// 高级选项折叠状态
const showAdvancedOptions = ref(false)

// 当前选中模型的配置
const currentMusicModelConfig = computed(() => {
  return musicModels.value.find(m => m.value === selectedMusicModel.value) || musicModels.value[0]
})
const audioCapability = computed(() => currentMusicModelConfig.value?.kind === 'coze-audio' ? currentMusicModelConfig.value.capability : null)
const AUDIO_REFERENCE_NODE_TYPES = ['audio-input', 'audio']
const inheritedAudioSource = computed(() => {
  const edge = canvasStore.edges.find(edge => edge.target === props.id && AUDIO_REFERENCE_NODE_TYPES.includes(
    canvasStore.nodes.find(node => node.id === edge.source)?.type
  ))
  if (!edge) return null

  const sourceNode = canvasStore.nodes.find(node => node.id === edge.source)
  const sourceData = sourceNode?.data || {}
  const url = sourceData.output?.url || sourceData.audioUrl || sourceData.audioData || sourceData.previewUrl || ''
  return url ? { edgeId: edge.id, sourceData, url } : null
})
const inheritedAudioUrl = computed(() => inheritedAudioSource.value?.url || '')
const inheritedVoiceId = computed(() => {
  const sourceData = inheritedAudioSource.value?.sourceData
  return sourceData?.voiceId || sourceData?.voice_id || sourceData?.output?.voiceId || sourceData?.output?.voice_id || ''
})
const audioPromptPlaceholder = computed(() => {
  if (audioCapability.value === 'voice_design') return '说话的文本内容，描述希望角色说出的内容'
  if (audioCapability.value === 'tts') return '输入需要合成的文案。'
  if (audioCapability.value === 'voice_clone') return '说话的文本内容，描述你需要克隆的文本内容'
  return '描述您想要的音乐。'
})
const canGenerateCurrentAudio = computed(() => {
  if (audioCapability.value) return true
  return !!musicPrompt.value.trim()
})

watch(audioCapability, (capability) => {
  if (capability !== 'voice_design') {
    isVoiceStyleDropdownOpen.value = false
    activeVoiceStyleCategory.value = null
  }
})

watch(selectedVoicePreset, preset => {
  canvasStore.updateNodeData(props.id, { selectedVoicePreset: preset ? { ...preset } : null })
})

function formatModelAvgDuration(modelName) {
  const seconds = modelStatsStore.getAudioModelAvgDurationSeconds(modelName)
  return seconds === null ? '' : `${seconds}s`
}

function formatModelSuccessRate(modelName) {
  const rate = modelStatsStore.getAudioModelRate(modelName)
  return rate === null ? '100%' : `${Math.round(rate * 100)}%`
}

// 音乐生成积分消耗（生成2首歌）
const musicPointsCost = computed(() => {
  const cost = currentMusicModelConfig.value?.pointsCost || 20
  return audioCapability.value
    ? calculateAudioPointsCost(cost, musicPrompt.value)
    : cost * 2
})

function formatAudioErrorMessage(message) {
  return formatVideoNodeErrorMessage(message || '生成失败')
}

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return getTotalUserPoints(userInfo.value)
})

// 继承的数据（来自上游节点）
const inheritedText = computed(() => props.data.inheritedData?.content || '')

const highlightedMusicPromptSegments = computed(() => {
  if (!musicPrompt.value) return []
  const segments = []
  const regex = /@音频\d+/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(musicPrompt.value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: musicPrompt.value.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
        isTag: false
      })
    }
    const index = Number(match[0].replace('@音频', ''))
    segments.push({
      text: match[0],
      start: match.index,
      end: regex.lastIndex,
      isTag: true,
      media: index === 1 && inheritedAudioUrl.value
        ? { type: 'audio', index, label: `音频${index}`, url: inheritedAudioUrl.value }
        : null
    })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < musicPrompt.value.length) {
    segments.push({
      text: musicPrompt.value.slice(lastIndex),
      start: lastIndex,
      end: musicPrompt.value.length,
      isTag: false
    })
  }
  return segments
})

// 监听继承数据，自动填充到提示词
watch(inheritedText, (newText) => {
  if (newText && !musicPrompt.value) {
    musicPrompt.value = newText
  }
}, { immediate: true })

// 监听音乐生成参数变化，保存到节点数据
watch([selectedMusicModel, customMode, musicPrompt, title, tags, negativeTags, makeInstrumental, voiceDialect, voiceAgeGender, voiceTexture, voicePace, voiceMood, voiceCustomDescription, voiceDesignStyle],
  ([model, mode, prompt, t, tgs, ntgs, inst, dialect, ageGender, texture, pace, mood, customDescription, style]) => {
    canvasStore.updateNodeData(props.id, {
      musicModel: model,
      customMode: mode,
      musicPrompt: prompt,
      title: t,
      tags: tgs,
      negativeTags: ntgs,
      makeInstrumental: inst,
      voiceDialect: dialect,
      voiceAgeGender: ageGender,
      voiceTexture: texture,
      voicePace: pace,
      voiceMood: mood,
      voiceCustomDescription: customDescription,
      voiceStyle: style
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
  
  const nextOpen = !isMusicModelDropdownOpen.value
  if (nextOpen) {
    const selectedGroup = audioModelGroups.value.find(group =>
      group.models.some(model => model.value === selectedMusicModel.value)
    )
    selectedAudioGroup.value = selectedGroup?.value || audioModelGroups.value[0]?.value || ''
  }
  isMusicModelDropdownOpen.value = nextOpen
  if (nextOpen) isVoiceStyleDropdownOpen.value = false
}

function toggleVoiceStyleDropdown(event) {
  event.stopPropagation()
  const nextOpen = !isVoiceStyleDropdownOpen.value
  if (nextOpen) {
    const rect = voiceStyleSelectorRef.value?.getBoundingClientRect()
    const dropdownHeight = 420
    voiceStyleDropdownDirection.value = rect && rect.bottom + dropdownHeight > window.innerHeight && rect.top > dropdownHeight
      ? 'up'
      : 'down'
    activeVoiceStyleCategory.value = null
    isMusicModelDropdownOpen.value = false
  }
  isVoiceStyleDropdownOpen.value = nextOpen
}

// 选择模型
function selectMusicModel(modelValue) {
  selectedMusicModel.value = modelValue
  const selectedGroup = audioModelGroups.value.find(group => group.models.some(model => model.value === modelValue))
  selectedAudioGroup.value = selectedGroup?.value || selectedAudioGroup.value
  isMusicModelDropdownOpen.value = false
  // 保存到节点数据
  canvasStore.updateNodeData(props.id, { musicModel: modelValue })
}

function selectVoicePreset(voice) {
  selectedVoicePreset.value = voice
  showVoicePresetPicker.value = false
}

// 点击外部关闭下拉框
function handleMusicModelDropdownClickOutside(event) {
  if (!event.target.closest('.model-selector')) {
    isMusicModelDropdownOpen.value = false
  }
  if (!event.target.closest('.voice-style-selector')) {
    isVoiceStyleDropdownOpen.value = false
    activeVoiceStyleCategory.value = null
  }
}

// 处理下拉列表滚轮事件
function handleDropdownWheel(event) {
  event.stopPropagation()
}

// 生成音乐
async function handleGenerateMusic() {
  if (audioCapability.value) {
    await handleGenerateCozeAudio()
    return
  }
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

  const submitFingerprint = buildCanvasSubmitFingerprint({
    nodeId: props.id,
    nodeType: 'audio',
    prompt: musicPrompt.value,
    model: selectedMusicModel.value,
    customMode: customMode.value,
    title: title.value,
    tags: tags.value,
    negativeTags: negativeTags.value,
    makeInstrumental: makeInstrumental.value
  })
  const duplicateResult = duplicateSubmitGuard.check(submitFingerprint)
  if (duplicateResult.blocked) {
    await showAlert(duplicateResult.message, '重复提交')
    return
  }

  isGeneratingMusic.value = true

  const targetNode = props.data.status === 'processing'
    ? canvasStore.duplicateNodeWithIncomingEdges(props.id, { offset: { x: 40, y: 40 } })
    : null
  const targetNodeId = targetNode?.id || props.id

  // 更新节点状态，保存所有参数
  canvasStore.updateNodeData(targetNodeId, {
    status: 'processing',
    audioUrl: null,
    audioData: null,
    output: null,
    imageUrl: null,
    videoUrl: null,
    error: null,
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
    
    const teamStore = useTeamStore()
    const spaceParams = teamStore.getSpaceParams('current')
    
    const requestBody = {
      custom_mode: customMode.value ? '1' : '0',
      prompt: musicPrompt.value,
      model: selectedMusicModel.value,
      make_instrumental: makeInstrumental.value ? '1' : '0',
      spaceType: spaceParams.spaceType,
      ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
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
    canvasStore.updateNodeData(targetNodeId, {
      taskIds,
      status: 'processing'
    })
    
    // 任务提交成功，立即恢复按钮状态
    isGeneratingMusic.value = false
    
    // 开始轮询任务状态
    pollMusicStatus(targetNodeId, taskIds)
    
  } catch (error) {
    console.error('[AudioNode] 音乐生成失败:', error)
    if (isPromptSafetyBlockedError(error)) {
      const dialog = buildPromptSafetyDialog(error)
      canvasStore.updateNodeData(targetNodeId, {
        status: 'error',
        error: dialog.message
      })
      await showAlert(dialog.message, dialog.title, dialog.detail)
      isGeneratingMusic.value = false
      return
    }
    canvasStore.updateNodeData(targetNodeId, {
      status: 'error',
      error: formatAudioErrorMessage(error.response?.data?.message || error.response?.data?.error || error.message || '生成失败')
    })
    isGeneratingMusic.value = false
  }
}

async function handleGenerateCozeAudio() {
  if (!canGenerateCurrentAudio.value) {
    const message = audioCapability.value === 'voice_clone'
      ? '请连接或上传参考音频'
      : audioCapability.value === 'tts'
        ? '请输入文案，并且只连接一种音色来源'
        : '请输入音色描述'
    await showAlert(message, '提示')
    return
  }
  if (userPoints.value < musicPointsCost.value) {
    await showInsufficientPointsDialog(musicPointsCost.value, userPoints.value, 1)
    return
  }

  const targetNode = props.data.status === 'processing'
    ? canvasStore.duplicateNodeWithIncomingEdges(props.id, { offset: { x: 40, y: 40 } })
    : null
  const targetNodeId = targetNode?.id || props.id
  isGeneratingMusic.value = true
  canvasStore.updateNodeData(targetNodeId, { status: 'processing', error: null, output: null, audioUrl: null })
  try {
    const teamStore = useTeamStore()
    const spaceParams = teamStore.getSpaceParams('current')
    const body = {
      model: selectedMusicModel.value,
      spaceType: spaceParams.spaceType,
      ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
    }
    if (audioCapability.value === 'voice_design') {
      body.prompt = musicPrompt.value
      body.style = voiceDesignStyle.value
    } else if (audioCapability.value === 'voice_clone') {
      body.prompt = musicPrompt.value
      body.reference_audio_url = inheritedAudioUrl.value
    } else {
      body.text = musicPrompt.value
      if (inheritedAudioUrl.value) {
        body.reference_audio_url = inheritedAudioUrl.value
      } else if (selectedVoicePreset.value?.previewUrl) {
        body.voice_id = selectedVoicePreset.value.previewUrl
        body.reference_audio_text = selectedVoicePreset.value.transcript
      } else if (inheritedVoiceId.value) {
        body.voice_id = inheritedVoiceId.value
      }
    }
    const response = await apiClient.post('/api/audio/generate', body)
    canvasStore.updateNodeData(targetNodeId, { taskId: response.task_id, taskType: 'audio-generation', status: 'processing' })
    pollCozeAudioStatus(targetNodeId, response.task_id)
  } catch (error) {
    canvasStore.updateNodeData(targetNodeId, { status: 'error', error: formatAudioErrorMessage(error.response?.data?.error || error.message) })
  } finally {
    isGeneratingMusic.value = false
  }
}

async function pollCozeAudioStatus(nodeId, taskId) {
  try {
    const response = await apiClient.get(`/api/audio/query/${taskId}`)
    if (response.status === 'failed') {
      canvasStore.updateNodeData(nodeId, { status: 'error', error: response.data?.error_message || '音频生成失败' })
      return
    }
    if (response.status !== 'completed') {
      setTimeout(() => pollCozeAudioStatus(nodeId, taskId), 3000)
      return
    }
    const data = response.data || {}
    const url = data.audio_url || data.preview_url
    canvasStore.updateNodeData(nodeId, {
      status: 'success',
      audioUrl: url,
      audioData: url,
      voiceId: data.voice_id || null,
      output: {
        type: 'audio',
        url,
        voiceId: data.voice_id || null,
        capability: data.capability
      }
    })
    window.dispatchEvent(new CustomEvent('user-info-updated'))
  } catch (error) {
    setTimeout(() => pollCozeAudioStatus(nodeId, taskId), 3000)
  }
}

// 轮询音乐生成状态
async function pollMusicStatus(nodeId, taskIds) {
  const startTime = Date.now()
  const maxDuration = 15 * 60 * 1000 // 15分钟超时
  const pollInterval = 3000 // 3秒轮询一次
  
  const poll = async () => {
    const elapsed = Date.now() - startTime
    const elapsedMinutes = Math.floor(elapsed / 60000)
    const elapsedSeconds = Math.floor((elapsed % 60000) / 1000)
    
    // 15分钟超时
    if (elapsed >= maxDuration) {
      canvasStore.updateNodeData(nodeId, {
        status: 'timeout',
        error: '生成超时（超过15分钟），请稍后查看历史记录'
      })
      console.log('[AudioNode] 音乐生成超时')
      return
    }
    
    // 更新进度显示
    canvasStore.updateNodeData(nodeId, {
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
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: formatAudioErrorMessage(failedResult.data?.error_message || failedResult.data?.message || '生成失败'),
          progress: null
        })
        console.log('[AudioNode] 音乐生成失败')
      } else if (allCompleted) {
        // 完成后更新节点数据
        const firstResult = results[0]
        const songData = firstResult.data
        const songTitle = songData.title || '生成的音乐'
        canvasStore.updateNodeData(nodeId, {
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
        canvasStore.updateNodeData(nodeId, {
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
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    handleGenerateMusic()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    insertMusicEditorPlainText('\n')
  }
}

// IME 中文输入法 composition 状态：composition 期间浏览器会持续触发 input，
// 此时序列化得到的是临时拼音串、再调用 restorePromptEditorSelection 会破坏 IME 选区，
// 因此必须在 composition 期间直接 return，等 compositionend 后再统一处理一次
let isMusicInputComposing = false

function handleMusicCompositionStart() {
  isMusicInputComposing = true
}

function handleMusicCompositionEnd(event) {
  isMusicInputComposing = false
  handleMusicInput(event)
}

function handleMusicInput(event) {
  if (isMusicInputComposing || event?.isComposing) return
  const editor = event.target
  const selectionRange = getPromptEditorSelectionRange(editor)
  const text = serializePromptEditorContent(editor)
  const wasNonEmpty = !!musicPrompt.value
  if (text !== musicPrompt.value) {
    musicPrompt.value = text
  }
  autoResizeTextarea()
  const shouldRemountEditor = hasPromptEditorOrphanTextNodes(editor) ||
    Array.from(editor.childNodes).some(node => node.nodeType === 1 && node.tagName !== 'SPAN')

  if (wasNonEmpty && !text.trim()) {
    musicPrompt.value = ''
    promptEditorRenderKey.value += 1
    nextTick(() => {
      const nextEditor = promptTextareaRef.value
      if (nextEditor) {
        nextEditor.focus()
        restorePromptEditorSelection(nextEditor, 0, 0)
      }
    })
    return
  }

  if (shouldRemountEditor) {
    promptEditorRenderKey.value += 1
    nextTick(() => {
      const nextEditor = promptTextareaRef.value
      if (nextEditor) {
        nextEditor.focus()
        restorePromptEditorSelection(nextEditor, selectionRange.start, selectionRange.end)
      }
    })
  } else {
    nextTick(() => {
      removePromptEditorOrphanTextNodes(editor)
      restorePromptEditorSelection(editor, selectionRange.start, selectionRange.end)
    })
  }
}

function insertMusicEditorPlainText(text) {
  const editor = promptTextareaRef.value
  if (!editor) return
  const { start, end } = getPromptEditorSelectionRange(editor)
  musicPrompt.value = musicPrompt.value.slice(0, start) + text + musicPrompt.value.slice(end)
  nextTick(() => {
    removePromptEditorOrphanTextNodes(editor)
    const nextPos = start + text.length
    restorePromptEditorSelection(editor, nextPos, nextPos)
    autoResizeTextarea()
  })
}

function insertAudioReferenceTag() {
  const editor = promptTextareaRef.value
  const tag = '@音频1'
  if (!editor) {
    const prefix = musicPrompt.value && !/[\s\n]$/.test(musicPrompt.value) ? ' ' : ''
    musicPrompt.value += `${prefix}${tag} `
    return
  }

  const currentText = serializePromptEditorContent(editor)
  if (currentText !== musicPrompt.value) {
    musicPrompt.value = currentText
  }
  const { start, end } = getPromptEditorSelectionRange(editor)
  const before = currentText.slice(0, start)
  const after = currentText.slice(end)
  const prefix = before && !/[\s\n]$/.test(before) ? ' ' : ''
  const suffix = !after || !/^[\s\n]/.test(after) ? ' ' : ''
  const resultText = before + prefix + tag + suffix + after
  const resultCursor = start + prefix.length + tag.length + suffix.length
  const scrollPosition = { scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }
  musicPrompt.value = resultText
  promptEditorRenderKey.value += 1
  nextTick(() => {
    const nextEditor = promptTextareaRef.value || editor
    removePromptEditorOrphanTextNodes(nextEditor)
    autoResizeTextarea()
    restorePromptEditorSelection(nextEditor, resultCursor, resultCursor)
    nextEditor.scrollTop = scrollPosition.scrollTop
    nextEditor.scrollLeft = scrollPosition.scrollLeft
  })
}

function removeReferenceAudio(event) {
  event?.stopPropagation()
  const edgeId = inheritedAudioSource.value?.edgeId
  if (edgeId) canvasStore.removeEdge(edgeId)
}

// 自动调整文本框高度
function autoResizeTextarea() {
  if (hasManualPromptTextareaSize.value) return

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

function markPromptTextareaResizeIntent(event) {
  if (isTextareaResizeHandlePointer(event, promptTextareaRef.value)) {
    hasManualPromptTextareaSize.value = true
  }
}

// 监听 musicPrompt 变化，自动调整高度
watch(musicPrompt, () => {
  nextTick(() => {
    autoResizeTextarea()
  })
})

// 处理提示词框滚轮事件（阻止冒泡，让滚轮作用于文本框滚动条）
function handlePromptWheel(event) {
  handlePromptWheelEvent(event, { getViewport, setViewport, interactionMode })
}

// 配置面板放大：把节点居中到视口中心，方便放大后查看
function centerNodeInViewport() {
  const nodeEl = nodeRef.value
  const paneEl = nodeEl?.closest?.('.vue-flow')
  if (!nodeEl || !paneEl || !getViewport || !setViewport) return

  const nodeRect = nodeEl.getBoundingClientRect()
  const paneRect = paneEl.getBoundingClientRect()
  const viewport = getViewport()
  const targetZoom = EXPANDED_CONFIG_PANEL_NODE_ZOOM
  const nodeCenterFlowX = (nodeRect.left - paneRect.left + nodeRect.width / 2 - viewport.x) / viewport.zoom
  const nodeCenterFlowY = (nodeRect.top - paneRect.top + nodeRect.height / 2 - viewport.y) / viewport.zoom

  setViewport({
    x: paneRect.width / 2 - nodeCenterFlowX * targetZoom,
    y: paneRect.height / 2 - nodeCenterFlowY * targetZoom,
    zoom: targetZoom
  }, { duration: 420 })
}

function toggleConfigPanelExpanded() {
  const nextExpanded = !isConfigPanelExpanded.value
  if (nextExpanded) {
    resetConfigPanelScale()
    centerNodeInViewport()
  }
  isConfigPanelExpanded.value = nextExpanded
  if (nextExpanded) {
    nextTick(() => {
      promptTextareaRef.value?.focus()
    })
  }
}

function collapseConfigPanel() {
  isConfigPanelExpanded.value = false
  resetConfigPanelScale()
}

function handleConfigPanelOutsideMouseDown(event) {
  if (!isConfigPanelExpanded.value) return
  if (configPanelRef.value?.contains(event.target)) return
  collapseConfigPanel()
}

// 组件挂载时添加全局点击事件监听并刷新配置
onMounted(async () => {
  document.addEventListener('click', handleMusicModelDropdownClickOutside)
  document.addEventListener('click', handleSpeedEditorClickOutside)
  document.addEventListener('mousedown', handleConfigPanelOutsideMouseDown)
  window.addEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.addEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.addEventListener('background-task-progress', handleBackgroundTaskProgress)
  nextTick(() => {
    updateNodeInternals(props.id)
    checkAndRestoreAudioEditTasks()
    if (props.data?.taskType === 'audio-generation' && props.data?.taskId && ['processing', 'queued'].includes(props.data?.status)) {
      pollCozeAudioStatus(props.id, props.data.taskId)
    }
  })
  
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
  document.removeEventListener('click', handleSpeedEditorClickOutside)
  document.removeEventListener('mousedown', handleConfigPanelOutsideMouseDown)
  window.removeEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.removeEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.removeEventListener('background-task-progress', handleBackgroundTaskProgress)
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
const pendingPlaybackRate = ref(playbackRate.value)
const showSpeedEditor = ref(false)

// 拖拽状态
const isDragOver = ref(false)
const dragCounter = ref(0)

// 节点尺寸 - 与 VideoNode 类似的比例
const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 280)
const addRightBtnRef = ref(null)

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

watch(showConfigPanel, (val) => {
  if (!val) {
    isConfigPanelExpanded.value = false
  }
})

// ========== 音频工具栏相关 ==========
// 是否显示工具栏（单独选中且有音频内容）- 与 ImageNode 保持一致
const showToolbar = computed(() => {
  return props.selected && getSelectedNodes.value.length <= 1 && hasAudio.value
})

const showAudioEditor = ref(false)

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

function openAudioEditor(event) {
  event?.stopPropagation()
  if (isUploading.value) {
    showAlert('音频仍在上传中，请稍后再编辑', '提示')
    return
  }
  if (!audioUrl.value) {
    showAlert('当前节点没有可编辑的音频', '提示')
    return
  }
  showAudioEditor.value = true
}

function createAudioEditProcessingNode(taskId, editOptions) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null

  const newNodeId = `audio_edit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  const label = editOptions.mode === 'trim' ? '音频裁剪' : '音频编辑'

  canvasStore.addNode({
    id: newNodeId,
    type: 'audio',
    position: {
      x: currentNode.position.x + 500,
      y: currentNode.position.y
    },
    data: {
      label,
      title: label,
      status: 'processing',
      progress: editOptions.mode === 'trim' ? '裁剪中...' : '编辑中...',
      taskId,
      taskType: 'audio-edit',
      sourceNodeId: props.id,
      sourceAudioUrl: audioUrl.value,
      editOptions
    }
  })

  canvasStore.addEdge({
    id: `edge-${props.id}-${newNodeId}-${Date.now()}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'default'
  })

  return newNodeId
}

async function handleAudioEditorSubmit(editOptions) {
  showAudioEditor.value = false

  try {
    const result = await submitAudioEdit({
      audioUrl: audioUrl.value,
      sourceNodeId: props.id,
      ...editOptions
    })
    const taskId = result.taskId || result.task_id
    if (!taskId) throw new Error('未获取到音频处理任务ID')

    const resultNodeId = createAudioEditProcessingNode(taskId, editOptions)
    const currentTab = canvasStore.getCurrentTab()
    registerTask({
      taskId,
      type: 'audio-edit',
      nodeId: resultNodeId,
      tabId: currentTab?.id,
      metadata: {
        sourceNodeId: props.id,
        sourceUrl: audioUrl.value,
        editOptions
      }
    })
  } catch (error) {
    console.error('[AudioNode] 音频编辑提交失败:', error)
    if (isPromptSafetyBlockedError(error)) {
      const dialog = buildPromptSafetyDialog(error)
      await showAlert(dialog.message, dialog.title, dialog.detail)
      return
    }
    await showAlert(formatAudioErrorMessage(error.message || '音频处理任务提交失败'), '错误')
  }
}

function handleBackgroundTaskComplete(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id || task.type !== 'audio-edit') return

  const outputUrl = task.result?.audio_url || task.result?.outputUrl || task.result?.url
  if (outputUrl) {
    canvasStore.updateNodeData(props.id, {
      status: 'success',
      progress: null,
      audioUrl: outputUrl,
      audioData: outputUrl,
      output: {
        type: 'audio',
        url: outputUrl,
        sourceUrl: task.metadata?.sourceUrl
      }
    })
  } else {
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      progress: null,
      error: '音频处理完成但未返回音频地址'
    })
  }
  removeCompletedTask(taskId)
}

function handleBackgroundTaskFailed(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id || task.type !== 'audio-edit') return

  canvasStore.updateNodeData(props.id, {
    status: 'error',
    progress: null,
    error: formatAudioErrorMessage(task.error || '音频处理失败')
  })
  removeCompletedTask(taskId)
}

function handleBackgroundTaskProgress(event) {
  const { task } = event.detail
  if (task.nodeId !== props.id || task.type !== 'audio-edit') return

  canvasStore.updateNodeData(props.id, {
    status: 'processing',
    progress: task.result?.progress || task.progress || '编辑中...'
  })
}

function checkAndRestoreAudioEditTasks() {
  const nodeTasks = getTasksByNodeId(props.id)
  for (const task of nodeTasks) {
    if (task.type !== 'audio-edit') continue
    if (task.status === 'completed') {
      handleBackgroundTaskComplete({ detail: { taskId: task.taskId, task } })
    } else if (task.status === 'failed') {
      handleBackgroundTaskFailed({ detail: { taskId: task.taskId, task } })
    } else if (task.status === 'processing' || task.status === 'pending') {
      canvasStore.updateNodeData(props.id, {
        status: 'processing',
        progress: task.progress || '编辑中...'
      })
    }
  }
}

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

// 触发上传
function triggerUpload() {
  fileInputRef.value?.click()
}

const quickActions = [
  {
    icon: '↑',
    label: '上传本地音频',
    action: () => triggerUpload()
  }
]

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
  const tabId = canvasStore.activeTabId
  try {
    console.log('[AudioNode] 后台异步上传音频开始:', file.name, '大小:', Math.round(file.size / 1024), 'KB')
    
    const result = await uploadCanvasMedia(file, 'audio', { nodeId, tabId })
    console.log('[AudioNode] 音频上传成功，云URL:', result.url)
    canvasStore.commitMediaUpload({ nodeId, blobUrl, mediaType: 'audio', uploaded: result, tabId })
    
  } catch (error) {
    if (error?.name === 'AbortError') return
    console.error('[AudioNode] 音频上传失败:', error.message)
    canvasStore.markMediaUploadFailed({ nodeId, tabId, error })
    uploadManager.registerFailedUpload(`aud_${nodeId}_${Date.now()}`, {
      nodeId, tabId, file, type: 'audio', blobUrl,
      field: 'audioUrl',
      error: error.message
    })
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
    const audioDuration = Number(audioRef.value.duration)
    if (Number.isFinite(audioDuration) && audioDuration > 0) {
      duration.value = audioDuration
      canvasStore.updateNodeData(props.id, {
        audioDuration,
        ...(props.data.output
          ? { output: { ...props.data.output, duration: audioDuration } }
          : {})
      })
    }
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
  const buttonPosition = getElementCenterFlowPosition(addRightBtnRef.value, getViewport())
  if (buttonPosition) {
    canvasStore.startDragConnection(props.id, 'output', buttonPosition)
    return
  }

  console.warn('[AudioNode] 无法获取右侧 + 按钮中心，取消拖拽连线', { nodeId: props.id })
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

// ========== 工具栏处理函数 ==========

// 走 startStreamDownload：浏览器原生下载栏（带进度），点击立即响应
async function handleToolbarDownload() {
  const url = audioUrl.value
  if (!url) return
  
  // 生成文件名
  const fileName = props.data?.title || props.data?.fileName || `audio_${Date.now()}`
  const filename = fileName.endsWith('.mp3') || fileName.endsWith('.wav') ? fileName : `${fileName}.mp3`
  
  try {
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
      const blob = new Blob([array], { type: mime })
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
      return
    }

    const { startStreamDownload } = await import('@/api/client')
    startStreamDownload(url, filename)
    console.log('[AudioNode] 已开始下载原音频:', filename)
  } catch (error) {
    console.error('[AudioNode] 下载失败:', error)
  }
}

// 打开变速面板：调整期间不改变当前播放速度，确认后才写入节点数据。
function toggleSpeedEditor(event) {
  event.stopPropagation()
  pendingPlaybackRate.value = playbackRate.value
  showSpeedEditor.value = !showSpeedEditor.value
}

function applyPlaybackRate() {
  const rate = Math.max(0.1, Math.min(4, Number(pendingPlaybackRate.value) || 1))
  playbackRate.value = rate
  pendingPlaybackRate.value = rate
  showSpeedEditor.value = false
  
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

function handleSpeedEditorClickOutside(event) {
  if (!event.target.closest('.speed-editor') && !event.target.closest('.speed-toolbar-btn')) {
    showSpeedEditor.value = false
  }
}

</script>

<template>
  <div 
    ref="nodeRef"
    :class="nodeClass" 
    @contextmenu="handleContextMenu"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <!-- 音频工具栏（选中且有音频时显示）- 与 ImageNode 保持一致 -->
    <div v-show="showToolbar && !props.data?.readonly" class="audio-toolbar">
      <button class="toolbar-btn" title="截取音频" @mousedown.stop.prevent="openAudioEditor" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 7h3a3 3 0 013 3v4a3 3 0 003 3h7" stroke-linecap="round"/>
          <path d="M4 17h3a3 3 0 003-3v-4a3 3 0 013-3h7M16 5l4 4m0-4l-4 4M16 15l4 4m0-4l-4 4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>截取</span>
      </button>

      <div class="toolbar-divider"></div>

      <button class="toolbar-btn speed-toolbar-btn" title="变速" @mousedown.stop.prevent="toggleSpeedEditor" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 7V3l-4 4 4 4V7a5 5 0 11-4.8 6.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15.5 12.5l-3 2v-4z" stroke-linejoin="round"/>
        </svg>
        <span>变速</span>
      </button>

      <div class="toolbar-divider"></div>
      
      <!-- 下载按钮 -->
      <button class="toolbar-btn icon-only" title="下载" @mousedown.stop.prevent="handleToolbarDownload" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div v-if="showToolbar && showSpeedEditor && !props.data?.readonly" class="speed-editor" @click.stop>
      <button class="speed-editor-cancel" @click="showSpeedEditor = false">×　变速</button>
      <span class="speed-boundary">0.1x</span>
      <input v-model.number="pendingPlaybackRate" class="speed-slider" type="range" min="0.1" max="4" step="0.05" aria-label="播放速度" />
      <span class="speed-boundary">4.0x</span>
      <input v-model.number="pendingPlaybackRate" class="speed-number" type="number" min="0.1" max="4" step="0.05" aria-label="播放速度数值" />
      <button class="speed-editor-apply" title="应用变速" @click="applyPlaybackRate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 20V4m0 0L5 11m7-7l7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
      <!-- 左侧输入端口（与左侧加号共用定位坐标系） -->
      <Handle
        type="target"
        :position="Position.Left"
        id="input"
        class="node-handle node-handle-hidden"
        :style="{ position: 'absolute', left: '-34.5px', top: '50%', transform: 'translateY(-50%)' }"
      />

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
        :class="{
          'drag-over': isDragOver,
          'is-processing': props.data?.status === 'processing'
        }"
        :style="contentStyle"
      >
        <!-- 彗星环绕发光特效（与视频/图像节点的处理中状态一致） -->
        <svg
          v-if="props.data?.status === 'processing' && canvasStore.performanceMode === 'full'"
          class="comet-border"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient :id="'comet-gradient-audio-' + id" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="transparent" />
              <stop offset="70%" stop-color="rgba(74, 222, 128, 0.3)" />
              <stop offset="90%" stop-color="rgba(74, 222, 128, 0.8)" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <filter :id="'comet-glow-audio-' + id" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect x="1" y="1" width="98" height="98" rx="8" fill="none" stroke="rgba(74, 222, 128, 0.15)" stroke-width="1" />
          <rect
            class="comet-path"
            x="1"
            y="1"
            width="98"
            height="98"
            rx="8"
            fill="none"
            :stroke="'url(#comet-gradient-audio-' + id + ')'"
            stroke-width="2"
            :filter="'url(#comet-glow-audio-' + id + ')'"
          />
        </svg>

        <!-- 隐藏的文件上传 -->
        <input 
          ref="fileInputRef"
          type="file" 
          accept="audio/*"
          class="hidden-file-input"
          @change="handleFileUpload"
        />
        
        <!-- 生成中状态（与视频/图像节点统一） -->
        <div v-if="props.data?.status === 'processing'" class="node-content preview-loading">
          <div class="loading-spinner"></div>
          <span class="loading-title">音频生成中...</span>
          <span class="loading-hint">音频生成需要一定时间，请耐心等待</span>
        </div>

        <!-- 有音频时显示播放器 -->
        <div
          v-else-if="hasAudio"
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
      
      <!-- 输出端口 (隐藏但保留给 Vue Flow 用于边渲染) -->
      <Handle
        type="source"
        :position="Position.Right"
        id="output"
        class="node-handle node-handle-hidden"
        :style="{ position: 'absolute', right: '-34.5px', top: '50%', transform: 'translateY(-50%)' }"
      />

      <!-- 右侧添加按钮 -->
      <button 
        ref="addRightBtnRef"
        class="node-add-btn node-add-btn-right nodrag"
        title="单击：添加节点 | 长按/拖拽：连接到其他节点"
        @mousedown="handleAddRightMouseDown"
      >
        +
      </button>
    </div>
    
    <!-- 底部配置面板（选中时显示） - 黑白现代风格 -->
    <Teleport to="body" :disabled="!isConfigPanelExpanded">
    <div
      v-show="showConfigPanel"
      ref="configPanelRef"
      class="config-panel audio-config-panel"
      :class="{
        'config-panel-expanded': isConfigPanelExpanded,
        'canvas-fixed-prompt-panel': isPromptInputFixedScale && !isConfigPanelExpanded
      }"
      :style="[{ '--config-panel-scale': configPanelScale }, promptInputFixedScaleStyle]"
      @mousedown.stop
      @wheel="handleConfigPanelWheel($event, isConfigPanelExpanded)"
    >
      <button
        class="config-expand-btn"
        type="button"
        :title="isConfigPanelExpanded ? '缩小输入面板' : '放大输入面板'"
        :aria-label="isConfigPanelExpanded ? '缩小输入面板' : '放大输入面板'"
        @click.stop="toggleConfigPanelExpanded"
      >
        <svg v-if="!isConfigPanelExpanded" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 3h6v6" />
          <path d="M21 3l-7 7" />
          <path d="M9 21H3v-6" />
          <path d="M3 21l7-7" />
        </svg>
        <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 14h6v6" />
          <path d="M10 14l-7 7" />
          <path d="M20 10h-6V4" />
          <path d="M14 10l7-7" />
        </svg>
      </button>
      <!-- 音乐生成配置（与视频/图像节点一致，生成后仍可继续输入和提交） -->
      <div class="music-gen-panel">
        <!-- 参考音频，与视频节点参考素材区保持相同层级 -->
        <div class="audio-reference-section">
          <div class="audio-reference-header">
            <span class="audio-reference-label">参考音频</span>
            <span class="audio-reference-hint">连接音频节点作为音色来源</span>
          </div>
          <div class="audio-reference-list">
            <div
              v-if="inheritedAudioUrl"
              class="audio-reference-item nodrag"
              title="点击插入 @音频1"
              role="button"
              tabindex="0"
              @mousedown.stop
              @click="insertAudioReferenceTag"
              @keydown.enter.prevent="insertAudioReferenceTag"
              @mouseenter="onAudioHoverStart(inheritedAudioUrl, $event)"
              @mouseleave="onHoverEnd"
            >
              <span class="audio-reference-icon">♪</span>
              <span class="audio-reference-tag">@音频1</span>
              <button class="audio-reference-remove" type="button" title="移除参考音频" aria-label="移除参考音频" @click.stop="removeReferenceAudio">×</button>
            </div>
            <button class="audio-reference-add nodrag" type="button" @click="handleAddLeftClick">
              <span class="audio-reference-add-icon">+</span>
              <span>添加</span>
            </button>
          </div>
        </div>

        <!-- 大文本输入区 -->
        <div class="prompt-area">
          <div
            :key="promptEditorRenderKey"
            ref="promptTextareaRef"
            class="prompt-textarea"
            :class="{ 'is-empty': !musicPrompt }"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            :data-placeholder="audioPromptPlaceholder"
            @keydown="handleMusicKeyDown"
            @wheel="handlePromptWheel"
            @input="handleMusicInput"
            @compositionstart="handleMusicCompositionStart"
            @compositionend="handleMusicCompositionEnd"
            @mousedown="markPromptTextareaResizeIntent"
            @dblclick.stop
          >
            <span
              v-for="(seg, i) in highlightedMusicPromptSegments"
              :key="i"
              class="prompt-highlight-segment"
              :class="{ 'is-prompt-tag-slot': seg.isTag }"
              :data-prompt-segment-index="i"
              :data-prompt-segment-start="seg.start"
              :data-prompt-segment-end="seg.end"
              :data-prompt-mention="seg.isTag ? seg.text : undefined"
              :contenteditable="seg.isTag ? 'false' : undefined"
            ><PromptMediaTag
              v-if="seg.isTag"
              :text="seg.text"
              :media="seg.media"
              @mouseenter="seg.media && onAudioHoverStart(seg.media.url, $event)"
              @mouseleave="onHoverEnd"
            /><template v-else>{{ seg.text }}</template></span>
          </div>
        </div>
        
        <!-- 控制栏 -->
        <div class="control-bar">
          <!-- 模型选择器：左侧分组，右侧对应模型 -->
          <div class="model-selector" ref="musicModelSelectorRef" @click.stop>
            <div class="model-trigger" @click="toggleMusicModelDropdown">
              <span class="model-icon">{{ currentMusicModelConfig?.icon || '♫' }}</span>
              <span class="model-name">{{ currentMusicModelConfig?.label || selectedMusicModel }}</span>
              <span class="model-arrow" :class="{ 'rotate': isMusicModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 模型下拉列表 -->
            <Transition name="dropdown-fade">
              <div 
                v-if="isMusicModelDropdownOpen" 
                class="model-dropdown-list"
                :class="{ 'dropdown-up': dropdownDirection === 'up', 'dropdown-down': dropdownDirection === 'down', 'audio-vendor-layout': audioModelGroups.length > 1 }"
                @wheel="handleDropdownWheel"
              >
                <div v-if="audioModelGroups.length > 1" class="audio-group-column">
                  <button
                    v-for="group in audioModelGroups"
                    :key="group.value"
                    type="button"
                    class="audio-group-item"
                    :class="{ active: selectedAudioGroup === group.value }"
                    @click.stop="selectedAudioGroup = group.value"
                  >
                    <span class="audio-group-logo">{{ group.logo || group.name.charAt(0) }}</span>
                    <span class="audio-group-name">{{ group.name }}</span>
                  </button>
                </div>
                <div class="audio-model-column">
                  <div
                    v-for="m in currentAudioGroupModels"
                    :key="m.value"
                    class="model-option model-dropdown-item"
                    :class="{ 'active': selectedMusicModel === m.value }"
                    @click="selectMusicModel(m.value)"
                  >
                    <div class="model-item-main">
                      <span class="model-item-icon">{{ m.icon || '♫' }}</span>
                      <div class="model-item-content">
                        <span class="option-name model-item-label">{{ m.label }}</span>
                        <span v-if="m.description" class="option-desc model-item-desc">{{ m.description }}</span>
                      </div>
                      <span class="model-audio-stats model-item-meta">
                        <span class="signal-percent">{{ formatModelSuccessRate(m.value) }}</span>
                        <span v-if="formatModelAvgDuration(m.value)" class="model-duration-text">
                          {{ formatModelAvgDuration(m.value) }}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <div
            v-if="audioCapability === 'voice_design'"
            ref="voiceStyleSelectorRef"
            class="voice-style-selector"
            @mousedown.stop
            @click.stop
          >
            <button type="button" class="voice-style-trigger" @click="toggleVoiceStyleDropdown">
              <span>{{ voiceStyleTriggerLabel }}</span>
              <span class="voice-style-trigger-arrow" :class="{ 'arrow-up': isVoiceStyleDropdownOpen }">⌃</span>
            </button>
            <Transition name="dropdown-fade">
              <div
                v-if="isVoiceStyleDropdownOpen"
                class="voice-style-dropdown-panel"
                :class="{ 'dropdown-up': voiceStyleDropdownDirection === 'up' }"
              >
                <div class="voice-style-dropdown-title">音色设计</div>

                <button type="button" class="voice-style-category" :class="{ active: activeVoiceStyleCategory === 'dialect' }" @click="activeVoiceStyleCategory = activeVoiceStyleCategory === 'dialect' ? null : 'dialect'">
                  <span>方言 / 语种</span><span>{{ voiceDialect || '请选择' }}</span><span>›</span>
                </button>
                <div v-if="activeVoiceStyleCategory === 'dialect'" class="voice-style-options">
                  <button v-for="option in voiceDesignOptions.dialect" :key="option" type="button" :class="{ active: voiceDialect === option }" @click="voiceDialect = option; activeVoiceStyleCategory = null">{{ option }}</button>
                </div>

                <button type="button" class="voice-style-category" :class="{ active: activeVoiceStyleCategory === 'ageGender' }" @click="activeVoiceStyleCategory = activeVoiceStyleCategory === 'ageGender' ? null : 'ageGender'">
                  <span>年龄 / 性别</span><span>{{ voiceAgeGender || '请选择' }}</span><span>›</span>
                </button>
                <div v-if="activeVoiceStyleCategory === 'ageGender'" class="voice-style-options">
                  <button v-for="option in voiceDesignOptions.ageGender" :key="option" type="button" :class="{ active: voiceAgeGender === option }" @click="voiceAgeGender = option; activeVoiceStyleCategory = null">{{ option }}</button>
                </div>

                <button type="button" class="voice-style-category" :class="{ active: activeVoiceStyleCategory === 'texture' }" @click="activeVoiceStyleCategory = activeVoiceStyleCategory === 'texture' ? null : 'texture'">
                  <span>音色质感</span><span>{{ voiceTexture || '请选择' }}</span><span>›</span>
                </button>
                <div v-if="activeVoiceStyleCategory === 'texture'" class="voice-style-options">
                  <button v-for="option in voiceDesignOptions.texture" :key="option" type="button" :class="{ active: voiceTexture === option }" @click="voiceTexture = option; activeVoiceStyleCategory = null">{{ option }}</button>
                </div>

                <button type="button" class="voice-style-category" :class="{ active: activeVoiceStyleCategory === 'pace' }" @click="activeVoiceStyleCategory = activeVoiceStyleCategory === 'pace' ? null : 'pace'">
                  <span>语速 / 节奏</span><span>{{ voicePace || '请选择' }}</span><span>›</span>
                </button>
                <div v-if="activeVoiceStyleCategory === 'pace'" class="voice-style-options">
                  <button v-for="option in voiceDesignOptions.pace" :key="option" type="button" :class="{ active: voicePace === option }" @click="voicePace = option; activeVoiceStyleCategory = null">{{ option }}</button>
                </div>

                <button type="button" class="voice-style-category" :class="{ active: activeVoiceStyleCategory === 'mood' }" @click="activeVoiceStyleCategory = activeVoiceStyleCategory === 'mood' ? null : 'mood'">
                  <span>情绪 / 画面感</span><span>{{ voiceMood || '请选择' }}</span><span>›</span>
                </button>
                <div v-if="activeVoiceStyleCategory === 'mood'" class="voice-style-options">
                  <button v-for="option in voiceDesignOptions.mood" :key="option" type="button" :class="{ active: voiceMood === option }" @click="voiceMood = option; activeVoiceStyleCategory = null">{{ option }}</button>
                </div>

                <label class="voice-style-custom-input">
                  <span>自定义描述</span>
                  <input v-model="voiceCustomDescription" type="text" placeholder="可手动补充音色描述" />
                </label>
              </div>
            </Transition>
          </div>

          <button
            v-if="audioCapability === 'tts'"
            type="button"
            class="voice-preset-trigger"
            :title="inheritedAudioUrl ? '已连接参考音频，生成时将优先使用参考音频' : '选择预设音色'"
            @click="showVoicePresetPicker = true"
          >
            <span class="voice-preset-icon">♬</span>
            <span>{{ inheritedAudioUrl ? '参考音频优先' : voicePresetTriggerLabel }}</span>
            <span class="voice-preset-arrow">▾</span>
          </button>
          
          <!-- 字数统计 -->
          <span class="char-count">{{ musicPrompt.length }}/4100</span>
          
          <!-- 积分显示 -->
          <div class="points-badge">
            <span class="points-value">{{ formatPoints(musicPointsCost) }}积分</span>
          </div>
          
          <!-- 生成按钮 -->
          <button
            class="gen-btn"
            :disabled="isGeneratingMusic || !canGenerateCurrentAudio"
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
          <div v-if="showAdvancedOptions && !audioCapability" class="advanced-options">
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
          <div v-else-if="showAdvancedOptions && (audioCapability === 'voice_clone' || audioCapability === 'tts')" class="advanced-options">
            <div class="option-row vertical">
              <span class="option-label">音色来源</span>
              <span class="option-hint">{{ inheritedVoiceId ? `已连接音色 ${inheritedVoiceId}` : inheritedAudioUrl ? '已连接参考音频' : '请连接上游音频节点' }}</span>
            </div>
          </div>
        </Transition>
      </div>
      
    </div>
    </Teleport>
    <Teleport to="body">
      <AudioEditorModal
        v-if="showAudioEditor"
        :audio-url="audioUrl"
        :title="audioTitle"
        :duration="duration"
        @close="showAudioEditor = false"
        @submit="handleAudioEditorSubmit"
      />
      <VoicePresetPicker
        v-if="showVoicePresetPicker"
        :model-value="selectedVoicePreset"
        @close="showVoicePresetPicker = false"
        @select="selectVoicePreset"
      />
    </Teleport>
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
  contain: layout style;
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
  transition: background-color 0.15s ease, color 0.15s ease;
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

/* 变速面板 */
.speed-editor {
  position: absolute;
  top: calc(100% + 24px);
  left: 50%;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 520px;
  padding: 10px 16px;
  transform: translateX(-50%);
  border: 1px solid #3c3c3c;
  border-radius: 20px;
  background: #2a2a2a;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .45);
  pointer-events: auto;
}

.speed-editor-cancel {
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: #f5f5f5;
  font-size: 16px;
  white-space: nowrap;
  cursor: pointer;
}

.speed-boundary { color: #a3a3a3; font-size: 13px; white-space: nowrap; }
.speed-slider { flex: 1; min-width: 120px; accent-color: #13c2e8; cursor: pointer; }
.speed-number { width: 76px; min-height: 38px; padding: 0 8px; border: 0; border-radius: 10px; background: #4a4a4a; color: #fff; font-size: 16px; font-weight: 600; }
.speed-editor-apply { display: grid; width: 48px; height: 48px; place-items: center; border: 0; border-radius: 12px; background: #f5f5f5; color: #1f1f1f; cursor: pointer; }.speed-editor-apply svg { width: 24px; height: 24px; }

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
  transition: color 0.2s ease, background-color 0.2s ease;
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
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
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

/* ========== 彗星环绕发光特效（生成中，与视频/图像节点一致） ========== */
.node-card.is-processing {
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
  from { stroke-dashoffset: 100; }
  to { stroke-dashoffset: 0; }
}

/* 主内容区域 */
.node-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

/* 处理中预览状态 */
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
  animation: audio-loading-spin 1s linear infinite;
}

@keyframes audio-loading-spin {
  to { transform: rotate(360deg); }
}

.loading-title {
  color: var(--canvas-text-primary, #fff);
  font-size: 14px;
  font-weight: 500;
}

.loading-hint {
  color: var(--canvas-text-tertiary, #666);
  font-size: 11px;
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
  transition: opacity 0.2s ease, transform 0.2s ease;
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
  transition: background-color 0.15s ease, color 0.15s ease;
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
    rgba(35, 38, 48, 0.95) 0%,
    rgba(25, 28, 38, 0.95) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
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
  background: rgba(0, 0, 0, 0.95);
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
    rgb(168, 85, 247) 0%,
    rgb(147, 51, 234) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
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
  pointer-events: none;
}

/* 调整 Handle 位置与 + 按钮中心对齐 */
:deep(.vue-flow__handle.target) {
  left: -34.5px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -34.5px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.node-handle) {
  width: 1px !important;
  height: 1px !important;
  min-width: 1px !important;
  min-height: 1px !important;
  border: none !important;
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
  transition: opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
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
  width: min(max(100%, 780px), 90vw);
  min-width: 0;
  max-width: 90vw;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: visible;
  z-index: 1000;
  pointer-events: auto;
}

.config-panel-expanded {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 70vw;
  min-width: 70vw;
  max-width: calc(100vw - 32px);
  height: 70vh;
  max-height: calc(100vh - 32px);
  transform: translate(-50%, -50%) scale(var(--config-panel-scale, 1));
  transform-origin: center center;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
  z-index: 5000;
}

.config-expand-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--canvas-text-secondary, #a0a0a0);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  z-index: 5;
}

.config-expand-btn:hover {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.45);
  color: var(--canvas-text-primary, #ffffff);
}

.config-panel-expanded .config-expand-btn {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.5);
  color: var(--canvas-text-primary, #ffffff);
}

.config-panel-expanded .prompt-area {
  padding-right: 56px;
}

.config-panel-expanded .prompt-textarea {
  min-height: 320px;
  max-height: calc(70vh - 220px);
}

/* ===== 音乐生成面板 ===== */
.music-gen-panel {
  display: flex;
  flex-direction: column;
}

/* 参考音频区：与视频节点的参考素材区保持相同的信息层级 */
.audio-reference-section {
  padding: 14px 20px 16px;
  border-bottom: 1px solid #252525;
}

.audio-reference-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.audio-reference-label {
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.32);
  color: #d4d4d4;
  font-size: 12px;
}

.audio-reference-hint {
  color: #666666;
  font-size: 12px;
}

.audio-reference-list {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.audio-reference-item,
.audio-reference-add {
  width: 60px;
  height: 60px;
  min-height: 60px;
  border: 1px dashed #3a3a3a;
  border-radius: 8px;
  background: transparent;
}

.audio-reference-item {
  position: relative;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-style: solid;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(168, 85, 247, 0.1));
  color: rgba(200, 180, 255, 0.95);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.audio-reference-item:hover {
  transform: scale(1.08);
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.3);
  z-index: 2;
}

.audio-reference-icon {
  font-size: 22px;
  line-height: 1;
  color: rgba(192, 132, 252, 0.95);
}

.audio-reference-tag {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.65);
  color: #f9fafb;
  font-size: 9px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}

.audio-reference-remove {
  position: absolute;
  top: -7px;
  right: -7px;
  display: flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #ffffff;
  background: #ef4444;
  border: 2px solid #1e1e1e;
  border-radius: 50%;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
}

.audio-reference-item:hover .audio-reference-remove,
.audio-reference-remove:focus-visible {
  opacity: 1;
  transform: scale(1);
}

.audio-reference-remove:hover {
  background: #dc2626;
}

.audio-reference-add-icon {
  font-size: 20px;
  line-height: 1;
}

.audio-reference-add {
  font-size: 11px;
}

.audio-reference-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #858585;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.audio-reference-add:hover {
  border-color: #5a5a5a;
  background: rgba(255, 255, 255, 0.04);
  color: #ffffff;
}

/* 提示词输入区域 */
.prompt-area {
  position: relative;
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.prompt-textarea {
  position: relative;
  width: 100%;
  min-height: 63px;
  max-height: min(50vh, 420px);
  padding: 8px 10px;
  background: transparent;
  border: none;
  color: var(--canvas-text-primary, #fff);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
  transition: height 0.15s ease;
}

.prompt-textarea.is-empty:empty::before {
  content: attr(data-placeholder);
  position: absolute;
  top: 8px;
  left: 10px;
  right: 10px;
  color: var(--canvas-text-placeholder, #4a4a4a);
  pointer-events: none;
  white-space: pre-wrap;
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

/* 控制栏 */
.control-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #141414;
  border-top: 1px solid #252525;
}

/* 模型选择器 */
.model-selector {
  position: relative;
  flex: 1;
  min-width: 0;
}

.voice-style-selector {
  position: relative;
  z-index: 110;
  flex-shrink: 0;
}

.voice-style-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 10px;
  color: rgba(255, 255, 255, 0.92);
  background: #252525;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.voice-style-trigger:hover {
  background: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.08);
}

.voice-preset-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 34px;
  max-width: 180px;
  padding: 6px 10px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #252525;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.voice-preset-trigger:hover { background: #2a2a2a; border-color: rgba(255, 255, 255, 0.08); }
.voice-preset-icon { color: #c084fc; }.voice-preset-arrow { margin-left: auto; color: rgba(255, 255, 255, .48); font-size: 10px; }

.voice-style-trigger-arrow {
  color: rgba(255, 255, 255, 0.52);
  font-size: 11px;
  line-height: 1;
  transform: rotate(180deg);
  transition: transform 0.18s ease;
}

.voice-style-trigger-arrow.arrow-up {
  transform: rotate(0deg);
}

.voice-style-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(320px, calc(100vw - 32px));
  max-height: min(420px, calc(100vh - 32px));
  padding: 10px;
  overflow-y: auto;
  background: #252525;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.03);
  z-index: 1100;
}

.voice-style-dropdown-panel.dropdown-up {
  top: auto;
  bottom: calc(100% + 8px);
}

.voice-style-dropdown-title {
  padding: 6px 8px 8px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  font-weight: 600;
}

.voice-style-category {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.voice-style-category:hover,
.voice-style-category.active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.09);
}

.voice-style-category span:nth-child(2) {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-style-category span:last-child {
  color: rgba(255, 255, 255, 0.45);
  font-size: 16px;
}

.voice-style-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 6px 8px 10px;
}

.voice-style-options button {
  min-height: 32px;
  padding: 5px 8px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
}

.voice-style-options button:hover,
.voice-style-options button.active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.14);
}

.voice-style-custom-input {
  display: grid;
  gap: 6px;
  padding: 10px 8px 4px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
}

.voice-style-custom-input input {
  width: 100%;
  padding: 8px 10px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  outline: none;
}

.voice-style-custom-input input:focus {
  border-color: rgba(255, 255, 255, 0.35);
}

.voice-style-custom-input input::placeholder {
  color: rgba(255, 255, 255, 0.32);
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
  filter: grayscale(1);
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
  min-width: 260px;
  max-width: min(420px, calc(100vw - 32px));
  background: linear-gradient(135deg, rgba(18, 18, 22, 0.95), rgba(28, 28, 35, 0.92));
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
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

.model-dropdown-list.audio-vendor-layout {
  display: flex;
  width: min(560px, calc(100vw - 32px));
  min-width: min(560px, calc(100vw - 32px));
  max-height: 360px;
  padding: 0;
  overflow: hidden;
}

.audio-group-column {
  width: 88px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(22, 22, 28, 0.6), rgba(15, 15, 20, 0.8));
}

.audio-group-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  border-right: 2px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.audio-group-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.audio-group-item.active {
  border-right-color: rgba(139, 92, 246, 0.6);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.08));
  color: rgba(200, 180, 255, 0.9);
}

.audio-group-logo {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  font-weight: 700;
}

.audio-group-name {
  max-width: 72px;
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
  word-break: break-all;
}

.audio-model-column {
  min-width: 0;
  flex: 1;
  overflow-y: auto;
}

.model-option {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.model-option:last-child {
  margin-bottom: 0;
  border-bottom: 0;
}

.model-option:hover {
  background: rgba(255, 255, 255, 0.05);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.model-option.active {
  background: rgba(255, 255, 255, 0.07);
  border-bottom-color: rgba(255, 255, 255, 0.1);
  box-shadow: none;
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  width: 100%;
}

.model-item-icon {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 18px;
  font-weight: 700;
  filter: grayscale(1);
}

.model-item-content {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.model-item-meta {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 8px;
}

.option-name {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-desc {
  font-size: 13px;
  color: #888888;
  line-height: 1.4;
}

.model-audio-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 36px;
}

.signal-percent {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.1;
  color: #22c55e;
}

.model-duration-text {
  font-size: 10px;
  line-height: 1.1;
  color: #9ca3af;
  text-align: right;
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
  padding: 6px 12px;
  background: #252525;
  border-radius: 20px;
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
  transition: transform 0.2s ease, box-shadow 0.2s ease;
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
  transition: background-color 0.2s ease, color 0.2s ease;
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
  transition: transform 0.2s ease, background-color 0.2s ease;
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
  transition: background-color 0.2s ease, color 0.2s ease;
}

.mode-tab:hover {
  color: #ffffff;
}

.mode-tab.active {
  background: #333333;
  color: #ffffff;
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

:root.canvas-theme-light .config-panel-expanded {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.18) !important;
}

:root.canvas-theme-light .audio-config-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .audio-config-panel.config-panel-expanded {
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.18) !important;
}

:root.canvas-theme-light .audio-config-panel .config-expand-btn {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(0, 0, 0, 0.12);
  color: #57534e;
}

:root.canvas-theme-light .audio-config-panel .config-expand-btn:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #2563eb;
}

:root.canvas-theme-light .config-panel-expanded .config-expand-btn {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #2563eb;
}

/* 音乐生成面板 */
:root.canvas-theme-light .audio-node .music-gen-panel {
  background: rgba(255, 255, 255, 0.98);
}

:root.canvas-theme-light .audio-config-panel .music-gen-panel {
  background: rgba(255, 255, 255, 0.98);
}

/* 提示词输入区域 */
:root.canvas-theme-light .audio-node .prompt-area {
  background: transparent;
}

:root.canvas-theme-light .audio-config-panel .prompt-area {
  background: transparent;
}

:root.canvas-theme-light .audio-config-panel .audio-reference-section {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-config-panel .audio-reference-label {
  background: rgba(0, 0, 0, 0.05);
  color: #57534e;
}

:root.canvas-theme-light .audio-config-panel .audio-reference-hint,
:root.canvas-theme-light .audio-config-panel .audio-reference-add {
  color: #78716c;
}

:root.canvas-theme-light .audio-config-panel .audio-reference-item,
:root.canvas-theme-light .audio-config-panel .audio-reference-add {
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-config-panel .audio-reference-remove {
  border-color: #ffffff;
}

:root.canvas-theme-light .audio-config-panel .audio-reference-add:hover {
  background: rgba(0, 0, 0, 0.03);
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .prompt-textarea {
  background: transparent;
  color: #1c1917;
}

:root.canvas-theme-light .audio-config-panel .prompt-textarea {
  background: transparent;
  color: #1c1917;
  scrollbar-color: rgba(0, 0, 0, 0.16) rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .audio-node .prompt-textarea.is-empty:empty::before {
  color: #a8a29e;
}

:root.canvas-theme-light .audio-config-panel .prompt-textarea.is-empty:empty::before {
  color: #a8a29e;
}

/* 控制栏 */
:root.canvas-theme-light .audio-node .control-bar {
  background: rgba(0, 0, 0, 0.02);
  border-top-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-config-panel .control-bar {
  background: rgba(0, 0, 0, 0.02);
  border-top-color: rgba(0, 0, 0, 0.06);
}

/* 模型选择器 */
:root.canvas-theme-light .audio-node .model-trigger {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-config-panel .model-trigger {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .model-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-config-panel .model-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .voice-style-trigger {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .voice-style-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .audio-node .voice-preset-trigger {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .voice-preset-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .audio-node .voice-preset-arrow { color: rgba(0, 0, 0, .42); }

:root.canvas-theme-light .audio-node .voice-style-trigger-arrow,
:root.canvas-theme-light .audio-node .voice-style-category span:nth-child(2),
:root.canvas-theme-light .audio-node .voice-style-category span:last-child {
  color: rgba(0, 0, 0, 0.42);
}

:root.canvas-theme-light .audio-node .voice-style-dropdown-panel {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-node .voice-style-dropdown-title {
  color: rgba(0, 0, 0, 0.42);
}

:root.canvas-theme-light .audio-node .voice-style-category {
  color: rgba(0, 0, 0, 0.65);
}

:root.canvas-theme-light .audio-node .voice-style-category:hover,
:root.canvas-theme-light .audio-node .voice-style-category.active {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .voice-style-options button {
  color: rgba(0, 0, 0, 0.58);
  background: rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .audio-node .voice-style-options button:hover,
:root.canvas-theme-light .audio-node .voice-style-options button.active {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.09);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-node .voice-style-custom-input {
  color: rgba(0, 0, 0, 0.58);
}

:root.canvas-theme-light .audio-node .voice-style-custom-input input {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-node .voice-style-custom-input input::placeholder {
  color: rgba(0, 0, 0, 0.32);
}

:root.canvas-theme-light .audio-node .model-icon {
  color: #57534e;
}

:root.canvas-theme-light .audio-config-panel .model-icon {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .model-name {
  color: #1c1917;
}

:root.canvas-theme-light .audio-config-panel .model-name {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .model-arrow {
  color: #78716c;
}

:root.canvas-theme-light .audio-config-panel .model-arrow {
  color: #78716c;
}

/* 模型下拉列表 */
:root.canvas-theme-light .audio-node .model-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-config-panel .model-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-config-panel .audio-group-column {
  border-right-color: rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .audio-config-panel .audio-group-item {
  color: #78716c;
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-config-panel .audio-group-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-config-panel .audio-group-item.active {
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

:root.canvas-theme-light .audio-config-panel .audio-group-logo {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.04);
  color: #57534e;
}

:root.canvas-theme-light .audio-node .model-option {
  color: #1c1917;
}

:root.canvas-theme-light .audio-config-panel .model-option {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .model-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-config-panel .model-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .audio-node .model-option.active {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-config-panel .model-option.active {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-node .model-item-icon {
  color: #57534e;
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .audio-config-panel .model-item-icon {
  color: #57534e;
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .audio-node .option-name {
  color: #1c1917;
}

:root.canvas-theme-light .audio-config-panel .option-name {
  color: #1c1917;
}

:root.canvas-theme-light .audio-node .option-desc {
  color: #78716c;
}

:root.canvas-theme-light .audio-config-panel .option-desc {
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

/* 变速面板 */
:root.canvas-theme-light .audio-node .speed-editor {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-node .speed-editor-cancel,
:root.canvas-theme-light .audio-node .speed-number {
  color: #57534e;
}

:root.canvas-theme-light .audio-node .speed-number {
  background: rgba(0, 0, 0, 0.08);
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

:root.canvas-theme-light .audio-config-panel .prompt-textarea::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .audio-node .prompt-textarea::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-config-panel .prompt-textarea::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .audio-node .prompt-textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .audio-config-panel .prompt-textarea::-webkit-scrollbar-thumb:hover {
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
