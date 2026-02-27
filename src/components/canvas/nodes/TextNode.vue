<script setup>
/**
 * TextNode.vue - 文本输入节点
 * 支持三种状态：空状态（快捷操作）、待编辑状态、编辑模式
 * 底部配置面板集成在节点内，紧贴节点卡片
 */
import { ref, computed, watch, nextTick, inject, onMounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getLLMConfig, chatWithLLM, getUserLLMPresets, createUserLLMPreset, updateUserLLMPreset } from '@/api/canvas/llm'
import { getAssets } from '@/api/canvas/assets'
import { getApiUrl, getTenantHeaders, getAvailableLLMModels } from '@/config/tenant'
import { useI18n } from '@/i18n'
import CustomPresetDialog from '../dialogs/CustomPresetDialog.vue'
import PresetManager from '../dialogs/PresetManager.vue'

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

// 是否单独选中（只选了这一个节点时才显示工具栏和底部面板）
const isSoloSelected = computed(() => {
  return props.selected && getSelectedNodes.value.length <= 1
})

// 本地文本状态
const localText = ref(props.data.text || '')

// 节点状态：'empty' | 'ready' | 'editing'
const nodeState = ref(localText.value ? 'ready' : 'empty')

// 角色提及相关
const characters = ref([])
const showMentionList = ref(false)
const mentionListPosition = ref({ top: 0, left: 0 })
const mentionQuery = ref('')
const activeMentionIndex = ref(0)
const mentionTarget = ref(null) // 'editor' | 'llm'
let mentionRange = null // 用于 contenteditable
let mentionStartPos = 0 // 用于 textarea

// 过滤后的角色
const filteredCharacters = computed(() => {
  const query = mentionQuery.value.toLowerCase()
  // 如果没有输入查询词，显示所有（前10个）
  // 如果输入了查询词，按名称或username过滤
  return characters.value.filter(c => {
    if (!query) return true
    const name = c.name || ''
    const username = c.metadata?.username || ''
    return name.toLowerCase().includes(query) || username.toLowerCase().includes(query)
  }).slice(0, 10)
})

// 标签编辑状态
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data.label || 'Text')

// 加载角色列表
async function loadCharacters() {
  try {
    const result = await getAssets({ type: 'sora-character', pageSize: 100 })
    characters.value = result.assets || []
  } catch (error) {
    console.error('[TextNode] 加载角色失败:', error)
  }
}

// 处理提及输入（ContentEditable）
function handleEditorInput(event) {
  handleInput(event) // 原有逻辑
  
  const selection = window.getSelection()
  if (!selection.rangeCount) return
  
  const range = selection.getRangeAt(0)
  const text = range.startContainer.textContent || ''
  const cursorIndex = range.startOffset
  
  // 查找光标前的 @
  const textBeforeCursor = text.slice(0, cursorIndex)
  const atIndex = textBeforeCursor.lastIndexOf('@')
  
  if (atIndex !== -1) {
    // 检查 @ 前面是否有空格或是否是行首
    const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' '
    if (/\s/.test(charBeforeAt)) {
      const query = textBeforeCursor.slice(atIndex + 1)
      // 如果包含空格，则不认为是提及（除非允许含空格的名字，这里假设名字不含空格或很短）
      if (!/\s/.test(query) && query.length < 20) {
        showMentionList.value = true
        mentionQuery.value = query
        mentionTarget.value = 'editor'
        mentionRange = range.cloneRange()
        mentionRange.setStart(range.startContainer, atIndex)
        mentionRange.setEnd(range.startContainer, cursorIndex)
        
        // 计算位置
        const rect = range.getBoundingClientRect()
        // 获取编辑器容器的位置
        const containerRect = textareaRef.value?.getBoundingClientRect() || { top: 0, left: 0 }
        
        // 相对位置，或者 fixed 位置
        // 这里使用 fixed 定位提到 body
        mentionListPosition.value = {
          top: rect.bottom + 5,
          left: rect.left
        }
        return
      }
    }
  }
  
  showMentionList.value = false
}

// 处理提及输入（Textarea）
function handleLLMInput(event) {
  const el = event.target
  const cursorIndex = el.selectionStart
  const text = el.value
  const textBeforeCursor = text.slice(0, cursorIndex)
  const atIndex = textBeforeCursor.lastIndexOf('@')
  
  if (atIndex !== -1) {
    const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' '
    if (/\s/.test(charBeforeAt)) {
      const query = textBeforeCursor.slice(atIndex + 1)
      if (!/\s/.test(query) && query.length < 20) {
        showMentionList.value = true
        mentionQuery.value = query
        mentionTarget.value = 'llm'
        mentionStartPos = atIndex
        
        // 计算 Textarea 光标位置（简化处理，可能不精确）
        // 对于 textarea，精确获取光标像素位置比较复杂，这里简化为跟随 textarea 底部或固定位置
        // 更好的方式是使用辅助 div 模拟
        const rect = el.getBoundingClientRect()
        mentionListPosition.value = {
          top: rect.bottom + 5,
          left: rect.left + 20 // 简化的左侧偏移
        }
        return
      }
    }
  }
  
  showMentionList.value = false
}

// 选择角色
function selectCharacter(character) {
  const username = character.metadata?.username || character.name || 'unknown'
  const textToInsert = `@${username} ` // 插入 @username 加一个空格
  
  if (mentionTarget.value === 'editor') {
    // ContentEditable 插入
    const selection = window.getSelection()
    if (mentionRange) {
      selection.removeAllRanges()
      selection.addRange(mentionRange)
      document.execCommand('insertText', false, textToInsert)
      // 更新本地状态
      localText.value = textareaRef.value.innerHTML
    }
  } else if (mentionTarget.value === 'llm') {
    // Textarea 插入
    const originalText = llmInputText.value
    const before = originalText.slice(0, mentionStartPos)
    const after = originalText.slice(mentionStartPos + mentionQuery.value.length + 1)
    llmInputText.value = before + textToInsert + after
    
    // 恢复光标位置
    nextTick(() => {
      if (llmInputRef.value) {
        llmInputRef.value.focus()
        const newCursorPos = mentionStartPos + textToInsert.length
        llmInputRef.value.setSelectionRange(newCursorPos, newCursorPos)
      }
    })
  }
  
  showMentionList.value = false
  mentionQuery.value = ''
}

// 编辑模式
const isEditing = ref(false)
const textareaRef = ref(null)

// 选中文字右键菜单
const showSelectionMenu = ref(false)
const selectionMenuPosition = ref({ x: 0, y: 0 })
const selectedText = ref('')

