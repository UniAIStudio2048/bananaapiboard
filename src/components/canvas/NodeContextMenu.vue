<script setup>
/**
 * NodeContextMenu.vue - 节点右键菜单
 * 支持所有节点类型的"加入我的资产"功能
 */
import { ref, computed, nextTick } from 'vue'
import { useI18n } from '@/i18n'
import { useCanvasStore } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import { getDownstreamOptions, NODE_TYPES } from '@/config/canvas/nodeTypes'
import { getTenantHeaders, getApiUrl, isSeedanceFeaturesEnabled } from '@/config/tenant'
import { saveAsset } from '@/api/canvas/assets'
import { uploadImages } from '@/api/canvas/nodes'
import { createAssetGroup, listAssetGroups, createAsset as createVolcAsset, pollAssetStatus } from '@/api/canvas/volcengine-assets'

const { t } = useI18n()
const teamStore = useTeamStore()

const props = defineProps({
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  node: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'send-to-assistant'])
const canvasStore = useCanvasStore()

// 加入资产的加载状态
const isAddingAsset = ref(false)

// ========== 节点类型判断 ==========

// 判断节点类型
const nodeType = computed(() => props.node?.type || '')

// 判断是否是视频节点且有输出或上传内容
const isVideoNodeWithOutput = computed(() => {
  if (!props.node) return false
  const type = nodeType.value
  // 所有视频相关的节点类型
  const videoTypes = [
    'video', 'video-input', 'video-gen',
    'text-to-video', 'image-to-video', 'audio-to-video',
    'video-last-frame'
  ]
  const isVideoType = videoTypes.includes(type)
  // 检查输出或上传的视频
  const hasOutput = props.node.data?.output?.url || 
                    props.node.data?.videoUrl ||
                    props.node.data?.sourceVideo // 用户上传的视频
  return isVideoType && hasOutput
})

// 判断是否是图片节点且有输出或上传内容
const isImageNodeWithOutput = computed(() => {
  if (!props.node) return false
  const type = nodeType.value
  // 所有图片相关的节点类型
  const imageTypes = [
    'image', 'image-input', 'image-gen', 
    'text-to-image', 'image-to-image',
    'image-repaint', 'image-erase', 'image-upscale', 'image-cutout', 'image-expand',
    'preview', 'preview-output'
  ]
  const isImageType = imageTypes.includes(type)
  // 检查生成的输出
  const hasGeneratedOutput = props.node.data?.output?.url || 
                    props.node.data?.output?.urls?.length > 0 ||
                    props.node.data?.imageUrl || 
                    props.node.data?.generatedImage ||
                    props.node.data?.url
  // 检查用户上传的图片（sourceImages 是用户上传的图片数组）
  const hasUploadedImages = props.node.data?.sourceImages?.length > 0
  return isImageType && (hasGeneratedOutput || hasUploadedImages)
})

// 判断是否是文本节点且有内容
const isTextNodeWithContent = computed(() => {
  if (!props.node) return false
  const type = nodeType.value
  const isTextType = type === 'text' || type === 'text-input' || type === 'llm'
  // TextNode 使用 data.text，LLMNode 使用 data.output.content
  const hasContent = props.node.data?.text || 
                     props.node.data?.output?.content ||
                     props.node.data?.content ||
                     props.node.data?.llmResponse
  return isTextType && hasContent
})

// 判断是否是音频节点且有输出或上传内容
const isAudioNodeWithOutput = computed(() => {
  if (!props.node) return false
  const type = nodeType.value
  // 所有音频相关的节点类型
  const audioTypes = [
    'audio', 'audio-input',
    'text-to-audio', 'tts', 'audio-to-text', 'audio-lip-sync'
  ]
  const isAudioType = audioTypes.includes(type)
  // 检查输出或用户上传的音频
  const hasOutput = props.node.data?.output?.url || 
                    props.node.data?.audioUrl ||
                    props.node.data?.sourceAudio // 用户上传的音频
  return isAudioType && hasOutput
})

// 判断是否可以加入资产
const canAddToAssets = computed(() => {
  return isVideoNodeWithOutput.value || 
         isImageNodeWithOutput.value || 
         isTextNodeWithContent.value || 
         isAudioNodeWithOutput.value
})

// 获取资产类型
const assetType = computed(() => {
  if (isVideoNodeWithOutput.value) return 'video'
  if (isImageNodeWithOutput.value) return 'image'
  if (isTextNodeWithContent.value) return 'text'
  if (isAudioNodeWithOutput.value) return 'audio'
  return null
})