// 节点尺寸 - 文本节点使用宽矩形，适合内容编辑
const nodeWidth = ref(props.data.width || 400)
const nodeHeight = ref(props.data.height || 280)

// 全屏预览模式
const isFullscreen = ref(false)
const originalSize = ref({ width: 400, height: 280 })

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
const showLeftMenu = ref(false) // 左侧快捷操作菜单显示状态
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

// 用户自定义预设
const userPresets = ref([]) // 用户自定义预设列表
const showCustomPresetDialog = ref(false) // 自定义预设对话框
const showPresetManager = ref(false) // 预设管理抽屉
const editingPreset = ref(null) // 正在编辑的预设
const tempCustomPrompt = ref('') // 临时自定义提示词
const presetManagerRef = ref(null) // 预设管理器引用

// 加载用户自定义预设
async function loadUserPresets() {
  try {
    const data = await getUserLLMPresets()
    userPresets.value = data.presets || []
    console.log('[TextNode] 用户自定义预设已加载:', userPresets.value.length)
  } catch (error) {
    console.error('[TextNode] 加载用户预设失败:', error)
  }
}

// 打开自定义预设对话框（新建）
function openCustomPresetDialog() {
  editingPreset.value = null
  showCustomPresetDialog.value = true
}

// 打开自定义预设对话框（编辑）
function editCustomPreset(preset) {
  editingPreset.value = preset
  showCustomPresetDialog.value = true
  showPresetManager.value = false
}

// 提交自定义预设（保存并使用）
async function handlePresetSubmit(data) {
  try {
    if (editingPreset.value) {
      // 更新现有预设
      await updateUserLLMPreset(editingPreset.value.id, data)
      console.log('[TextNode] 预设已更新')
    } else {
      // 创建新预设
      const result = await createUserLLMPreset(data)
      console.log('[TextNode] 预设已创建')

      // 自动选择新创建的预设
      selectedPreset.value = `user-${result.preset.id}`
    }

    // 重新加载预设列表
    await loadUserPresets()

    // 如果预设管理器打开，刷新它
    if (presetManagerRef.value) {
      presetManagerRef.value.loadPresets()
    }

    // 关闭对话框
    showCustomPresetDialog.value = false
  } catch (error) {
    console.error('[TextNode] 保存预设失败:', error)
    alert(error.message || '保存失败，请重试')
  }
}

// 临时使用自定义提示词（不保存）
function handleTempUse(data) {
  tempCustomPrompt.value = data.systemPrompt
  selectedPreset.value = 'temp-custom'
  console.log('[TextNode] 使用临时自定义提示词')
}

// 打开预设管理器
function openPresetManager() {
  showPresetManager.value = true
  showPresetDropdown.value = false
}

// 加载 LLM 配置
async function loadLLMConfig() {
  try {
    // 优先使用租户配置的模型列表（从 brand-config API 加载）
    const tenantModels = getAvailableLLMModels()
    if (tenantModels && tenantModels.length > 0) {
      console.log('[TextNode] 使用租户配置的 LLM 模型:', tenantModels)
      llmConfig.value = {
        ...llmConfig.value,
        enabled: true,
        models: tenantModels
      }
      // 如果当前选中的模型不在租户模型列表中，使用第一个模型
      const modelIds = tenantModels.map(m => m.id)
      if (!modelIds.includes(selectedModel.value)) {
        selectedModel.value = tenantModels[0].id
      }
    }
    
    // 然后尝试从 API 获取完整配置（包含 presets、languages 等）
    const config = await getLLMConfig()
    if (config && config.models && config.models.length > 0) {
      llmConfig.value = config
      if (config.defaultModel) {
        selectedModel.value = config.defaultModel
      }
    } else if (config) {
      // 如果 API 返回了配置但模型为空，保留租户模型，合并其他配置
      llmConfig.value = {
        ...config,
        enabled: true,
        models: llmConfig.value.models // 保留租户模型
      }
    }
  } catch (error) {
    console.error('[TextNode] 加载 LLM 配置失败:', error)
    // 失败时使用租户模型
    const tenantModels = getAvailableLLMModels()
    if (tenantModels && tenantModels.length > 0) {
      llmConfig.value = {
        ...llmConfig.value,
        enabled: true,
        models: tenantModels
      }
    }
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
  const presets = []

  // 1. 添加租户配置的预设
  if (llmConfig.value.presets && llmConfig.value.presets.length > 0) {
    presets.push(...llmConfig.value.presets)
  }

  // 2. 添加分隔线
  if (presets.length > 0 && userPresets.value.length > 0) {
    presets.push({ id: 'divider-1', type: 'divider' })
  }

  // 3. 添加用户自定义预设
  if (userPresets.value.length > 0) {
    presets.push(...userPresets.value.map(p => ({
      id: `user-${p.id}`,
      name: `📝 ${p.name}`,
      type: 'user-custom',
      systemPrompt: p.systemPrompt,
      _rawId: p.id
    })))
  }

  // 4. 添加临时自定义（如果正在使用）
  if (selectedPreset.value === 'temp-custom') {
    if (presets.length > 0) {
      presets.push({ id: 'divider-2', type: 'divider' })
    }
    presets.push({
      id: 'temp-custom',
      name: '📌 临时自定义',
      type: 'temp-custom'
    })
  }

  // 5. 添加操作选项
  if (presets.length > 0) {
    presets.push({ id: 'divider-3', type: 'divider' })
  }
  presets.push({
    id: 'action-new',
    name: '+ 新建自定义预设',
    type: 'action'
  })
  presets.push({
    id: 'action-manage',
    name: '⚙️ 管理我的预设',
    type: 'action'
  })

  return presets
})