// 获取资产类型标签
const assetTypeLabel = computed(() => {
  const labelKeys = {
    'video': 'canvas.contextMenu.videoActions',
    'image': 'canvas.contextMenu.imageActions',
    'text': 'canvas.contextMenu.textActions',
    'audio': 'canvas.contextMenu.audioActions'
  }
  const key = labelKeys[assetType.value] || 'canvas.contextMenu.contentActions'
  return t(key)
})

// 获取资产类型名称（用于保存时显示）
const assetTypeName = computed(() => {
  const names = {
    'video': t('canvas.nodes.video'),
    'image': t('canvas.nodes.image'),
    'text': t('canvas.nodes.text'),
    'audio': t('canvas.nodes.audio')
  }
  return names[assetType.value] || t('canvas.nodes.text')
})

// ========== 获取节点内容 ==========

// 获取视频URL
const videoUrl = computed(() => {
  const data = props.node?.data
  if (!data) return ''
  
  // 优先使用输出的视频URL
  if (data.output?.url) {
    const url = data.output.url
    if (url.startsWith('/api/')) return url
    const match = url.match(/\/api\/images\/file\/[a-zA-Z0-9-]+/)
    if (match) return match[0]
    return url
  }
  
  // 其次使用用户上传的视频
  return data.videoUrl || data.sourceVideo || ''
})

// 获取图片URL（如果有多张图片，取第一张）
const imageUrl = computed(() => {
  const data = props.node?.data
  if (!data) return ''
  // 优先使用 output.url，其次 output.urls[0]
  if (data.output?.url) return data.output.url
  if (data.output?.urls?.length > 0) return data.output.urls[0]
  // 支持用户上传的图片（sourceImages 是用户上传的图片数组）
  if (data.sourceImages?.length > 0) return data.sourceImages[0]
  return data.imageUrl || data.generatedImage || data.url || ''
})

// 获取文本内容
const textContent = computed(() => {
  const data = props.node?.data
  if (!data) return ''
  // TextNode 使用 data.text，LLMNode 使用 data.output.content
  return data.text || data.output?.content || data.content || data.llmResponse || ''
})

// 获取音频URL
const audioUrl = computed(() => {
  const data = props.node?.data
  if (!data) return ''
  // 支持输出和用户上传的音频
  return data.output?.url || data.audioUrl || data.sourceAudio || ''
})

// 获取资产URL或内容
const assetUrlOrContent = computed(() => {
  if (isVideoNodeWithOutput.value) return videoUrl.value
  if (isImageNodeWithOutput.value) return imageUrl.value
  if (isTextNodeWithContent.value) return textContent.value
  if (isAudioNodeWithOutput.value) return audioUrl.value
  return ''
})

// 全屏预览状态
const isFullscreenPreview = ref(false)
const fullscreenVideoUrl = ref('')

// 可连接的下游节点类型
const downstreamOptions = computed(() => {
  if (!props.node) return []
  return getDownstreamOptions(props.node.type)
})

// 菜单位置样式
const menuStyle = computed(() => {
  let x = props.position.x
  let y = props.position.y
  
  const menuWidth = 200
  const menuHeight = 450
  
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 20
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 20
  }
  
  return {
    left: `${x}px`,
    top: `${y}px`
  }
})

// ========== 节点操作 ==========

// 从当前节点创建下游节点
function createDownstreamNode(type) {
  if (!props.node) return
  
  const position = {
    x: props.node.position.x + 300,
    y: props.node.position.y
  }
  
  // 如果是图片描述或视频描述，创建反推节点，再连接到文本节点
  if (type === NODE_TYPES.LLM_IMAGE_DESCRIBE || type === NODE_TYPES.LLM_VIDEO_DESCRIBE || 
      type === 'llm-image-describe' || type === 'llm-video-describe') {
    // 1. 创建反推节点（图片反推或视频反推）
    const describeNode = canvasStore.addNode({
      type,
      position,
      data: {}
    })
    
    // 2. 将当前节点（图片/视频）连接到反推节点
    canvasStore.addEdge({
      source: props.node.id,
      target: describeNode.id
    })
    
    // 3. 创建文本节点，放在反推节点右侧
    const textNode = canvasStore.addNode({
      type: 'text-input',
      position: {
        x: position.x + 300,
        y: position.y
      },
      data: {}
    })
    
    // 4. 将反推节点连接到文本节点（反推结果输出到文本）
    canvasStore.addEdge({
      source: describeNode.id,
      target: textNode.id
    })
    
    emit('close')
    return
  }
  
  const newNode = canvasStore.addNode({
    type,
    position,
    data: {}
  })
  
  canvasStore.addEdge({
    source: props.node.id,
    target: newNode.id
  })
  
  emit('close')
}

// 复制节点
function copyNode() {
  if (props.node) {
    // 先选中当前节点
    canvasStore.selectNode(props.node.id)
    // 复制选中的节点
    canvasStore.copySelectedNodes()
  }
  emit('close')
}

// 粘贴节点
function pasteNode() {
  // 在当前节点右侧粘贴
  const position = {
    x: props.node.position.x + 300,
    y: props.node.position.y
  }
  canvasStore.pasteNodes(position)
  emit('close')
}

// 删除节点
function deleteNode() {
  if (props.node) {
    canvasStore.removeNode(props.node.id)
  }
  emit('close')
}

// ========== 视频节点特有功能 ==========

// 全屏预览视频
function fullscreenPreview() {
  if (!videoUrl.value) return
  fullscreenVideoUrl.value = videoUrl.value
  isFullscreenPreview.value = true
}

// 关闭全屏预览
function closeFullscreenPreview() {
  isFullscreenPreview.value = false
  fullscreenVideoUrl.value = ''
  emit('close')
}

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function downloadVideo() {
  if (!videoUrl.value) return
  
  const filename = `video_${Date.now()}.mp4`
  
  try {
    const { smartDownload } = await import('@/api/client')
    await smartDownload(videoUrl.value, filename)
  } catch (error) {
    console.error('下载视频失败:', error)
  }
  emit('close')
}

// ========== 图片节点功能 ==========

// 将 dataUrl 转换为 Blob 对象
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const base64 = parts[1]
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mime })
}

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function downloadImage() {
  if (!imageUrl.value) return
  
  const filename = `image_${Date.now()}.png`
  
  try {
    const url = imageUrl.value
    
    // dataUrl 直接在前端转换下载
    if (url.startsWith('data:')) {
      console.log('[NodeContextMenu] dataUrl 格式图片，使用前端直接下载')
      const blob = dataUrlToBlob(url)
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
      emit('close')
      return
    }
    
    // 统一使用 smartDownload（fetch+blob，自动修正扩展名，解决跨域）
    const { smartDownload } = await import('@/api/client')
    await smartDownload(url, filename)
  } catch (error) {
    console.error('下载图片失败:', error)
  }
  emit('close')
}

// ========== 通用资产功能 ==========

// 判断 URL 是否需要上传到云端（本地路径、blob、base64、相对路径等）
function needsUploadToCloud(url) {
  if (!url || typeof url !== 'string') return false
  // 已经是七牛云或其他 CDN 的不需要上传
  if (url.includes('files.nananobanana.cn') || 
      url.includes('qiniucdn.com') || 
      url.includes('clouddn.com')) return false
  // blob URL 需要上传
  if (url.startsWith('blob:')) return true
  // base64 数据 URL 需要上传
  if (url.startsWith('data:')) return true
  // 本地 API 路径需要上传
  if (url.startsWith('/api/images/file/') || url.startsWith('/storage/')) return true
  // localhost 路径需要上传
  if (url.includes('localhost') && url.includes('/api/')) return true
  return false
}

// 将本地 URL 上传到云端获取永久 URL
async function uploadToCloudForAsset(url, type = 'image') {
  console.log('[NodeContextMenu] 上传到云端:', url?.substring(0, 60))
  
  try {
    let blob
    
    // 处理 base64 数据 URL
    if (url.startsWith('data:')) {
      console.log('[NodeContextMenu] 处理 base64 数据 URL')
      const response = await fetch(url)
      blob = await response.blob()
    } 
    // 处理 blob URL
    else if (url.startsWith('blob:')) {
      console.log('[NodeContextMenu] 处理 blob URL')
      const response = await fetch(url)
      blob = await response.blob()
    }
    // 处理其他 URL（API 路径等）
    else {
      let fetchUrl = url
      // 相对路径转完整 URL
      if (url.startsWith('/api/') || url.startsWith('/storage/')) {
        fetchUrl = getApiUrl(url)
      }
      
      console.log('[NodeContextMenu] 获取文件:', fetchUrl?.substring(0, 80))
      
      // 获取文件内容
      const response = await fetch(fetchUrl, {
        headers: getTenantHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`获取文件失败: ${response.status}`)
      }
      
      blob = await response.blob()
    }
    
    const ext = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'png'
    const mimeType = blob.type || (type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mp3' : 'image/png')
    const file = new File([blob], `asset_${Date.now()}.${ext}`, { type: mimeType })
    
    console.log('[NodeContextMenu] 上传文件:', file.name, '大小:', (file.size / 1024).toFixed(2), 'KB')
    
    // 上传到服务器（服务器会自动上传到七牛云）
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      console.log('[NodeContextMenu] 上传成功，云端 URL:', urls[0])
      return urls[0]
    }
    
    throw new Error('上传返回空 URL')
  } catch (error) {
    console.error('[NodeContextMenu] 上传到云端失败:', error)
    throw error
  }
}