// 当前选中预设的名称
const selectedPresetLabel = computed(() => {
  if (!selectedPreset.value) return '通用对话'

  // 检查是否是用户自定义预设
  if (selectedPreset.value.startsWith('user-')) {
    const userPreset = userPresets.value.find(p => `user-${p.id}` === selectedPreset.value)
    if (userPreset) return `📝 ${userPreset.name}`
  }

  // 检查是否是临时自定义
  if (selectedPreset.value === 'temp-custom') {
    return '📌 临时自定义'
  }

  // 查找租户预设
  const preset = llmConfig.value.presets?.find(p => p.id === selectedPreset.value)
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
  // 处理操作类型的选项
  if (presetId === 'action-new') {
    openCustomPresetDialog()
    showPresetDropdown.value = false
    return
  }

  if (presetId === 'action-manage') {
    openPresetManager()
    return
  }

  // 忽略分隔线
  if (presetId.startsWith('divider-')) {
    return
  }

  // 选择预设
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
    
    // 如果有上游图片/视频，处理 URL
    let processedImages = []
    if (inheritedImages.value.length > 0) {
      console.log('[TextNode] 检测到参考媒体，开始处理...', inheritedImages.value)
      
      try {
        // 分离视频 URL 和图片 URL
        const videoUrls = upstreamVideoUrls.value
        const imageOnlyUrls = inheritedImages.value.filter(url => !videoUrls.includes(url))
        
        // 图片走七牛云上传流程
        let uploadedImageUrls = []
        if (imageOnlyUrls.length > 0) {
          uploadedImageUrls = await uploadImagesToQiniu(imageOnlyUrls)
          console.log('[TextNode] 图片上传成功:', uploadedImageUrls)
        }
        
        // 视频也需要上传到云端，确保公网可访问（blob:/内网 URL 会导致 LLM API 报 base64 解码错误）
        let uploadedVideoUrls = []
        if (videoUrls.length > 0) {
          uploadedVideoUrls = await uploadVideosToCloud(videoUrls)
          console.log('[TextNode] 视频上传成功:', uploadedVideoUrls)
        }

        processedImages = [...uploadedVideoUrls, ...uploadedImageUrls]
        
        // 将媒体 URL 添加到用户消息中
        userMessage.images = processedImages
      } catch (uploadError) {
        console.error('[TextNode] 媒体处理失败:', uploadError)
        throw new Error('媒体处理失败，请重试')
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
      // 准备API参数
      const apiParams = {
        messages,
        model: selectedModel.value,
        language: selectedLanguage.value || 'zh',
        images: processedImages.length > 0 ? processedImages : undefined,
        stream: false // 禁用流式输出
      }

      // 处理预设类型
      if (selectedPreset.value === 'temp-custom') {
        // 临时自定义：使用customSystemPrompt
        apiParams.customSystemPrompt = tempCustomPrompt.value
      } else if (selectedPreset.value && selectedPreset.value.startsWith('user-')) {
        // 用户自定义预设：使用userPresetId
        const rawId = selectedPreset.value.replace('user-', '')
        apiParams.userPresetId = rawId
      } else if (selectedPreset.value) {
        // 租户预设：使用preset字段
        apiParams.preset = selectedPreset.value
      }

      const result = await chatWithLLM(apiParams)
      
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

// 上传视频到云端（确保 LLM API 可访问，避免 blob:/内网 URL 导致 base64 解码失败）
async function uploadVideosToCloud(videoUrls) {
  const uploadedUrls = []

  for (const videoUrl of videoUrls) {
    try {
      // 已经是 CDN 公网 URL，直接使用
      if (videoUrl.includes('qiniucdn.com') || videoUrl.includes('clouddn.com') || videoUrl.includes('myqcloud.com') || videoUrl.includes('qbox.me')) {
        uploadedUrls.push(videoUrl)
        continue
      }

      // 其他 https 公网 URL（非内网），直接使用
      if (videoUrl.startsWith('https://') && !videoUrl.includes('localhost') && !videoUrl.includes('127.0.0.1') && !videoUrl.includes('192.168.') && !videoUrl.includes('10.')) {
        uploadedUrls.push(videoUrl)
        continue
      }

      console.log('[TextNode] 视频需要上传到云端:', videoUrl.substring(0, 60))

      // 下载视频数据（支持 blob:、/api/、内网 URL 等）
      const response = await fetch(videoUrl)
      if (!response.ok) throw new Error(`获取视频失败: ${response.status}`)
      const blob = await response.blob()

      // 根据 MIME 类型确定扩展名
      const mimeType = blob.type || 'video/mp4'
      const extMap = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi' }
      const ext = extMap[mimeType] || '.mp4'

      // 通过后端上传接口转存到云端（/api/images/upload 已支持视频文件）
      const formData = new FormData()
      formData.append('images', new File([blob], `video_${Date.now()}${ext}`, { type: mimeType }))

      const token = localStorage.getItem('token')
      const uploadResponse = await fetch(getApiUrl('/api/images/upload'), {
        method: 'POST',
        headers: {
          ...getTenantHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      })

      if (!uploadResponse.ok) throw new Error('视频上传失败')

      const uploadResult = await uploadResponse.json()
      if (uploadResult.urls && uploadResult.urls.length > 0) {
        console.log('[TextNode] 视频上传成功:', uploadResult.urls[0].substring(0, 60))
        uploadedUrls.push(uploadResult.urls[0])
      } else {
        throw new Error('上传返回数据异常')
      }
    } catch (error) {
      console.error('[TextNode] 视频上传失败，尝试直接使用原URL:', error, videoUrl.substring(0, 60))
      uploadedUrls.push(videoUrl)
    }
  }

  return uploadedUrls
}

// 键盘快捷键
function handleLLMKeyDown(event) {
  // 如果提及列表是打开的，处理导航
  if (showMentionList.value) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeMentionIndex.value = Math.max(0, activeMentionIndex.value - 1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeMentionIndex.value = Math.min(filteredCharacters.value.length - 1, activeMentionIndex.value + 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (filteredCharacters.value[activeMentionIndex.value]) {
        selectCharacter(filteredCharacters.value[activeMentionIndex.value])
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      showMentionList.value = false
      return
    }
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleLLMGenerate()
  }
}

// 格式化输入，高亮 username
function formatText(text) {
  if (!text) return ''
  // 将 @username 替换为高亮 span
  // 这里需要注意，username 可能包含下划线、点等，但不包含空格
  return text.replace(/(@[a-zA-Z0-9_\.]+)/g, '<span class="mention-highlight">$1</span>')
}

// 同步本地状态到 store
watch(localText, (newText) => {
  // 移除高亮标签后再保存到 store
  // const cleanText = newText.replace(/<span class="mention-highlight">(@[a-zA-Z0-9_\.]+)<\/span>/g, '$1')
  // contenteditable 的 innerHTML 可能会包含很多样式标签，如果只高亮显示，保存时需要清理
  // 但为了简单，这里我们保存带有 span 的 HTML，只要后端能处理或者前端显示时能正常渲染
  // 如果后端需要纯文本，提取纯文本发送给后端
  canvasStore.updateNodeData(props.id, { text: newText })
})
const nodeClass = computed(() => ({
  'text-node': true,
  'selected': props.selected,
  'editing': isEditing.value,
  'resizing': isResizing.value,
  'fullscreen-mode': isFullscreen.value
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
  if (newSelected) {
    // 当节点被 VueFlow 选中时，同步到 canvasStore（与 ImageNode 保持一致）
    if (canvasStore.selectedNodeId !== props.id) {
      canvasStore.selectNode(props.id)
    }
    // 显示底部配置面板（用于 LLM 对话）
    canvasStore.isBottomPanelVisible = true
  } else {
    // 节点取消选中时，关闭所有下拉菜单
    showModelDropdown.value = false
    showPresetDropdown.value = false
    showLanguageDropdown.value = false
    showLeftMenu.value = false
  }
}, { immediate: true })

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
  { icon: '♪', labelKey: 'canvas.textNode.textToMusic', action: () => createNextNode('audio', t('canvas.textNode.textToMusic')) }
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
  { icon: '¶', titleKey: 'canvas.textNode.autoFormat', action: () => autoFormat() },
  { icon: '⧉', titleKey: 'canvas.textNode.copy', action: () => copyText() },
  { icon: () => isFullscreen.value ? '⛶' : '⛶', titleKey: 'canvas.textNode.fullscreen', action: () => toggleFullscreen(), isFullscreenBtn: true },
  { type: 'divider' },
  { icon: '✂', titleKey: 'canvas.textNode.splitScenes', action: () => splitSceneNodes() }
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
  
  if (isFullscreen.value) {
    // 退出全屏模式 - 恢复原尺寸
    nodeWidth.value = originalSize.value.width
    nodeHeight.value = originalSize.value.height
    isFullscreen.value = false
    
    // 更新节点数据
    canvasStore.updateNodeData(props.id, {
      width: nodeWidth.value,
      height: nodeHeight.value
    })
  } else {
    // 进入全屏模式 - 保存原尺寸
    originalSize.value = {
      width: nodeWidth.value,
      height: nodeHeight.value
    }
    
    // 计算文本内容需要的高度
    const text = props.data.llmResponse || localText.value || props.data.text || ''
    const plainText = extractPlainText(text)
    
    // 估算需要的尺寸
    const charsPerLine = 50 // 假设每行50个字符
    const lineHeight = 24 // 每行高度
    const lines = Math.ceil(plainText.length / charsPerLine)
    const contentHeight = lines * lineHeight
    
    // 计算新尺寸（宽度加大，高度自适应内容）
    const newWidth = Math.max(600, nodeWidth.value * 1.5)
    const newHeight = Math.max(400, Math.min(contentHeight + 150, 800)) // 最小400，最大800
    
    nodeWidth.value = newWidth
    nodeHeight.value = newHeight
    isFullscreen.value = true
    
    // 更新节点数据
    canvasStore.updateNodeData(props.id, {
      width: newWidth,
      height: newHeight
    })
  }
  
  // 触发 Vue Flow 更新节点内部尺寸
  nextTick(() => {
    updateNodeInternals(props.id)
  })
}

// 自动排版功能 - 将密集文本转换为段落形式
function autoFormat() {
  event?.preventDefault()
  
  // 获取当前文本内容
  let text = ''
  if (isEditing.value && textareaRef.value) {
    text = textareaRef.value.innerText || ''
  } else {
    text = props.data.llmResponse || localText.value || ''
  }
  
  if (!text.trim()) return
  
  // 自动排版规则
  let formattedText = text
  
  // 1. 识别分镜格式（如 "分镜1"、"分镜 1"、"镜头1" 等）
  formattedText = formattedText.replace(/([。！？\.\!\?])\s*(分镜\s*\d+|镜头\s*\d+|场景\s*\d+|第\s*\d+\s*[幕镜场])/g, '$1\n\n$2')
  
  // 2. 识别时间标记（如 "0~3秒"、"3-6秒"、"0:00-0:03" 等）
  formattedText = formattedText.replace(/([。！？\.\!\?"])\s*(\d+[~\-～—]\d+秒|\d+:\d+[~\-～—]\d+:\d+)/g, '$1\n\n$2')
  
  // 3. 在每个分镜/时间段开头添加换行（如果前面没有换行）
  formattedText = formattedText.replace(/([^\n])(分镜\s*\d+|镜头\s*\d+|\d+[~\-～—]\d+秒)/g, '$1\n\n$2')
  
  // 4. 识别角色对话格式（如 "（旁白）"、"说："）
  formattedText = formattedText.replace(/([。！？\.\!\?])\s*([（\(][^）\)]+[）\)]\s*[:：])/g, '$1\n\n$2')
  
  // 5. 规范化多余的换行符（超过2个换行变为2个）
  formattedText = formattedText.replace(/\n{3,}/g, '\n\n')
  
  // 6. 去除开头的换行
  formattedText = formattedText.replace(/^\n+/, '')
  
  // 7. 将换行转换为 HTML 换行标签（用于编辑器显示）
  const htmlContent = formattedText
    .split('\n\n')
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => `<p style="margin-bottom: 12px;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
  
  // 如果在编辑模式，直接更新编辑器内容
  if (isEditing.value && textareaRef.value) {
    textareaRef.value.innerHTML = htmlContent
    localText.value = htmlContent
    textareaRef.value.focus()
  } else {
    // 不在编辑模式，进入编辑模式后更新
    handleEdit(() => {
      if (textareaRef.value) {
        textareaRef.value.innerHTML = htmlContent
        localText.value = htmlContent
      }
    })
  }
  
  // 更新节点数据
  canvasStore.updateNodeData(props.id, {
    text: htmlContent,
    llmResponse: htmlContent
  })
  if (isEditing.value) {
    textareaRef.value?.focus()
  }
}

// 打开右键菜单
function handleContextMenu(event) {
  // 如果在编辑模式且右键点击的是编辑器
  if (isEditing.value && textareaRef.value?.contains(event.target)) {
    // 检查是否有选中的文字
    const selection = window.getSelection()
    const selText = selection?.toString()?.trim()
    
    if (selText && selText.length > 0) {
      // 有选中文字，显示自定义选中文字菜单
      event.preventDefault()
      selectedText.value = selText
      selectionMenuPosition.value = { x: event.clientX, y: event.clientY }
      showSelectionMenu.value = true
      
      // 添加点击外部关闭菜单
      setTimeout(() => {
        document.addEventListener('click', closeSelectionMenu)
        document.addEventListener('contextmenu', closeSelectionMenu)
      }, 100)
      return
    }
    
    // 没有选中文字，显示浏览器原生右键菜单（支持复制粘贴）
    return
  }
  
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'text-input', position: { x: 0, y: 0 }, data: props.data }
  )
}

// 关闭选中文字菜单
function closeSelectionMenu() {
  showSelectionMenu.value = false
  document.removeEventListener('click', closeSelectionMenu)
  document.removeEventListener('contextmenu', closeSelectionMenu)
}

// 发送选中文字到文生图
function sendSelectionToImage() {
  if (!selectedText.value) return
  
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 创建文本节点
  const textNodeId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const textNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 400) + 120,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: textNodeId,
    type: 'text-input',
    position: textNodePosition,
    data: {
      label: '文生图提示词',
      text: selectedText.value,
      status: 'idle'
    }
  })
  
  // 创建图像节点
  const imageNodeId = `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const imageNodePosition = {
    x: textNodePosition.x + 450,
    y: textNodePosition.y
  }
  
  canvasStore.addNode({
    id: imageNodeId,
    type: 'image-input',
    position: imageNodePosition,
    data: {
      label: '图像生成',
      status: 'idle'
    }
  })
  
  // 连接：当前节点 -> 文本节点 -> 图像节点
  canvasStore.addEdge({
    source: props.id,
    target: textNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  canvasStore.addEdge({
    source: textNodeId,
    target: imageNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  closeSelectionMenu()
  console.log('[TextNode] 发送到文生图:', selectedText.value.substring(0, 50))
}

// 发送选中文字到文生视频
function sendSelectionToVideo() {
  if (!selectedText.value) return
  
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 创建文本节点
  const textNodeId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const textNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 400) + 120,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: textNodeId,
    type: 'text-input',
    position: textNodePosition,
    data: {
      label: '文生视频提示词',
      text: selectedText.value,
      status: 'idle'
    }
  })
  
  // 创建视频节点
  const videoNodeId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const videoNodePosition = {
    x: textNodePosition.x + 450,
    y: textNodePosition.y
  }
  
  canvasStore.addNode({
    id: videoNodeId,
    type: 'video-input',
    position: videoNodePosition,
    data: {
      label: '视频生成',
      status: 'idle'
    }
  })
  
  // 连接：当前节点 -> 文本节点 -> 视频节点
  canvasStore.addEdge({
    source: props.id,
    target: textNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  canvasStore.addEdge({
    source: textNodeId,
    target: videoNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  closeSelectionMenu()
  console.log('[TextNode] 发送到文生视频:', selectedText.value.substring(0, 50))
}

// ========== 添加按钮交互（单击/长按） ==========
const LONG_PRESS_DURATION = 300 // 长按阈值（毫秒）
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

// 左侧快捷操作菜单显示状态（已移至 watch 之前声明，避免 TDZ 错误）
// const showLeftMenu = ref(false) -- 已移至上方

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
  
  // 计算节点右侧输出端口的画布坐标
  // 使用响应式的节点尺寸（最准确）
  const currentNodeWidth = nodeWidth.value || props.data?.width || 400
  const currentNodeHeight = nodeHeight.value || props.data?.height || 280
  const labelHeight = 28 // 节点标签高度
  const labelMarginBottom = 8 // 标签与卡片之间的间距
  const labelOffset = labelHeight + labelMarginBottom // 标签总偏移（高度 + 间距）
  const handleOffset = 34 // +号按钮中心相对于节点卡片边缘的偏移量
  
  const outputX = currentNode.position.x + currentNodeWidth + handleOffset
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[TextNode] 开始拖拽连线，起始位置:', { 
    outputX, 
    outputY, 
    nodePosition: currentNode.position,
    nodeWidth: currentNodeWidth,
    nodeHeight: currentNodeHeight
  })
  
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

// 拆分分镜节点
function splitSceneNodes() {
  // 优先使用 LLM 响应内容，其次是 localText，最后是 props.data.text
  const rawText = props.data.llmResponse || localText.value || props.data.text || ''
  
  // 提取纯文本，去除 HTML 标签
  const text = extractPlainText(rawText)

  if (!text.trim()) {
    alert('当前节点没有内容，无法拆分')
    return
  }

  console.log('[TextNode] 拆分文本长度:', text.length)
  console.log('[TextNode] 文本前100字符:', text.substring(0, 100))

  // 匹配分镜标记：支持多种格式
  // - 分镜1、分镜 1、分镜1:、分镜1：
  // - **分镜1**、分镜1**
  // - 【分镜1】、[分镜1]
  // - Scene 1、scene1
  const scenePattern = /(?:\*{0,2})(?:【|\[)?分镜\s*(\d+)(?:】|\])?(?:\*{0,2})(?:[：:])?\s*|(?:\*{0,2})(?:【|\[)?[Ss]cene\s*(\d+)(?:】|\])?(?:\*{0,2})(?:[：:])?\s*/g
  
  const sceneMatches = [...text.matchAll(scenePattern)]

  if (sceneMatches.length === 0) {
    // 尝试更宽松的匹配：查找 "分镜" + 数字
    const loosePattern = /分镜\s*(\d+)/g
    const looseMatches = [...text.matchAll(loosePattern)]
    
    if (looseMatches.length === 0) {
      console.warn('[TextNode] 未找到分镜标记（支持格式：分镜1、分镜 1、**分镜1**、【分镜1】、Scene 1 等）')
      return
    }
    
    // 使用宽松匹配结果
    sceneMatches.push(...looseMatches)
  }

  console.log(`[TextNode] 找到 ${sceneMatches.length} 个分镜标记`)
  console.log('[TextNode] 分镜位置:', sceneMatches.map(m => ({ 
    num: m[1] || m[2], 
    index: m.index, 
    match: m[0] 
  })))

  // 提取每个分镜的内容
  const scenes = []
  for (let i = 0; i < sceneMatches.length; i++) {
    const currentMatch = sceneMatches[i]
    const sceneNumber = currentMatch[1] || currentMatch[2] // 支持两种捕获组
    const startIndex = currentMatch.index

    // 计算结束位置（下一个分镜的开始位置，或文本末尾）
    const endIndex = i < sceneMatches.length - 1
      ? sceneMatches[i + 1].index
      : text.length

    // 提取分镜内容（包括标题）
    let sceneContent = text.substring(startIndex, endIndex).trim()

    console.log(`[TextNode] 分镜 ${sceneNumber} 原始内容长度: ${sceneContent.length}`)

    // 检查内容是否有效（至少要有一些实际内容，但降低阈值以支持短分镜）
    if (sceneContent && sceneContent.length >= 5) {
      scenes.push({
        number: sceneNumber,
        content: sceneContent
      })
    } else {
      console.warn(`[TextNode] 分镜 ${sceneNumber} 内容太短，跳过`)
    }
  }

  if (scenes.length === 0) {
    console.warn('[TextNode] 分镜内容为空，无法拆分')
    return
  }

  console.log(`[TextNode] 提取到 ${scenes.length} 个有效分镜`)

  // 获取当前节点信息
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    console.error('[TextNode] 未找到当前节点')
    return
  }

  // 计算新节点的起始位置（在当前节点右侧）
  const startX = currentNode.position.x + (nodeWidth.value || 400) + 120
  const startY = currentNode.position.y
  
  // 动态计算垂直间距：根据内容长度估算节点高度
  // 基础高度 + 每100字符增加一定高度
  const calculateNodeHeight = (content) => {
    const baseHeight = 180 // 基础高度（标题栏 + 边距）
    const charsPerLine = 40 // 假设每行约40个字符
    const lineHeight = 20 // 每行高度
    const lines = Math.ceil(content.length / charsPerLine)
    return Math.min(baseHeight + lines * lineHeight, 500) // 最大高度限制
  }

  // 批量创建分镜节点
  let currentY = startY
  const createdNodeIds = []
  
  scenes.forEach((scene, index) => {
    const newNodeId = `scene_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`
    const newNodePosition = {
      x: startX,
      y: currentY
    }

    console.log(`[TextNode] 准备创建分镜 ${scene.number}，位置: (${startX}, ${currentY})`)

    // 创建新文本节点 - 直接传递完整内容
    canvasStore.addNode({
      id: newNodeId,
      type: 'text-input',  // 使用正确的节点类型
      position: newNodePosition,
      data: {
        label: `分镜${scene.number}`,
        text: scene.content,
        status: 'idle'
      }
    })

    createdNodeIds.push(newNodeId)
    console.log(`[TextNode] 已创建分镜节点 ${scene.number}: ${newNodeId}`)

    // 更新下一个节点的 Y 位置
    currentY += calculateNodeHeight(scene.content) + 30 // 30px 间隙
  })

  // 可选：从原节点连接到第一个分镜节点
  if (createdNodeIds.length > 0) {
    canvasStore.addEdge({
      source: props.id,
      target: createdNodeIds[0],
      sourceHandle: 'output',
      targetHandle: 'input'
    })
  }

  // 完成提示（仅在控制台输出，不弹窗打扰用户）
  console.log(`[TextNode] 所有分镜节点创建完成，共 ${scenes.length} 个`)
}

// 点击节点时的处理 - 主动同步选中状态到 canvasStore
// 因为节点内部子元素可能通过 @click.stop 阻止冒泡，导致 VueFlow 的 onNodeClick 不触发
function handleNodeClick(e) {
  // 如果点击的是编辑器区域，不阻止事件，让编辑器正常工作
  if (isEditing.value && textareaRef.value?.contains(e.target)) {
    return
  }
  // 主动同步选中状态（与 ImageNode 保持一致）
  canvasStore.selectNode(props.id)
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

// 组件挂载时加载 LLM 配置和用户预设
onMounted(() => {
  loadLLMConfig()
  loadUserPresets()
})
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
    
    <!-- 格式工具栏（单独选中节点时显示） -->
    <div v-show="isSoloSelected" class="format-toolbar" @mousedown.stop @click.stop>
      <template v-for="(btn, index) in formatButtons" :key="index">
        <div v-if="btn.type === 'divider'" class="toolbar-divider"></div>
        <button 
          v-else
          class="toolbar-btn"
          :class="{ 
            active: formatState[btn.format],
            'fullscreen-active': btn.isFullscreenBtn && isFullscreen
          }"
          :style="btn.style"
          :title="btn.isFullscreenBtn ? (isFullscreen ? '退出全屏' : t(btn.titleKey)) : t(btn.titleKey)"
          @mousedown.prevent="btn.action"
        >
          {{ btn.isFullscreenBtn ? (isFullscreen ? '⛶' : '⛶') : btn.icon }}
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
          @wheel.stop
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
          <div v-else-if="props.data.llmResponse" class="text-node-llm-response" :class="{ 'is-streaming': isGenerating || props.data.status === 'processing' }" @wheel.stop>
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
            @wheel.stop
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
    
    <!-- 选中文字右键菜单 -->
    <Teleport to="body">
      <div 
        v-if="showSelectionMenu"
        class="selection-context-menu"
        :style="{ 
          left: selectionMenuPosition.x + 'px', 
          top: selectionMenuPosition.y + 'px' 
        }"
        @click.stop
      >
        <div class="selection-menu-title">发送选中文字到</div>
        <div class="selection-menu-item" @click="sendSelectionToImage">
          <span class="menu-icon">🖼️</span>
          <span class="menu-label">文生图</span>
          <span class="menu-desc">创建图像生成节点</span>
        </div>
        <div class="selection-menu-item" @click="sendSelectionToVideo">
          <span class="menu-icon">🎬</span>
          <span class="menu-label">文生视频</span>
          <span class="menu-desc">创建视频生成节点</span>
        </div>
        <div class="selection-menu-divider"></div>
        <div class="selection-menu-preview">
          <div class="preview-label">选中内容：</div>
          <div class="preview-text">{{ selectedText.length > 100 ? selectedText.substring(0, 100) + '...' : selectedText }}</div>
        </div>
      </div>
    </Teleport>
    
    <!-- 底部 LLM 配置面板 - 紧贴节点卡片 -->
    <div v-show="isSoloSelected" class="llm-config-panel" @click.stop @mousedown.stop>
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
            <!-- 左上角序号徽章，保持与图片/视频节点缩略图一致 -->
            <span class="reference-index-badge">{{ idx + 1 }}</span>
            <!-- 右下角播放图标 -->
            <div class="video-badge">▶</div>
          </div>
          <!-- 图片缩略图 -->
          <div 
            v-for="(img, idx) in upstreamImageUrls.slice(0, 4 - Math.min(upstreamVideoUrls.length, 4))" 
            :key="'img-' + idx" 
            class="reference-image-item"
          >
            <img :src="img" :alt="`参考图 ${idx + 1}`" />
            <span class="reference-index-badge">{{ idx + 1 }}</span>
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
            <div v-if="showModelDropdown" class="model-dropdown" :class="{ 'dropdown-up': modelDropdownUp, 'dropdown-down': !modelDropdownUp }" @click.stop @wheel.stop>
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
            <div v-if="showPresetDropdown" class="preset-dropdown" :class="{ 'dropdown-up': presetDropdownUp, 'dropdown-down': !presetDropdownUp }" @click.stop @wheel.stop>
              <div 
                class="preset-option"
                :class="{ active: !selectedPreset }"
                @click.stop="selectPreset('')"
              >
                <span class="preset-option-name">通用对话</span>
              </div>
              <template v-for="preset in availablePresets" :key="preset.id">
                <!-- 分隔线 -->
                <div v-if="preset.type === 'divider'" class="preset-divider"></div>

                <!-- 普通预设选项 -->
                <div
                  v-else
                  class="preset-option"
                  :class="{
                    active: selectedPreset === preset.id,
                    'preset-action': preset.type === 'action'
                  }"
                  @click.stop="selectPreset(preset.id)"
                >
                  <span class="preset-option-name">{{ preset.name }}</span>
                </div>
              </template>
            </div>
          </div>
          
          <!-- 语言选择器 -->
          <div ref="languageSelectorRef" class="language-selector" @click="toggleLanguageDropdown">
            <span class="language-name">{{ selectedLanguageLabel }}</span>
            <span class="dropdown-arrow">▾</span>
            
            <!-- 语言下拉菜单 -->
            <div v-if="showLanguageDropdown" class="language-dropdown" :class="{ 'dropdown-up': languageDropdownUp, 'dropdown-down': !languageDropdownUp }" @click.stop @wheel.stop>
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

  <!-- 自定义预设对话框 -->
  <CustomPresetDialog
    :isOpen="showCustomPresetDialog"
    :preset="editingPreset"
    @close="showCustomPresetDialog = false"
    @submit="handlePresetSubmit"
    @temp-use="handleTempUse"
  />

  <!-- 预设管理器 -->
  <PresetManager
    ref="presetManagerRef"
    :isOpen="showPresetManager"
    @close="showPresetManager = false"
    @create="openCustomPresetDialog"
    @edit="editCustomPreset"
    @refresh="loadUserPresets"
  />
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

/* 编辑器滚动条样式 - 黑夜模式 */
.editor-content {
  scrollbar-width: thin;
  scrollbar-color: #555555 transparent;
}

.editor-content::-webkit-scrollbar {
  width: 8px;
}

.editor-content::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.editor-content::-webkit-scrollbar-thumb {
  background: #555555;
  border-radius: 4px;
}

.editor-content::-webkit-scrollbar-thumb:hover {
  background: #666666;
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
  /* 滚动条样式 - 黑夜模式 */
  scrollbar-width: thin;
  scrollbar-color: #555555 transparent;
}

.text-node-display::-webkit-scrollbar {
  width: 8px;
}

.text-node-display::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.text-node-display::-webkit-scrollbar-thumb {
  background: #555555;
  border-radius: 4px;
}

.text-node-display::-webkit-scrollbar-thumb:hover {
  background: #666666;
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
  /* 滚动条样式 - 黑夜模式 */
  scrollbar-width: thin;
  scrollbar-color: #555555 transparent;
}

.llm-response-content::-webkit-scrollbar {
  width: 8px;
}

.llm-response-content::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.llm-response-content::-webkit-scrollbar-thumb {
  background: #555555;
  border-radius: 4px;
}

.llm-response-content::-webkit-scrollbar-thumb:hover {
  background: #666666;
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

/* 参考缩略图左上角序号徽章（文本节点） */
.reference-index-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  text-align: left;
  pointer-events: none;
  z-index: 2;
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
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: auto;
}

.preset-selector:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
}

.preset-name {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  font-weight: 400;
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
  /* 自定义滚动条 - 黑夜模式 */
  scrollbar-width: thin;
  scrollbar-color: #333333 transparent;
}

/* 预设下拉菜单滚动条 - Webkit浏览器（Chrome/Safari/Edge） */
.preset-dropdown::-webkit-scrollbar {
  width: 6px;
}

.preset-dropdown::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.preset-dropdown::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}

.preset-dropdown::-webkit-scrollbar-thumb:hover {
  background: #444444;
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

/* 预设分隔线 */
.preset-divider {
  height: 1px;
  background: var(--canvas-border, rgba(255, 255, 255, 0.1));
  margin: 6px 0;
}

/* 预设操作选项（新建、管理） */
.preset-action {
  color: var(--canvas-text-secondary, #a0a0a0);
}

.preset-action:hover {
  color: var(--canvas-text-primary, #ffffff);
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
}

.preset-action.active {
  background: transparent;
}

/* 语言选择器 */
.language-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: auto;
}

.language-selector:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
}

.language-name {
  color: var(--canvas-text-secondary, #a0a0a0);
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
  /* 自定义滚动条 - 黑夜模式 */
  scrollbar-width: thin;
  scrollbar-color: #333333 transparent;
}

/* 语言下拉菜单滚动条 - Webkit浏览器 */
.language-dropdown::-webkit-scrollbar {
  width: 6px;
}

.language-dropdown::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.language-dropdown::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}

.language-dropdown::-webkit-scrollbar-thumb:hover {
  background: #444444;
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

/* 模型选择器 - 扁平化设计 */
.model-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-selector:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
}

.model-icon {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 11px;
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
  max-height: 320px;
  overflow-y: auto;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 200;
  /* 自定义滚动条 - 黑夜模式 */
  scrollbar-width: thin;
  scrollbar-color: #333333 transparent;
}

/* 模型下拉菜单滚动条 - Webkit浏览器 */
.model-dropdown::-webkit-scrollbar {
  width: 6px;
}

.model-dropdown::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.model-dropdown::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}

.model-dropdown::-webkit-scrollbar-thumb:hover {
  background: #444444;
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
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  cursor: pointer;
  transition: all 0.2s;
}

.generate-count:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
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

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   TextNode 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .text-node .node-content {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .text-node .text-area {
  color: #1c1917;
}

:root.canvas-theme-light .text-node .text-area::placeholder {
  color: #a8a29e;
}

:root.canvas-theme-light .text-node .model-selector {
  background: transparent;
}

:root.canvas-theme-light .text-node .model-selector:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .text-node .model-name {
  color: #1c1917;
}

:root.canvas-theme-light .text-node .model-desc {
  color: #78716c;
}

:root.canvas-theme-light .text-node .model-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  /* 白昼模式滚动条 */
  scrollbar-color: #cccccc transparent;
}

:root.canvas-theme-light .text-node .model-dropdown::-webkit-scrollbar-thumb {
  background: #cccccc;
}

:root.canvas-theme-light .text-node .model-dropdown::-webkit-scrollbar-thumb:hover {
  background: #aaaaaa;
}

:root.canvas-theme-light .text-node .model-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .text-node .model-option.active {
  background: rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .text-node .option-name {
  color: #1c1917;
}

:root.canvas-theme-light .text-node .option-desc {
  color: #78716c;
}

:root.canvas-theme-light .text-node .status-text {
  color: #57534e;
}

:root.canvas-theme-light .text-node .result-text {
  color: #1c1917;
}

:root.canvas-theme-light .text-node .copy-btn {
  color: #78716c;
}

:root.canvas-theme-light .text-node .copy-btn:hover {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .text-node .generate-btn:disabled {
  background: rgba(0, 0, 0, 0.1);
}

/* 积分显示 - 白昼模式 */
:root.canvas-theme-light .text-node .points-cost-display {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.2);
}

/* 批次显示 - 白昼模式 */
:root.canvas-theme-light .text-node .generate-count {
  color: #57534e;
}

/* 快捷操作 - 白昼模式 */
:root.canvas-theme-light .text-node .quick-action {
  color: #57534e;
}

:root.canvas-theme-light .text-node .quick-action:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .text-node .quick-actions-title {
  color: #f59e0b;
}

/* 配置面板 - 白昼模式 */
:root.canvas-theme-light .text-node .config-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .text-node .prompt-input {
  color: #1c1917;
}

:root.canvas-theme-light .text-node .prompt-input::placeholder {
  color: #a8a29e;
}

/* 选择器 - 白昼模式 */
:root.canvas-theme-light .text-node .preset-selector,
:root.canvas-theme-light .text-node .language-selector {
  background: transparent;
}

:root.canvas-theme-light .text-node .preset-selector:hover,
:root.canvas-theme-light .text-node .language-selector:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .text-node .preset-name,
:root.canvas-theme-light .text-node .language-name {
  color: #57534e;
}

:root.canvas-theme-light .text-node .dropdown-arrow {
  color: #78716c;
}

/* 下拉菜单 - 白昼模式 */
:root.canvas-theme-light .text-node .preset-dropdown,
:root.canvas-theme-light .text-node .language-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  /* 白昼模式滚动条 */
  scrollbar-color: #cccccc transparent;
}

:root.canvas-theme-light .text-node .preset-dropdown::-webkit-scrollbar-thumb,
:root.canvas-theme-light .text-node .language-dropdown::-webkit-scrollbar-thumb {
  background: #cccccc;
}

:root.canvas-theme-light .text-node .preset-dropdown::-webkit-scrollbar-thumb:hover,
:root.canvas-theme-light .text-node .language-dropdown::-webkit-scrollbar-thumb:hover {
  background: #aaaaaa;
}

:root.canvas-theme-light .text-node .preset-option,
:root.canvas-theme-light .text-node .language-option {
  color: #57534e;
}

:root.canvas-theme-light .text-node .preset-option:hover,
:root.canvas-theme-light .text-node .language-option:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .text-node .preset-option.active,
:root.canvas-theme-light .text-node .language-option.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

/* 文本节点工具栏 - 白昼模式 */
:root.canvas-theme-light .text-node .format-toolbar {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .text-node .toolbar-btn {
  color: #57534e;
}

:root.canvas-theme-light .text-node .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .text-node .toolbar-btn.active {
  background: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .text-node .toolbar-divider {
  background: rgba(0, 0, 0, 0.12);
}

/* 批次选择器 - 白昼模式 */
:root.canvas-theme-light .text-node .generate-count {
  color: #57534e;
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .text-node .generate-count:hover {
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

/* ========== 选中文字右键菜单 ========== */
.selection-context-menu {
  position: fixed;
  z-index: 10000;
  background: rgba(20, 20, 20, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 8px;
  min-width: 240px;
  max-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
}

.selection-menu-title {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 500;
  padding: 6px 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;
}

.selection-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.selection-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.selection-menu-item .menu-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.selection-menu-item .menu-label {
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  flex-shrink: 0;
}

.selection-menu-item .menu-desc {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  margin-left: auto;
}

.selection-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 0;
}

.selection-menu-preview {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-top: 4px;
}

.selection-menu-preview .preview-label {
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  margin-bottom: 4px;
}

.selection-menu-preview .preview-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
}

/* 选中文字菜单 - 白昼模式 */
:root.canvas-theme-light .selection-context-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .selection-menu-title {
  color: rgba(0, 0, 0, 0.5);
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .selection-menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .selection-menu-item .menu-label {
  color: #1c1917;
}

:root.canvas-theme-light .selection-menu-item .menu-desc {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .selection-menu-divider {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .selection-menu-preview {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .selection-menu-preview .preview-label {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .selection-menu-preview .preview-text {
  color: rgba(0, 0, 0, 0.8);
}

/* ========== 全屏预览模式 ========== */
.text-node.fullscreen-mode .text-node-card {
  min-height: 400px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
}

/* 全屏模式下内容区域保持滚动但扩大显示区域 */
.text-node.fullscreen-mode .editor-content,
.text-node.fullscreen-mode .text-node-display,
.text-node.fullscreen-mode .llm-response-content {
  overflow-y: auto !important;
  max-height: none !important;
}

/* 全屏按钮激活状态 */
.toolbar-btn.fullscreen-active {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #3b82f6 !important;
  border-radius: 4px;
}

/* 全屏模式下节点边框高亮 */
.text-node.fullscreen-mode.selected .text-node-card {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2), 0 8px 40px rgba(0, 0, 0, 0.4);
}

/* 白昼模式 - 全屏 */
:root.canvas-theme-light .text-node.fullscreen-mode .text-node-card {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .text-node.fullscreen-mode.selected .text-node-card {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.15), 0 8px 40px rgba(0, 0, 0, 0.15);
}

/* 白昼模式 - 内容区域文字颜色和滚动条 */
:root.canvas-theme-light .text-node .editor-content,
:root.canvas-theme-light .text-node .text-node-display,
:root.canvas-theme-light .text-node .llm-response-content {
  color: #1c1917;
  scrollbar-color: #c0c0c0 transparent;
}

/* 白昼模式 - 编辑器占位符颜色 */
:root.canvas-theme-light .text-node .editor-content:empty:before {
  color: #a8a29e;
}

:root.canvas-theme-light .text-node .editor-content::-webkit-scrollbar-thumb,
:root.canvas-theme-light .text-node .text-node-display::-webkit-scrollbar-thumb,
:root.canvas-theme-light .text-node .llm-response-content::-webkit-scrollbar-thumb {
  background: #c0c0c0;
}

:root.canvas-theme-light .text-node .editor-content::-webkit-scrollbar-thumb:hover,
:root.canvas-theme-light .text-node .text-node-display::-webkit-scrollbar-thumb:hover,
:root.canvas-theme-light .text-node .llm-response-content::-webkit-scrollbar-thumb:hover {
  background: #a0a0a0;
}
</style>