// 加入我的资产（通用方法，支持所有类型）
async function addToMyAssets() {
  if (!canAddToAssets.value || isAddingAsset.value) return

  const type = assetType.value
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

  // 获取当前空间参数
  const spaceParams = teamStore.getSpaceParams('current')
  
  // 构建资产数据
  const assetData = {
    type,
    name: `${assetTypeName.value}_${timeStr}`,
    source_node_id: props.node?.id,
    source: 'canvas',
    tags: [assetTypeName.value, t('canvas.contextMenu.canvasGenerated')],
    // 空间参数
    spaceType: spaceParams.spaceType,
    teamId: spaceParams.teamId
  }

  // 获取需要保存的内容
  let contentUrl = ''
  if (type === 'text') {
    assetData.content = textContent.value
    // 使用内容前30个字符作为名称
    const shortContent = textContent.value.slice(0, 30).replace(/\n/g, ' ')
    assetData.name = shortContent + (textContent.value.length > 30 ? '...' : '')
  } else if (type === 'image') {
    contentUrl = imageUrl.value
  } else if (type === 'video') {
    contentUrl = videoUrl.value
  } else if (type === 'audio') {
    contentUrl = audioUrl.value
  }

  // 判断是否需要异步上传
  const needsUpload = contentUrl && needsUploadToCloud(contentUrl)

  if (needsUpload) {
    // 异步上传模式：立即显示提示并关闭菜单，后台执行上传
    isAddingAsset.value = true
    showToast('开始添加到资产库...', 'info')
    emit('close')

    // 后台异步执行上传和保存
    performAsyncUploadAndSave(assetData, contentUrl, type)
      .then(() => {
        showToast(`${assetTypeName.value}已成功加入资产库`, 'success')
      })
      .catch((error) => {
        console.error('加入资产失败:', error)
        showToast('添加失败：' + (error.message || '未知错误'), 'error')
      })
      .finally(() => {
        isAddingAsset.value = false
      })
  } else {
    // 同步模式：直接保存(文本内容或已有云端URL)
    isAddingAsset.value = true

    try {
      if (contentUrl) {
        assetData.url = contentUrl
      }

      const result = await saveAsset(assetData)

      if (result && result.id) {
        showToast(`${assetTypeName.value}已加入我的资产`, 'success')
      } else {
        throw new Error(result?.error || '保存失败')
      }
    } catch (error) {
      console.error('加入资产失败:', error)
      showToast('保存失败：' + (error.message || '未知错误'), 'error')
    } finally {
      isAddingAsset.value = false
      emit('close')
    }
  }
}

// 异步上传并保存资产
async function performAsyncUploadAndSave(assetData, contentUrl, type) {
  try {
    // 上传到云端
    console.log(`[NodeContextMenu] 异步上传${type}到云端...`)
    const cloudUrl = await uploadToCloudForAsset(contentUrl, type)

    // 更新资产数据
    assetData.url = cloudUrl

    // 保存到数据库
    const result = await saveAsset(assetData)

    if (!result || !result.id) {
      throw new Error(result?.error || '保存失败')
    }

    console.log(`[NodeContextMenu] ${type}资产保存成功:`, result.id)
  } catch (error) {
    console.error(`[NodeContextMenu] 异步上传${type}失败:`, error)
    throw error
  }
}

// 发送到灵感助手
function sendToAssistant() {
  const type = assetType.value
  if (!type || type === 'text') return // 仅支持图片/视频/音频

  const url = type === 'image' ? imageUrl.value
            : type === 'video' ? videoUrl.value
            : audioUrl.value

  if (!url) return

  emit('send-to-assistant', { url, type })
  emit('close')
}

// 是否可以发送到灵感助手（图片/视频/音频有内容时）
const canSendToAssistant = computed(() => {
  return isImageNodeWithOutput.value || isVideoNodeWithOutput.value || isAudioNodeWithOutput.value
})

const seedanceFeaturesEnabled = computed(() => isSeedanceFeaturesEnabled())

// ========== Seedance 2.0 角色创建 ==========

const showSeedanceDialog = ref(false)
const seedanceGroups = ref([])
const seedanceGroupsLoading = ref(false)
const showNewGroupInput = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref(null)
const characterName = ref('')
const characterNameRef = ref(null)

async function openSeedanceDialog() {
  if (!isImageNodeWithOutput.value) return
  showSeedanceDialog.value = true
  seedanceGroupsLoading.value = true
  characterName.value = ''
  
  await nextTick()
  characterNameRef.value?.focus()
  
  try {
    // 直接从后端获取当前用户拥有的分组（后端已做租户+用户级隔离）
    const result = await listAssetGroups({ pageSize: 100 })
    seedanceGroups.value = result.groups || []
    if (seedanceGroups.value.length === 0) {
      showNewGroupInput.value = true
    }
  } catch (error) {
    console.error('[Seedance] 获取角色组失败:', error)
    seedanceGroups.value = []
    showNewGroupInput.value = true
  } finally {
    seedanceGroupsLoading.value = false
  }
}

function closeSeedanceDialog() {
  showSeedanceDialog.value = false
  showNewGroupInput.value = false
  newGroupName.value = ''
  characterName.value = ''
  seedanceGroups.value = []
  emit('close')
}

function toggleNewGroupInput() {
  showNewGroupInput.value = !showNewGroupInput.value
  if (showNewGroupInput.value) {
    nextTick(() => newGroupInputRef.value?.focus())
  }
}

async function createNewGroupAndAsset() {
  const groupNameVal = newGroupName.value.trim()
  if (!groupNameVal) return
  
  const charName = characterName.value.trim()
  if (!charName) {
    showToast('请输入角色名称', 'error')
    characterNameRef.value?.focus()
    return
  }
  
  const url = imageUrl.value
  if (!url) {
    showToast('未找到图片', 'error')
    return
  }

  try {
    const groupResult = await createAssetGroup({ Name: groupNameVal })
    const groupId = groupResult.group?.Id || groupResult.Id
    if (!groupId) throw new Error('创建分组返回数据异常')
    
    closeSeedanceDialog()
    showToast('已提交 Seedance 角色创建，后台处理中...', 'info')
    createSeedanceCharacterAsync(groupId, url, charName)
  } catch (error) {
    console.error('[Seedance] 创建分组失败:', error)
    showToast('创建分组失败：' + (error.message || '未知错误'), 'error')
  }
}

function selectGroupAndCreate(groupId) {
  const charName = characterName.value.trim()
  if (!charName) {
    showToast('请输入角色名称', 'error')
    characterNameRef.value?.focus()
    return
  }
  
  const url = imageUrl.value
  if (!url) {
    showToast('未找到图片', 'error')
    return
  }

  closeSeedanceDialog()
  showToast('已提交 Seedance 角色创建，后台处理中...', 'info')
  createSeedanceCharacterAsync(groupId, url, charName)
}

async function createSeedanceCharacterAsync(groupId, rawUrl, name) {
  const sourceNode = props.node
  const sourcePosition = sourceNode ? { ...sourceNode.position } : null

  try {
    let url = rawUrl
    if (needsUploadToCloud(url)) {
      url = await uploadToCloudForAsset(url, 'image')
    }
    
    const assetResult = await createVolcAsset({
      GroupId: groupId,
      URL: url,
      AssetType: 'Image',
      Name: name
    })
    
    const assetId = assetResult.asset?.Id || assetResult.Id
    if (!assetId) throw new Error('创建角色资产返回数据异常')
    
    const spaceParams = teamStore.getSpaceParams('current')
    let canvasAssetId = null
    try {
      const saved = await saveAsset({
        type: 'seedance-character',
        name: name,
        url: `asset://${assetId}`,
        thumbnail_url: url,
        metadata: {
          assetId,
          groupId,
          status: 'Processing',
          assetType: 'Image'
        },
        spaceType: spaceParams.spaceType,
        teamId: spaceParams.teamId
      })
      canvasAssetId = saved.asset?.id || saved.id
    } catch (e) {
      console.error('[Seedance] 保存到本地资产库失败:', e)
    }
    
    const { promise } = pollAssetStatus(assetId, {
      interval: 3000,
      timeout: 120000
    })
    
    const finalAsset = await promise
    
    if (canvasAssetId) {
      try {
        const { updateAsset: updateLocalAsset } = await import('@/api/canvas/assets')
        await updateLocalAsset(canvasAssetId, {
          metadata: {
            assetId: finalAsset.Id || assetId,
            groupId: finalAsset.GroupId || groupId,
            status: finalAsset.Status || 'Active',
            assetType: finalAsset.AssetType || 'Image',
            projectName: finalAsset.ProjectName,
            createTime: finalAsset.CreateTime,
            updateTime: finalAsset.UpdateTime
          }
        })
      } catch (e) {
        console.error('[Seedance] 更新本地资产状态失败:', e)
      }
    }
    
    showToast('Seedance 角色创建成功！', 'success')

    if (finalAsset.Status === 'Active') {
      const newPosition = sourcePosition
        ? { x: sourcePosition.x, y: sourcePosition.y + 350 }
        : { x: 100, y: 100 }

      canvasStore.addNode({
        type: 'seedance-character',
        position: newPosition,
        data: {
          title: finalAsset.Name || name || 'Seedance角色',
          assetId: finalAsset.Id || assetId,
          assetUri: `asset://${finalAsset.Id || assetId}`,
          assetUrl: finalAsset.URL || url,
          groupId: finalAsset.GroupId || groupId,
          assetName: finalAsset.Name || name,
          status: 'Active',
          assetType: finalAsset.AssetType || 'Image',
          width: 220,
          output: {
            type: 'image',
            url: finalAsset.URL || url
          }
        }
      })
    }
  } catch (error) {
    console.error('[Seedance] 后台创建角色失败:', error)
    const msg = error.message?.includes('超时') 
      ? '角色处理超时，请稍后在角色库查看' 
      : '角色创建失败：' + (error.message || '未知错误')
    showToast(msg, error.message?.includes('超时') ? 'info' : 'error')
  }
}

// 简单的Toast提示
function showToast(message, type = 'info') {
  const toast = document.createElement('div')
  toast.className = `asset-toast asset-toast-${type}`
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-text">${message}</span>
  `
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: ${type === 'success' ? 'rgba(34, 197, 94, 0.95)' : type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(59, 130, 246, 0.95)'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 10001;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    animation: toastIn 0.3s ease;
  `
  
  // 添加动画样式
  const style = document.createElement('style')
  style.textContent = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes toastOut {
      from { opacity: 1; transform: translateX(-50%) translateY(0); }
      to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
  `
  document.head.appendChild(style)
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards'
    setTimeout(() => {
      toast.remove()
      style.remove()
    }, 300)
  }, 2500)
}

// 阻止点击冒泡
function handleMenuClick(event) {
  event.stopPropagation()
}
</script>

<template>
  <div 
    v-show="!showSeedanceDialog"
    class="canvas-context-menu" 
    :style="menuStyle"
    @click="handleMenuClick"
  >
    <!-- 资产操作（所有可保存类型通用） -->
    <template v-if="canAddToAssets">
      <div class="canvas-context-menu-title">{{ assetTypeLabel }}</div>
      
      <!-- 视频特有选项 -->
      <template v-if="isVideoNodeWithOutput">
        <div class="canvas-context-menu-item" @click="fullscreenPreview">
          <span class="icon">⊙</span>
          {{ $t('canvas.contextMenu.fullscreenPreview') }}
        </div>
        <div class="canvas-context-menu-item" @click="downloadVideo">
          <span class="icon">↓</span>
          {{ $t('canvas.contextMenu.downloadVideo') }}
        </div>
      </template>
      
      <!-- 图片特有选项 -->
      <template v-if="isImageNodeWithOutput">
        <div class="canvas-context-menu-item" @click="downloadImage">
          <span class="icon">↓</span>
          {{ $t('canvas.contextMenu.downloadImage') }}
        </div>
      </template>
      
      <!-- 通用的加入资产选项 -->
      <div 
        class="canvas-context-menu-item asset-item"
        :class="{ loading: isAddingAsset }"
        @click="addToMyAssets"
      >
        <span class="icon">{{ isAddingAsset ? '◌' : '▣' }}</span>
        <span v-if="isAddingAsset">{{ $t('canvas.contextMenu.saving') }}</span>
        <span v-else>{{ $t('canvas.contextMenu.addToAssets') }}</span>
        <span class="permanent-badge">{{ $t('canvas.contextMenu.permanent') }}</span>
      </div>
      
      <!-- 发送到灵感助手 -->
      <div 
        v-if="canSendToAssistant"
        class="canvas-context-menu-item"
        @click="sendToAssistant"
      >
        <span class="icon">✦</span>
        {{ $t('canvas.contextMenu.sendToAssistant') }}
      </div>
      
      <!-- 创建 Seedance 2.0 角色 -->
      <div 
        v-if="isImageNodeWithOutput && seedanceFeaturesEnabled"
        class="canvas-context-menu-item seedance-item"
        @click="openSeedanceDialog"
      >
        <span class="icon">👥</span>
        创建 Seedance 2.0 角色
      </div>
      
      <div class="canvas-context-menu-divider"></div>
    </template>
    
    <!-- 引用该节点生成 -->
    <template v-if="downstreamOptions.length > 0">
      <div class="canvas-context-menu-title">{{ $t('canvas.referenceGenerate') }}</div>
      <div 
        v-for="option in downstreamOptions.slice(0, 4)" 
        :key="option.type"
        class="canvas-context-menu-item"
        @click="createDownstreamNode(option.type)"
      >
        <span class="icon">{{ option.icon }}</span>
        {{ $t(option.label) }}
      </div>
      <div class="canvas-context-menu-divider"></div>
    </template>
    
    <!-- 节点操作 -->
    <div class="canvas-context-menu-item" @click="copyNode">
      <span class="icon">⧉</span>
      {{ $t('canvas.contextMenu.copyNode') }}
    </div>
    <div
      class="canvas-context-menu-item"
      :class="{ disabled: !canvasStore.hasClipboard }"
      @click="canvasStore.hasClipboard && pasteNode()"
    >
      <span class="icon">📋</span>
      {{ $t('canvas.contextMenu.pasteNode') }}
    </div>
    <div class="canvas-context-menu-item delete-item" @click="deleteNode">
      <span class="icon">⌫</span>
      {{ $t('canvas.contextMenu.deleteNode') }}
    </div>
  </div>
  
  <!-- 全屏预览模态框 -->
  <Teleport to="body">
    <div v-if="isFullscreenPreview" class="fullscreen-preview-overlay" @click="closeFullscreenPreview">
      <div class="fullscreen-preview-container" @click.stop>
        <video 
          :src="fullscreenVideoUrl" 
          controls 
          autoplay
          class="fullscreen-video"
        ></video>
        <button class="fullscreen-close-btn" @click="closeFullscreenPreview">
          ✕
        </button>
      </div>
    </div>
  </Teleport>
  
  <!-- Seedance 角色创建弹窗 -->
  <Teleport to="body">
    <div v-if="showSeedanceDialog" class="seedance-dialog-overlay" @click="closeSeedanceDialog">
      <div class="seedance-dialog" @click.stop>
        <div class="seedance-dialog-header">
          <span class="seedance-dialog-title">创建 Seedance 2.0 角色</span>
          <button class="seedance-dialog-close" @click="closeSeedanceDialog">✕</button>
        </div>
        
        <div class="seedance-dialog-body">
          <!-- 角色名称输入 -->
          <div class="seedance-name-section">
            <div class="seedance-section-label">角色名称 <span class="seedance-required">*</span></div>
            <input
              ref="characterNameRef"
              v-model="characterName"
              type="text"
              class="seedance-input seedance-name-input"
              placeholder="输入角色名称"
            />
          </div>
          
          <div class="seedance-divider"></div>
          
          <!-- 加载中 -->
          <div v-if="seedanceGroupsLoading" class="seedance-loading">
            <span class="seedance-spinner"></span>
            <span>加载角色分组...</span>
          </div>
          
          <template v-else>
            <!-- 有分组时显示列表 -->
            <div v-if="seedanceGroups.length > 0" class="seedance-groups">
              <div class="seedance-section-label">选择角色分组</div>
              <div 
                v-for="group in seedanceGroups" 
                :key="group.Id"
                class="seedance-group-item"
                :class="{ 'seedance-group-disabled': !characterName.trim() }"
                @click="selectGroupAndCreate(group.Id)"
              >
                <span class="seedance-group-icon">📁</span>
                <span class="seedance-group-name">{{ group.Name }}</span>
                <span class="seedance-group-arrow">→</span>
              </div>
              
              <div class="seedance-divider"></div>
            </div>
            
            <!-- 创建新分组 -->
            <div class="seedance-new-group">
              <div 
                v-if="!showNewGroupInput && seedanceGroups.length > 0"
                class="seedance-group-item seedance-create-btn"
                @click="toggleNewGroupInput"
              >
                <span class="seedance-group-icon">＋</span>
                <span class="seedance-group-name">创建新分组</span>
              </div>
              
              <div v-if="showNewGroupInput" class="seedance-new-group-form">
                <div class="seedance-section-label">
                  {{ seedanceGroups.length === 0 ? '暂无分组，请先创建' : '新分组名称' }}
                </div>
                <div class="seedance-input-row">
                  <input
                    ref="newGroupInputRef"
                    v-model="newGroupName"
                    type="text"
                    class="seedance-input"
                    placeholder="输入分组名称"
                    @keyup.enter="createNewGroupAndAsset"
                  />
                  <button 
                    class="seedance-confirm-btn"
                    :disabled="!newGroupName.trim() || !characterName.trim()"
                    @click="createNewGroupAndAsset"
                  >
                    创建并添加
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 右键菜单样式已在 canvas.css 中定义 */

/* 资产相关样式 */
.asset-item {
  position: relative;
}

.asset-item.loading {
  opacity: 0.7;
  pointer-events: none;
}

.permanent-badge {
  margin-left: auto;
  padding: 2px 6px;
  font-size: 10px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #000;
  border-radius: 4px;
  font-weight: 600;
}

.delete-item:hover {
  background: rgba(239, 68, 68, 0.2) !important;
  color: #f87171;
}

.canvas-context-menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* 全屏预览模态框 */
.fullscreen-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(8px);
}

.fullscreen-preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.fullscreen-video {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.fullscreen-close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.fullscreen-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

/* Seedance 菜单项样式 */
.seedance-item {
  color: #f59e0b !important;
}
.seedance-item:hover {
  background: rgba(245, 158, 11, 0.15) !important;
}

/* Seedance 弹窗样式 */
.seedance-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  backdrop-filter: blur(4px);
}

.seedance-dialog {
  width: 420px;
  max-height: 520px;
  background: var(--canvas-bg-elevated, #1e1e2e);
  border: 1px solid var(--canvas-border-default, rgba(255, 255, 255, 0.1));
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  animation: seedanceDialogIn 0.25s ease;
}

@keyframes seedanceDialogIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.seedance-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--canvas-border-default, rgba(255, 255, 255, 0.08));
}

.seedance-dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--canvas-text-primary, #f5f5f5);
}

.seedance-dialog-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
  border: none;
  border-radius: 6px;
  color: var(--canvas-text-tertiary, #999);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.seedance-dialog-close:hover {
  background: var(--canvas-bg-secondary, rgba(255, 255, 255, 0.12));
  color: var(--canvas-text-primary, #fff);
}

.seedance-dialog-body {
  padding: 16px 20px;
  max-height: 420px;
  overflow-y: auto;
}

.seedance-name-section {
  margin-bottom: 4px;
}

.seedance-name-input {
  width: 100%;
  box-sizing: border-box;
}

.seedance-required {
  color: #ef4444;
  font-weight: 600;
}

.seedance-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 30px 0;
  color: var(--canvas-text-tertiary, #aaa);
  font-size: 14px;
}

.seedance-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(245, 158, 11, 0.3);
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: seedanceSpin 0.8s linear infinite;
}

@keyframes seedanceSpin {
  to { transform: rotate(360deg); }
}

.seedance-section-label {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #888);
  margin-bottom: 8px;
  font-weight: 500;
}

.seedance-groups {
  margin-bottom: 4px;
}

.seedance-group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--canvas-text-primary, #ddd);
  font-size: 14px;
}

.seedance-group-item:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.08));
}

.seedance-group-item.seedance-group-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.seedance-group-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.seedance-group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seedance-group-arrow {
  color: var(--canvas-text-tertiary, #666);
  font-size: 14px;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.seedance-group-item:not(.seedance-group-disabled):hover .seedance-group-arrow {
  transform: translateX(3px);
  color: #f59e0b;
}

.seedance-create-btn {
  color: #f59e0b;
}

.seedance-create-btn:hover {
  background: rgba(245, 158, 11, 0.1);
}

.seedance-divider {
  height: 1px;
  background: var(--canvas-border-default, rgba(255, 255, 255, 0.06));
  margin: 8px 0;
}

.seedance-new-group-form {
  padding: 4px 0;
}

.seedance-input-row {
  display: flex;
  gap: 8px;
}

.seedance-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--canvas-bg-secondary, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--canvas-border-default, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  color: var(--canvas-text-primary, #eee);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.seedance-input:focus {
  border-color: #f59e0b;
}

.seedance-input::placeholder {
  color: var(--canvas-text-tertiary, #666);
}

.seedance-confirm-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: none;
  border-radius: 8px;
  color: #000;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.seedance-confirm-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  transform: translateY(-1px);
}

.seedance-confirm-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ========== Seedance 白昼模式适配 ========== */
:root.canvas-theme-light .seedance-dialog-overlay {
  background: rgba(0, 0, 0, 0.35);
}

:root.canvas-theme-light .seedance-dialog {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .seedance-group-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .seedance-create-btn:hover {
  background: rgba(245, 158, 11, 0.08);
}
</style>
