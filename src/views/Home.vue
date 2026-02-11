<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { generateImage, buildDownloadUrl, uploadImages, getMe, redeemVoucher, isQiniuCdnUrl, getQiniuThumbnailUrl, downloadWithAuth } from '@/api/client'
import ImageAnnotator from '@/components/ImageAnnotator.vue'
import MentionDropdown from '@/components/MentionDropdown.vue'
import PromptInputWithTags from '@/components/PromptInputWithTags.vue'
import CachedImage from '@/components/CachedImage.vue'
import { labelToPromptText, indexToLabel } from '@/utils/imageAnnotation'
import { getTenantHeaders, getModelDisplayName, getAvailableImageModels } from '@/config/tenant'
import { shouldHistoryDrawerOpenByDefault } from '@/utils/deviceDetection'
import VirtualList from 'vue3-virtual-scroll-list'

const prompt = ref('')
const model = ref('') // 默认为空，会在 onMounted 中设置为模型列表第一个
const aspectRatio = ref('auto') // 默认使用 Auto
const imageSize = ref('4K') // 图生图默认尺寸改为 4K
const loading = ref(false)
const error = ref('')
const items = ref([])
const history = ref([])
const mode = ref('text') // 默认文生图模式
const imageFiles = ref([])
const isDragging = ref(false)
const previewUrls = ref([])
const showImageModal = ref(false)
const currentImage = ref(null)
const currentImageIndex = ref(0)
const me = ref(null)
const pollingInterval = ref(null)
// 根据设备类型设置历史记录抽屉默认状态：手机默认收起，平板和电脑默认展开
const isHistoryDrawerOpen = ref(shouldHistoryDrawerOpenByDefault())
const isViewingHistory = ref(false) // 是否在查看历史记录
const isViewingReference = ref(false) // 是否在查看参考图片
const unreadCount = ref(0) // 未读消息数
const lastHistoryLength = ref(0) // 上次历史记录数量
const layoutMode = ref('comfortable') // 布局模式：comfortable(舒适), widescreen(宽屏), vertical(竖屏)

// 路由
const router = useRouter()

// 图片标注相关
const imageAnnotatorRef = ref(null)
const markers = ref([]) // 当前图片的标记
const allImageMarkers = ref({}) // 所有图片的标记 { imageIndex: [markers] }
const annotatedImageBlobs = ref({}) // 所有标注后的图片 { imageIndex: blob }
const currentAnnotationImageIndex = ref(0) // 当前正在标注的图片索引
const promptInputRef = ref(null)
const promptInputWithTagsRef = ref(null)
const showMentionDropdown = ref(false)
const mentionDropdownPosition = ref({ x: 0, y: 0 })
const mentionTriggerIndex = ref(-1)

// 积分扣除规则配置（从租户配置动态获取）
const pointsCostConfig = computed(() => {
  const models = getAvailableImageModels()
  const config = {}
  for (const m of models) {
    config[m.value] = m.pointsCost || 1
  }
  return config
})

// 获取模型积分消耗（用于下拉列表显示）
function getModelPointsCost(modelKey) {
  const config = pointsCostConfig.value[modelKey]
  if (typeof config === 'object') {
    // 对于有多档积分的模型，显示范围
    const values = Object.values(config)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return min === max ? min : `${min}-${max}`
  }
  return config || 1
}

// 图片缩放和拖动相关
const imageScale = ref(1) // 图片缩放比例
const imageTranslate = ref({ x: 0, y: 0 }) // 图片位置偏移
const isDraggingImage = ref(false) // 是否正在拖动图片
const dragStart = ref({ x: 0, y: 0 }) // 拖动起始位置

// 兑换券相关
const showVoucherModal = ref(false)
const voucherCode = ref('')
const voucherLoading = ref(false)
const voucherError = ref('')
const voucherSuccess = ref('')
const externalLinkConfig = ref({
  enabled: false,
  button_text: '获取兑换券',
  url: '',
  open_in_new_tab: true
})

// 监听图生图模式切换，自动设置默认模型和尺寸
watch(mode, (newMode) => {
  // 模式切换时，如果当前模型不在新模式的可用列表中，则切换到第一个可用模型
  const models = availableModels.value
  const currentModelInList = models.find(m => m.value === model.value)
  if (!currentModelInList && models.length > 0) {
    model.value = models[0].value
    console.log(`[mode-switch] 模式切换到${newMode}，模型已重置为:`, model.value)
    
    // 如果是按分辨率计费的模型，设置默认尺寸
    const modelInfo = models[0]
    if (modelInfo.pointsCost && typeof modelInfo.pointsCost === 'object') {
      const firstSize = Object.keys(modelInfo.pointsCost)[0]?.toUpperCase() || '1K'
      imageSize.value = firstSize
    }
  }
})

// 监听模型切换，自动重置尺寸为新模型的默认值
watch(model, (newModel) => {
  const modelInfo = getAvailableImageModels().find(m => m.value === newModel)
  const pointsCost = modelInfo?.pointsCost
  
  if (pointsCost && typeof pointsCost === 'object') {
    // 模型有多档积分，设置为第一个尺寸
    const firstSize = Object.keys(pointsCost)[0]?.toUpperCase() || '1K'
    imageSize.value = firstSize
    console.log('[model-switch] 模型切换，已设置尺寸:', firstSize)
  }
})

// 图片压缩函数：长边超过maxSize则压缩
async function compressImage(file, maxSize = 3072) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      
      const { width, height } = img
      const longSide = Math.max(width, height)
      
      // 如果长边没超过maxSize，不压缩
      if (longSide <= maxSize) {
        console.log(`[compress] ${file.name} 尺寸 ${width}x${height}，无需压缩`)
        resolve(file)
        return
      }
      
      // 计算缩放比例
      const scale = maxSize / longSide
      const newWidth = Math.round(width * scale)
      const newHeight = Math.round(height * scale)
      
      console.log(`[compress] ${file.name} 压缩: ${width}x${height} -> ${newWidth}x${newHeight}`)
      
      // 使用Canvas压缩
      const canvas = document.createElement('canvas')
      canvas.width = newWidth
      canvas.height = newHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, newWidth, newHeight)
      
      // 转为Blob
      canvas.toBlob((blob) => {
        if (blob) {
          // 创建新的File对象，保留原文件名
          const compressedFile = new File([blob], file.name, { 
            type: 'image/jpeg',
            lastModified: Date.now()
          })
          console.log(`[compress] ${file.name} 大小: ${Math.round(file.size/1024)}KB -> ${Math.round(blob.size/1024)}KB`)
          resolve(compressedFile)
        } else {
          resolve(file) // 压缩失败，返回原文件
        }
      }, 'image/jpeg', 0.92) // 92%质量
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // 加载失败，返回原文件
    }
    
    img.src = url
  })
}

// 文件处理
async function handleFiles(files) {
  const MAX_FILE_SIZE = 30 * 1024 * 1024 // 30MB
  const MAX_FILES = 9
  const MAX_DIMENSION = 3072 // 长边最大尺寸
  
  // 过滤图片文件
  let fileArray = Array.from(files).filter(f => f.type.startsWith('image/'))
  
  // 检查文件大小
  const invalidFiles = fileArray.filter(f => f.size > MAX_FILE_SIZE)
  if (invalidFiles.length > 0) {
    error.value = `部分图片超过30MB限制，已自动过滤 (${invalidFiles.length}张)`
    setTimeout(() => { error.value = '' }, 3000)
    fileArray = fileArray.filter(f => f.size <= MAX_FILE_SIZE)
  }
  
  // 限制最多9张
  const currentCount = imageFiles.value.length
  const remainingSlots = MAX_FILES - currentCount
  
  if (fileArray.length > remainingSlots) {
    error.value = `最多只能上传${MAX_FILES}张图片，已选取前${remainingSlots}张`
    setTimeout(() => { error.value = '' }, 3000)
    fileArray = fileArray.slice(0, remainingSlots)
  }
  
  // 自动压缩：长边超过3072像素的图片
  const compressedFiles = await Promise.all(
    fileArray.map(file => compressImage(file, MAX_DIMENSION))
  )
  
  // 添加新文件
  imageFiles.value = [...imageFiles.value, ...compressedFiles]
  previewUrls.value = [...previewUrls.value, ...compressedFiles.map(file => URL.createObjectURL(file))]
}

function onFilesChange(e) {
  handleFiles(e.target.files || [])
  // 清空input值，允许重复选择同一文件
  e.target.value = ''
}

function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e) {
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  handleFiles(e.dataTransfer.files)
}

function removeImage(index) {
  URL.revokeObjectURL(previewUrls.value[index])
  imageFiles.value.splice(index, 1)
  previewUrls.value.splice(index, 1)
}

function clearImages() {
  previewUrls.value.forEach(url => URL.revokeObjectURL(url))
  imageFiles.value = []
  previewUrls.value = []
  // 清空所有标注
  markers.value = []
  allImageMarkers.value = {}
  annotatedImageBlobs.value = {}
  currentAnnotationImageIndex.value = 0
  if (imageAnnotatorRef.value) {
    imageAnnotatorRef.value.clearMarkers()
  }
}

// 标注相关函数
function onMarkersUpdate(newMarkers) {
  console.log('[onMarkersUpdate] 收到标记更新，数量:', newMarkers.length)
  
  // 计算当前图片之前的所有标记数量（用于全局编号偏移）
  let offsetCount = 0
  for (let i = 0; i < currentAnnotationImageIndex.value; i++) {
    offsetCount += (allImageMarkers.value[i] || []).length
  }
  
  // 重新分配全局连续编号
  const updatedMarkers = newMarkers.map((marker, index) => {
    const globalIndex = offsetCount + index
    return {
      ...marker,
      label: indexToLabel(globalIndex) // 使用全局索引
    }
  })
  
  console.log('[onMarkersUpdate] 更新后的标记:', updatedMarkers)
  
  markers.value = updatedMarkers
  // 保存当前图片的标记
  allImageMarkers.value[currentAnnotationImageIndex.value] = [...updatedMarkers]
  
  console.log('[onMarkersUpdate] 保存到 allImageMarkers[', currentAnnotationImageIndex.value, ']:', updatedMarkers.length, '个')
  
  // 更新后续图片的标记编号
  updateSubsequentMarkersLabels()
}

// 更新后续图片的标记编号
function updateSubsequentMarkersLabels() {
  let globalIndex = 0
  
  // 重新计算所有图片的标记编号
  for (let i = 0; i < imageFiles.value.length; i++) {
    const imageMarkers = allImageMarkers.value[i] || []
    const updatedMarkers = imageMarkers.map(marker => ({
      ...marker,
      label: indexToLabel(globalIndex++)
    }))
    
    if (updatedMarkers.length > 0) {
      allImageMarkers.value[i] = updatedMarkers
      
      // 如果是当前图片，同步更新
      if (i === currentAnnotationImageIndex.value) {
        markers.value = [...updatedMarkers]
      }
    }
  }
  
  // 通知标注组件更新显示
  if (imageAnnotatorRef.value && markers.value.length > 0) {
    nextTick(() => {
      imageAnnotatorRef.value.setMarkers(markers.value)
    })
  }
}

function onAnnotatedImage(blob) {
  // 保存当前图片的标注结果
  annotatedImageBlobs.value[currentAnnotationImageIndex.value] = blob
}

// 切换标注图片
function switchAnnotationImage(index) {
  if (index < 0 || index >= imageFiles.value.length) return
  if (index === currentAnnotationImageIndex.value) return
  
  console.log('[switchAnnotationImage] 切换到图片', index)
  
  // 保存当前图片的标记
  if (markers.value.length > 0) {
    allImageMarkers.value[currentAnnotationImageIndex.value] = [...markers.value]
    console.log('[switchAnnotationImage] 保存当前图片标记:', markers.value.length, '个')
  }
  
  // 切换到新图片
  currentAnnotationImageIndex.value = index
  
  // 加载新图片的标记
  const savedMarkers = allImageMarkers.value[index] || []
  console.log('[switchAnnotationImage] 加载新图片标记:', savedMarkers.length, '个', savedMarkers)
  markers.value = [...savedMarkers]
  
  // 等待图片加载完成后设置标记
  nextTick(() => {
    if (imageAnnotatorRef.value) {
      if (savedMarkers.length > 0) {
        console.log('[switchAnnotationImage] 设置标记到组件')
        // 延迟一下确保图片已加载
        setTimeout(() => {
          imageAnnotatorRef.value.setMarkers(savedMarkers)
        }, 100)
      } else {
        console.log('[switchAnnotationImage] 清空标记')
        imageAnnotatorRef.value.clearMarkers()
      }
    }
  })
}

// 获取所有图片的标记总数
const totalMarkersCount = computed(() => {
  return Object.values(allImageMarkers.value).reduce((sum, markers) => sum + markers.length, 0)
})

// 获取全局标记总数（用于计算下一个标记编号）
const globalMarkerCount = computed(() => {
  return Object.values(allImageMarkers.value).reduce((sum, markers) => sum + markers.length, 0)
})

// 获取所有标记（用于 @ 提及）- 使用全局连续编号
const allMarkers = computed(() => {
  const result = []
  let globalIndex = 0
  
  // 按图片顺序遍历
  for (let i = 0; i < imageFiles.value.length; i++) {
    const markers = allImageMarkers.value[i] || []
    markers.forEach(marker => {
      result.push({
        ...marker,
        imageIndex: i,
        globalLabel: marker.label, // 使用全局编号
        displayLabel: `图${i + 1}-${marker.label}`
      })
      globalIndex++
    })
  }
  
  return result
})

// 提示词 @ 提及功能
function onPromptInput(e) {
  const text = prompt.value
  
  // 查找最后一个 @ 符号
  const lastAtIndex = text.lastIndexOf('@')
  
  if (lastAtIndex !== -1) {
    // 检查 @ 后面是否只有字母或为空
    const textAfterAt = text.substring(lastAtIndex + 1)
    if (/^[A-Z]*$/.test(textAfterAt)) {
      // 显示下拉菜单（使用所有图片的标记）
      mentionTriggerIndex.value = lastAtIndex
      showMentionDropdown.value = allMarkers.value.length > 0
      
      // 计算下拉菜单位置
      if (showMentionDropdown.value) {
        nextTick(() => {
          const inputElement = promptInputWithTagsRef.value?.$el?.querySelector('.prompt-input') || promptInputRef.value
          if (inputElement) {
            const rect = inputElement.getBoundingClientRect()
            mentionDropdownPosition.value = {
              x: rect.left,
              y: rect.bottom + 5
            }
          }
        })
      }
      return
    }
  }
  
  // 隐藏下拉菜单
  showMentionDropdown.value = false
}

// 处理 @ 提及触发
function onMentionTrigger(e) {
  onPromptInput(e)
}

function onMentionSelect(option) {
  const labelText = option.displayLabel ? `${option.displayLabel}位置` : labelToPromptText(option.label)
  
  // 使用标签输入组件时
  if (promptInputWithTagsRef.value) {
    // 如果有 @ 触发，替换 @ 及其后面的内容
    if (mentionTriggerIndex.value !== -1) {
      const text = prompt.value
      
      // 找到 @ 后面的内容（可能用户输入了部分字母）
      let endIndex = mentionTriggerIndex.value + 1
      while (endIndex < text.length && /[A-Z]/.test(text[endIndex])) {
        endIndex++
      }
      
      const beforeAt = text.substring(0, mentionTriggerIndex.value)
      const afterAt = text.substring(endIndex)
      const newText = beforeAt + labelText + afterAt
      
      // 先更新文本
      prompt.value = newText
      
      // 等待 DOM 更新后设置光标
      nextTick(() => {
        setTimeout(() => {
          if (promptInputWithTagsRef.value) {
            const element = promptInputWithTagsRef.value.$el?.querySelector('.prompt-input')
            if (element) {
              const targetPosition = beforeAt.length + labelText.length
              setCursorToPosition(element, targetPosition)
            }
          }
        }, 50)
      })
    } else {
      // 直接追加
      prompt.value = prompt.value + labelText
      
      nextTick(() => {
        promptInputWithTagsRef.value?.focus()
      })
    }
  }
  // 使用普通 textarea 时（向后兼容）
  else if (promptInputRef.value) {
    const textarea = promptInputRef.value
    const cursorPos = textarea.selectionStart
    const text = textarea.value
    
    const beforeAt = text.substring(0, mentionTriggerIndex.value)
    const afterCursor = text.substring(cursorPos)
    const newText = beforeAt + labelText + afterCursor
    
    prompt.value = newText
    
    nextTick(() => {
      const newCursorPos = beforeAt.length + labelText.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    })
  }
  
  // 隐藏下拉菜单
  showMentionDropdown.value = false
  mentionTriggerIndex.value = -1
}

// 设置 contentEditable 的光标位置
function setCursorToPosition(element, position) {
  const sel = window.getSelection()
  const range = document.createRange()
  
  let charCount = 0
  let found = false
  
  // 遍历所有子节点
  function traverseNodes(node) {
    if (found) return
    
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent.length
      if (charCount + textLength >= position) {
        range.setStart(node, Math.min(position - charCount, textLength))
        range.collapse(true)
        found = true
        return
      }
      charCount += textLength
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 如果是标签元素
      if (node.classList && node.classList.contains('prompt-tag')) {
        const tagText = node.textContent
        if (charCount + tagText.length >= position) {
          // 光标应该在标签后面
          range.setStartAfter(node)
          range.collapse(true)
          found = true
          return
        }
        charCount += tagText.length
      } else {
        // 递归遍历子节点
        for (let child of node.childNodes) {
          traverseNodes(child)
          if (found) return
        }
      }
    }
  }
  
  traverseNodes(element)
  
  if (!found) {
    // 如果没找到，设置到末尾
    range.selectNodeContents(element)
    range.collapse(false)
  }
  
  sel.removeAllRanges()
  sel.addRange(range)
  element.focus()
}

function closeMentionDropdown() {
  showMentionDropdown.value = false
  mentionTriggerIndex.value = -1
}

// 图片顺序调整
function moveImageUp(index) {
  if (index === 0) return
  
  // 交换文件
  const tempFile = imageFiles.value[index]
  imageFiles.value[index] = imageFiles.value[index - 1]
  imageFiles.value[index - 1] = tempFile
  
  // 交换预览URL
  const tempUrl = previewUrls.value[index]
  previewUrls.value[index] = previewUrls.value[index - 1]
  previewUrls.value[index - 1] = tempUrl
}

function moveImageDown(index) {
  if (index === imageFiles.value.length - 1) return
  
  // 交换文件
  const tempFile = imageFiles.value[index]
  imageFiles.value[index] = imageFiles.value[index + 1]
  imageFiles.value[index + 1] = tempFile
  
  // 交换预览URL
  const tempUrl = previewUrls.value[index]
  previewUrls.value[index] = previewUrls.value[index + 1]
  previewUrls.value[index + 1] = tempUrl
}

// 预览上传的参考图片
function previewReferenceImage(index) {
  if (index < 0 || index >= previewUrls.value.length) return
  
  console.log('[previewReferenceImage] 打开参考图片预览, 索引:', index)
  
  // 创建临时的图片对象用于预览
  currentImage.value = {
    url: previewUrls.value[index],
    prompt: `参考图片 ${index + 1}`,
    model: imageFiles.value[index].name,
    size: `${(imageFiles.value[index].size / 1024 / 1024).toFixed(2)} MB`,
    aspect_ratio: '',
    created: Date.now() / 1000,
    status: 'completed'
  }
  currentImageIndex.value = index
  showImageModal.value = true
  isViewingHistory.value = false
  isViewingReference.value = true
  
  console.log('[previewReferenceImage] 预览已打开')
}

// 播放提示音
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  } catch (e) {
    console.warn('播放提示音失败', e)
  }
}

// 加载历史记录(虚拟滚动:一次性加载所有)
async function loadHistory() {
  try {
    const token = localStorage.getItem('token')
    console.log('[loadHistory] 开始加载历史记录, token存在:', !!token)
    const headers = { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const r = await fetch(`/api/images/history?_=${Date.now()}`, { headers, cache: 'no-store' })
    console.log('[loadHistory] API响应状态:', r.status, r.ok)
    if (r.status === 304) {
      console.log('[loadHistory] 304 Not Modified，保持本地历史不变')
      return
    }
    if (r.ok) {
      const data = await r.json()
      const newHistory = data.images || []
      console.log('[loadHistory] 获取到历史记录数量:', newHistory.length)

      // 限制历史记录数量,防止内存溢出(最多保留500条)
      const MAX_HISTORY = 500
      const limitedHistory = newHistory.slice(0, MAX_HISTORY)

      if (newHistory.length > MAX_HISTORY) {
        console.log(`[loadHistory] 历史记录过多(${newHistory.length}),已限制为${MAX_HISTORY}条`)
      }

      // 检测新增完成的任务
      if (lastHistoryLength.value > 0 && limitedHistory.length > lastHistoryLength.value) {
        const newCompletedCount = limitedHistory.slice(0, limitedHistory.length - lastHistoryLength.value)
          .filter(img => img.status === 'completed').length

        if (newCompletedCount > 0 && !isHistoryDrawerOpen.value) {
          // 抽屉收起时有新任务完成
          unreadCount.value += newCompletedCount
          playNotificationSound()
        }
      }
      // 合并服务器返回与本地等待中的任务
      // 服务器返回的数据为准，本地的 pending 任务如果服务器没有则保留
      const serverIdSet = new Set(limitedHistory.map(h => h.id))
      const localPendingTasks = history.value.filter(h =>
        !serverIdSet.has(h.id) && (h.status === 'pending' || h.status === 'processing')
      )

      // 以服务器返回的为主，添加本地还在等待的任务
      const merged = [...limitedHistory, ...localPendingTasks]

      // 重新按时间倒序
      merged.sort((a, b) => (b.created || 0) - (a.created || 0))
      history.value = merged
      lastHistoryLength.value = limitedHistory.length
    } else {
      const errorText = await r.text()
      console.error('[loadHistory] API返回错误:', errorText)
    }
  } catch (e) {
    console.error('[loadHistory] 加载历史记录失败:', e)
  }
}

// 轮询检查任务状态
async function checkTaskStatus(taskId) {
  try {
    const token = localStorage.getItem('token')
    const headers = { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const r = await fetch(`/api/images/task/${taskId}`, { headers })
    if (r.ok) {
      const data = await r.json()
      return data
    }
  } catch (e) {
    console.error('检查任务状态失败', e)
  }
  return null
}

// 更新任务状态
async function updateTaskInLists(taskId, status, url = null, errorMsg = null) {
  // 更新输出图库中的任务（输出图库只显示最新的一张）
  const itemIndex = items.value.findIndex(item => item.id === taskId)
  if (itemIndex !== -1) {
    items.value[itemIndex].status = status
    if (url) items.value[itemIndex].url = url
    if (errorMsg) items.value[itemIndex].error = errorMsg
  }
  // 如果输出图库中没有此任务，且任务已完成，则替换为最新的
  else if (status === 'completed' && url) {
    const h = history.value.find(x => x.id === taskId)
    if (h) {
      items.value = [{ id: h.id, url, status: 'completed', created: h.created, model: h.model, size: h.size, prompt: h.prompt, aspect_ratio: h.aspect_ratio }]
    }
  }
  
  // 更新历史记录中的任务
  const historyIndex = history.value.findIndex(item => item.id === taskId)
  if (historyIndex !== -1) {
    history.value[historyIndex].status = status
    if (url) history.value[historyIndex].url = url
    if (errorMsg) history.value[historyIndex].error = errorMsg
  }
}

// 开始轮询未完成的任务
function startPolling() {
  if (pollingInterval.value) return

  pollingInterval.value = setInterval(async () => {
    const now = Math.floor(Date.now() / 1000)
    const TIMEOUT = 5 * 60 // 5分钟超时

    const pendingTasks = history.value
      .filter(item => item.status === 'pending' || item.status === 'processing')

    // 限制最大并发轮询数量,防止浏览器卡顿
    const MAX_CONCURRENT_POLLS = 5
    const tasksToCheck = pendingTasks.slice(0, MAX_CONCURRENT_POLLS)

    if (pendingTasks.length === 0) {
      stopPolling()
      return
    }

    if (pendingTasks.length > MAX_CONCURRENT_POLLS) {
      console.log(`[polling] 限制并发轮询: ${pendingTasks.length} -> ${MAX_CONCURRENT_POLLS}`)
    }

    for (const task of tasksToCheck) {
      // 检查是否超时（超过5分钟）
      if (task.created && (now - task.created) > TIMEOUT) {
        console.log(`[polling] 任务 ${task.id} 超时，标记为失败`)
        await updateTaskInLists(task.id, 'failed', null, '生成超时，请重试')
        continue
      }

      const taskData = await checkTaskStatus(task.id)
      if (taskData) {
        if (taskData.status === 'completed') {
          await updateTaskInLists(task.id, 'completed', taskData.url)
        } else if (taskData.status === 'failed' || taskData.status === 'timeout') {
          await updateTaskInLists(task.id, 'failed', null, taskData.error || (taskData.status === 'timeout' ? '生成超时' : '生成失败'))
        }
      }
    }
  }, 3000) // 每3秒检查一次
}

// 停止轮询
function stopPolling() {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
    pollingInterval.value = null
  }
}

// 刷新输出图库
async function refreshGallery() {
  await loadHistory()
  
  // 仅检查输出图库中已有的待处理任务状态
  // 不会从历史记录导入新图片到输出图库
  const pendingTasksInGallery = items.value.filter(item => 
    item.status === 'pending' || item.status === 'processing'
  )
  
  for (const task of pendingTasksInGallery) {
    const taskData = await checkTaskStatus(task.id)
    if (taskData) {
      if (taskData.status === 'completed') {
        await updateTaskInLists(task.id, 'completed', taskData.url)
      } else if (taskData.status === 'failed' || taskData.status === 'timeout') {
        await updateTaskInLists(task.id, 'failed', null, taskData.error || (taskData.status === 'timeout' ? '生成超时' : '生成失败'))
      }
    }
  }
}

// 生成图像
async function generate() {
  error.value = ''
  
  // 检查登录状态 - 必须先登录（检查用户对象而不是 token）
  if (!me.value) {
    error.value = '请先登录再使用图像生成功能。注册新用户可获得奖励积分！'
    return
  }
  
  // 文生图模式：必须有提示词
  if (mode.value === 'text' && !prompt.value) { 
    error.value = '请输入提示词'
    return 
  }
  
  // 图生图模式：必须上传图片
  if (mode.value === 'image' && imageFiles.value.length === 0) { 
    error.value = '请先上传参考图片'
    return 
  }
  
  loading.value = true
  error.value = ''
  
  try {
    let images = []
    // 图生图模式：上传图片
    if (mode.value === 'image' && imageFiles.value.length > 0) {
      // 检查是否有标注图片
      const hasAnnotations = Object.keys(annotatedImageBlobs.value).length > 0
      
      if (hasAnnotations) {
        console.log('[generate] 使用标注后的图片，标注图片数量:', Object.keys(annotatedImageBlobs.value).length)
        
        // 准备要上传的图片数组（混合标注和原始图片）
        const filesToUpload = []
        
        for (let i = 0; i < imageFiles.value.length; i++) {
          if (annotatedImageBlobs.value[i]) {
            // 使用标注后的图片（JPEG 格式）
            const originalName = imageFiles.value[i].name
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
            const annotatedFile = new File(
              [annotatedImageBlobs.value[i]], 
              `annotated_${i}_${nameWithoutExt}.jpg`, 
              { type: 'image/jpeg' }
            )
            console.log('[generate] 标注图片', i, '大小:', (annotatedFile.size / 1024 / 1024).toFixed(2), 'MB')
            filesToUpload.push(annotatedFile)
          } else {
            // 使用原始图片
            filesToUpload.push(imageFiles.value[i])
          }
        }
        
        images = await uploadImages(filesToUpload)
      } else {
        // 使用原始图片
        images = await uploadImages(imageFiles.value)
      }
    }
    
    const payload = { 
      prompt: prompt.value, 
      model: model.value, 
      response_format: 'url'
    }
    
    // 仅在非 auto 时传递 aspect_ratio 参数
    if (aspectRatio.value !== 'auto') {
      payload.aspect_ratio = aspectRatio.value
    }
    
    // 根据模型名称设置分辨率
    if (model.value === 'nano-banana-2') {
      payload.image_size = imageSize.value // 根据选择的尺寸
    }
    
    // 图生图模式：添加参考图片
    if (mode.value === 'image' && images.length > 0) {
      payload.image = images
    }
    
    // 调用生成API
    const j = await generateImage(payload)
    console.log('[generate] API响应:', j)
    
    // 立即创建一个任务记录
    const newTask = { 
      id: j.id || j.task_id,
      url: j.url || null,
      status: j.status || (j.url ? 'completed' : 'pending'),
      created: j.created || Math.floor(Date.now() / 1000), 
      model: j.model || model.value, 
      size: imageSize.value,
      prompt: prompt.value,
      aspect_ratio: aspectRatio.value,
      error: null
    }
    
    console.log('[generate] 创建新任务记录:', newTask)
    
    // 输出图库只显示最新的一张图片（替换而非累积）
    items.value = [newTask]
    
    // 历史中立即加入本地待处理任务，提升可见性
    history.value.unshift(newTask)
    
    // 刷新历史记录
    console.log('[generate] 准备刷新历史记录')
    await loadHistory()
    console.log('[generate] 历史记录刷新完成，当前历史记录数量:', history.value.length)
    
    // 如果任务还在处理中，开始轮询
    if (newTask.status === 'pending' || newTask.status === 'processing') {
      startPolling()
    }
    
    // 清空图片文件
    clearImages()
    
  } catch (e) {
    console.error('[generate] 错误:', e)
    if (e && e.status === 402) {
      error.value = '积分不足，请先获取积分'
    } else if (e && e.status === 401) {
      error.value = '未登录，请先登录'
    } else if (e && e.status === 429) {
      // 并发限制错误
      const hasPackage = userPackageInfo.value.hasPackage
      const concurrentLimit = e.body?.concurrent_limit || userPackageInfo.value.concurrentLimit
      if (hasPackage) {
        error.value = `已达到VIP并发限制（${concurrentLimit}个任务），请等待当前任务完成后再试`
      } else {
        error.value = `已达到并发限制（${concurrentLimit}个任务）。如需多并发，请升级套餐 →`
      }
    } else {
      error.value = e.message || '生成失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

// 打开图片预览（从输出图库）
function openImageModal(item, index) {
  console.log('openImageModal called', item, index)
  if (item.status !== 'completed' || !item.url) {
    console.log('Image not ready or no URL')
    return
  }
  const completedItems = items.value.filter(it => it.status === 'completed')
  currentImage.value = item
  currentImageIndex.value = completedItems.findIndex(it => it.id === item.id)
  showImageModal.value = true
  console.log('Modal opened', showImageModal.value)
  
  // 切换数据源标记
  isViewingHistory.value = false
  isViewingReference.value = false
}

function openHistoryImage(item, index) {
  console.log('openHistoryImage called', item, index)
  if (item.status !== 'completed') {
    console.log('Image not ready:', item.status)
    return
  }
  // 如果没有URL，使用占位图
  if (!item.url) {
    item.url = makePlaceholderImage(item)
  }
  // 从完整的历史记录中查找
  const completedHistory = history.value.filter(h => h.status === 'completed')
  currentImage.value = item
  currentImageIndex.value = completedHistory.findIndex(h => h.id === item.id)
  showImageModal.value = true
  console.log('History modal opened', showImageModal.value, currentImage.value)
  
  // 切换数据源标记
  isViewingHistory.value = true
  isViewingReference.value = false
}

// 上一张
function prevImage() {
  // 如果是查看参考图片
  if (isViewingReference.value) {
    if (currentImageIndex.value > 0) {
      previewReferenceImage(currentImageIndex.value - 1)
    }
    return
  }
  
  // 查看生成的图片
  const dataSource = isViewingHistory.value 
    ? history.value.filter(h => h.status === 'completed')
    : items.value.filter(item => item.status === 'completed')
  
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--
    currentImage.value = dataSource[currentImageIndex.value]
  }
}

// 下一张
function nextImage() {
  // 如果是查看参考图片
  if (isViewingReference.value) {
    if (currentImageIndex.value < previewUrls.value.length - 1) {
      previewReferenceImage(currentImageIndex.value + 1)
    }
    return
  }
  
  // 查看生成的图片
  const dataSource = isViewingHistory.value 
    ? history.value.filter(h => h.status === 'completed')
    : items.value.filter(item => item.status === 'completed')
  
  if (currentImageIndex.value < dataSource.length - 1) {
    currentImageIndex.value++
    currentImage.value = dataSource[currentImageIndex.value]
  }
}

// 关闭预览
function closeModal() {
  showImageModal.value = false
  currentImage.value = null
  isViewingReference.value = false
  // 重置缩放和位置
  imageScale.value = 1
  imageTranslate.value = { x: 0, y: 0 }
}

// 处理鼠标滚轮缩放
function handleWheel(event) {
  event.preventDefault()
  const delta = event.deltaY
  const scaleSpeed = 0.001
  
  // 计算新的缩放比例
  let newScale = imageScale.value - delta * scaleSpeed
  
  // 限制缩放范围：0.5倍到5倍
  newScale = Math.max(0.5, Math.min(5, newScale))
  
  imageScale.value = newScale
}

// 处理鼠标按下（开始拖动）
function handleMouseDown(event) {
  // 只响应左键
  if (event.button !== 0) return
  
  event.preventDefault()
  
  isDraggingImage.value = true
  dragStart.value = {
    x: event.clientX - imageTranslate.value.x,
    y: event.clientY - imageTranslate.value.y
  }
}

// 处理鼠标移动（拖动中）
function handleMouseMove(event) {
  if (!isDraggingImage.value) return
  
  event.preventDefault()
  event.stopPropagation()
  
  // 使用 requestAnimationFrame 优化性能，实现流畅拖动
  requestAnimationFrame(() => {
    imageTranslate.value = {
      x: event.clientX - dragStart.value.x,
      y: event.clientY - dragStart.value.y
    }
  })
}

// 处理鼠标松开（结束拖动）
function handleMouseUp(event) {
  if (isDraggingImage.value) {
    isDraggingImage.value = false
  }
}

// 重置缩放和位置
function resetImageTransform() {
  imageScale.value = 1
  imageTranslate.value = { x: 0, y: 0 }
}

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function download(url, filename) {
  const fname = filename || 'image.png'
  try {
    const { smartDownload } = await import('@/api/client')
    await smartDownload(url, fname)
  } catch (e) {
    console.error('[Home] 下载失败:', e)
  }
}

// 下载历史记录图片
async function downloadHistoryImage(item) {
  if (!item || !item.url) return
  const timestamp = item.created || Math.floor(Date.now() / 1000)
  const modelName = (item.model || 'image').replace(/[^a-zA-Z0-9-_]/g, '_')
  
  // 如果有备注，将备注添加到文件名开头（移除特殊字符）
  const notePrefix = item.note ? item.note.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_').slice(0, 50) + '_' : ''
  const filename = `${notePrefix}${modelName}_${timestamp}.png`
  
  try {
    const { smartDownload } = await import('@/api/client')
    await smartDownload(item.url, filename)
  } catch (e) {
    console.error('[Home] 下载历史图片失败:', e)
  }
}

// 更新图片备注
async function updateImageNote(item, note) {
  if (!item || !item.id) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/images/history/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ note })
    })
    if (response.ok) {
      // 更新本地数据
      const idx = history.value.findIndex(h => h.id === item.id)
      if (idx !== -1) {
        history.value[idx].note = note
      }
      console.log('[updateImageNote] 更新成功:', item.id, note)
    }
  } catch (e) {
    console.error('[updateImageNote] 更新失败:', e)
  }
}

// 更新图片星标
async function updateImageRating(item, rating) {
  if (!item || !item.id) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/images/history/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ rating })
    })
    if (response.ok) {
      // 更新本地数据
      const idx = history.value.findIndex(h => h.id === item.id)
      if (idx !== -1) {
        history.value[idx].rating = rating
      }
      console.log('[updateImageRating] 更新成功:', item.id, rating)
    }
  } catch (e) {
    console.error('[updateImageRating] 更新失败:', e)
  }
}

// 从历史记录再次生成
async function regenerateFromHistory(item) {
  if (!item) return
  
  console.log('[regenerateFromHistory] 开始处理历史记录:', item)
  console.log('[regenerateFromHistory] reference_images:', item.reference_images)
  
  // 恢复参数到输入框
  // 优先使用 user_prompt（用户原始输入，不含预设提示词）
  const displayPrompt = item.user_prompt || item.prompt
  if (displayPrompt) {
    prompt.value = displayPrompt
  }
  if (item.model) {
    model.value = item.model
  }
  if (item.aspect_ratio) {
    aspectRatio.value = item.aspect_ratio
  }
  if (item.size) {
    imageSize.value = item.size
  }
  
  // 检查是否有参考图片
  if (item.reference_images && Array.isArray(item.reference_images) && item.reference_images.length > 0) {
    console.log('[regenerateFromHistory] 检测到参考图片，数量:', item.reference_images.length)
    
    // 显示加载提示
    error.value = '正在加载参考图片...'
    
    try {
      // 清空现有图片
      imageFiles.value = []
      previewUrls.value = []
      
      // 下载每张参考图片
      for (const imageUrl of item.reference_images) {
        console.log('[regenerateFromHistory] 加载图片:', imageUrl)
        
        try {
          // 判断URL类型：如果是外部URL，通过后端代理下载；如果是本地URL，直接下载
          let fetchUrl = imageUrl
          const isExternalUrl = imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) && !imageUrl.includes(window.location.hostname)
          
          if (isExternalUrl) {
            // 外部URL：通过后端API代理下载，避免CORS问题
            console.log('[regenerateFromHistory] 检测到外部URL，使用后端代理:', imageUrl)
            fetchUrl = `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`
          }
          
          console.log('[regenerateFromHistory] 最终请求URL:', fetchUrl)
          
          // 从服务器下载图片
          const response = await fetch(fetchUrl, {
            headers: {
              ...getTenantHeaders(),
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          })
          
          console.log('[regenerateFromHistory] 图片响应状态:', response.status, response.ok)
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`)
          }
          
          // 获取图片blob
          const blob = await response.blob()
          console.log('[regenerateFromHistory] 图片blob大小:', blob.size, 'type:', blob.type)
          
          // 从URL中提取文件名
          const filename = imageUrl.split('/').pop() || `image-${Date.now()}.jpg`
          
          // 转换为File对象
          const file = new File([blob], filename, { type: blob.type })
          
          // 创建预览URL
          const previewUrl = URL.createObjectURL(blob)
          console.log('[regenerateFromHistory] 图片已添加到列表, 预览URL:', previewUrl)
          
          // 添加到列表
          imageFiles.value.push(file)
          previewUrls.value.push(previewUrl)
        } catch (imgError) {
          console.error('[regenerateFromHistory] 图片加载失败:', imageUrl, imgError)
          // 继续加载其他图片
        }
      }
      
      console.log('[regenerateFromHistory] 所有图片加载完成, imageFiles数量:', imageFiles.value.length)
      console.log('[regenerateFromHistory] previewUrls数量:', previewUrls.value.length)
      
      // 切换到图生图模式
      mode.value = 'image'
      
      // 滚动到顶部
      window.scrollTo({ top: 0, behavior: 'smooth' })
      
      // 显示成功提示
      if (imageFiles.value.length > 0) {
        error.value = `已自动填充参数和${imageFiles.value.length}张参考图片`
        setTimeout(() => {
          error.value = ''
        }, 3000)
      } else {
        error.value = '已填充参数，但参考图片加载失败（可能已过期）'
        setTimeout(() => {
          error.value = ''
        }, 3000)
      }
    } catch (e) {
      console.error('[regenerateFromHistory] 加载参考图片失败:', e)
      error.value = '已填充参数，但参考图片加载失败（可能已过期）'
      setTimeout(() => {
        error.value = ''
      }, 3000)
      
      // 仍然切换到图生图模式，让用户可以重新上传
      mode.value = 'image'
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  } else {
    // 文生图模式：清空图片列表
    console.log('[regenerateFromHistory] 无参考图片，切换到文生图模式')
    imageFiles.value = []
    previewUrls.value = []
    mode.value = 'text'
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' })
    
    // 显示提示
    error.value = '已自动填充参数，可以直接生成或修改后生成'
    setTimeout(() => {
      error.value = ''
    }, 3000)
  }
}

// 将历史图片加载到图生图区域
async function loadImageToImg2Img(item) {
  console.log('[loadImageToImg2Img] 开始加载图片到图生图区域:', item)
  
  // 检查是否达到最大上传数量
  if (imageFiles.value.length >= 9) {
    error.value = '最多只能上传9张图片，请先删除一些图片'
    setTimeout(() => { error.value = '' }, 3000)
    return
  }
  
  // 检查图片URL
  if (!item.url) {
    error.value = '图片URL不可用'
    setTimeout(() => { error.value = '' }, 3000)
    return
  }
  
  try {
    // 显示加载提示
    error.value = '正在加载图片...'
    
    // 判断URL类型：如果是外部URL，通过后端代理下载；如果是本地URL，直接下载
    let fetchUrl = item.url
    const isExternalUrl = item.url && (item.url.startsWith('http://') || item.url.startsWith('https://')) && !item.url.includes(window.location.hostname)
    
    if (isExternalUrl) {
      // 外部URL：通过后端API代理下载，避免CORS问题
      console.log('[loadImageToImg2Img] 检测到外部URL，使用后端代理:', item.url)
      fetchUrl = `/api/images/proxy?url=${encodeURIComponent(item.url)}`
    }
    
    console.log('[loadImageToImg2Img] 最终请求URL:', fetchUrl)
    
    // 从服务器下载图片
    const response = await fetch(fetchUrl, {
      headers: {
        ...getTenantHeaders(),
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    
    console.log('[loadImageToImg2Img] 图片响应状态:', response.status, response.ok)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }
    
    // 获取图片blob
    const blob = await response.blob()
    console.log('[loadImageToImg2Img] 图片blob大小:', blob.size, 'type:', blob.type)
    
    // 从URL中提取文件名，或使用提示词作为文件名
    const filename = item.url.split('/').pop() || `${item.prompt?.slice(0, 20) || 'image'}-${Date.now()}.jpg`
    
    // 转换为File对象
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
    
    // 创建预览URL
    const previewUrl = URL.createObjectURL(blob)
    console.log('[loadImageToImg2Img] 图片已添加到列表, 预览URL:', previewUrl)
    
    // 添加到列表
    imageFiles.value.push(file)
    previewUrls.value.push(previewUrl)
    
    // 切换到图生图模式
    mode.value = 'image'
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' })
    
    // 显示成功提示
    error.value = `图片已添加到图生图区域 (${imageFiles.value.length}/9)`
    setTimeout(() => {
      error.value = ''
    }, 3000)
    
    console.log('[loadImageToImg2Img] 图片加载成功')
  } catch (e) {
    console.error('[loadImageToImg2Img] 加载图片失败:', e)
    error.value = '图片加载失败，可能已过期'
    setTimeout(() => {
      error.value = ''
    }, 3000)
  }
}

// 发送图片到图生视频
async function sendToVideoGeneration(item) {
  console.log('[sendToVideoGeneration] 发送图片到图生视频:', item)
  
  if (!item || !item.url) {
    error.value = '图片URL不可用'
    setTimeout(() => { error.value = '' }, 3000)
    return
  }
  
  try {
    // 显示加载提示
    error.value = '正在准备图片，即将跳转到视频生成...'
    
    // 将图片URL保存到 sessionStorage，供视频生成页面使用
    sessionStorage.setItem('videoGenerationImage', JSON.stringify({
      url: item.url,
      prompt: item.prompt || '',
      timestamp: Date.now()
    }))
    
    // 跳转到视频生成页面
    router.push('/video')
    
    // 清除提示
    error.value = ''
  } catch (e) {
    console.error('[sendToVideoGeneration] 发送失败:', e)
    error.value = '操作失败，请重试'
    setTimeout(() => { error.value = '' }, 3000)
  }
}

// 删除历史记录
async function deleteHistoryImage(item) {
  console.log('[deleteHistoryImage] 准备删除历史记录:', item.id)
  
  // 二次确认
  if (!confirm('确定要删除这条历史记录吗？\n\n删除后将无法恢复，包括生成的图片和上传的参考图片。')) {
    return
  }
  
  try {
    // 显示删除提示
    error.value = '正在删除...'
    
    // 调用删除 API
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/user/images/${item.id}`, {
      method: 'DELETE',
      headers: {
        ...getTenantHeaders(),
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    console.log('[deleteHistoryImage] 删除响应状态:', response.status)
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'delete_failed')
    }
    
    const result = await response.json()
    console.log('[deleteHistoryImage] 删除成功:', result)
    
    // 从本地历史记录中移除
    const index = history.value.findIndex(h => h.id === item.id)
    if (index !== -1) {
      history.value.splice(index, 1)
      console.log('[deleteHistoryImage] 已从本地历史记录中移除')
    }
    
    // 如果在输出图库中，也要移除
    const itemsIndex = items.value.findIndex(i => i.id === item.id)
    if (itemsIndex !== -1) {
      items.value.splice(itemsIndex, 1)
      console.log('[deleteHistoryImage] 已从输出图库中移除')
    }
    
    // 显示成功提示
    error.value = '删除成功'
    setTimeout(() => {
      error.value = ''
    }, 2000)
    
  } catch (e) {
    console.error('[deleteHistoryImage] 删除失败:', e)
    
    // 显示错误提示
    let errorMsg = '删除失败'
    if (e.message === 'unauthorized') {
      errorMsg = '删除失败：未授权'
    } else if (e.message === 'image_not_found') {
      errorMsg = '删除失败：记录不存在'
    } else if (e.message === 'forbidden') {
      errorMsg = '删除失败：无权限删除'
    }
    
    error.value = errorMsg
    setTimeout(() => {
      error.value = ''
    }, 3000)
  }
}

// 切换抽屉状态
function toggleHistoryDrawer() {
  isHistoryDrawerOpen.value = !isHistoryDrawerOpen.value
  if (isHistoryDrawerOpen.value) {
    // 打开抽屉时清除未读消息
    unreadCount.value = 0
  }
}

// 切换布局模式
function cycleLayoutMode() {
  const modes = ['comfortable', 'widescreen', 'vertical']
  const currentIndex = modes.indexOf(layoutMode.value)
  layoutMode.value = modes[(currentIndex + 1) % modes.length]
  
  // 保存到 localStorage
  localStorage.setItem('layoutMode', layoutMode.value)
  
  // 触发事件通知 App.vue
  window.dispatchEvent(new CustomEvent('layout-mode-changed', { detail: layoutMode.value }))
}

// 获取布局模式的图标
const layoutModeIcon = computed(() => {
  switch (layoutMode.value) {
    case 'comfortable': return '📱'
    case 'widescreen': return '🖥️'
    case 'vertical': return '📋'
    default: return '📱'
  }
})

// 获取布局模式的文字
const layoutModeText = computed(() => {
  switch (layoutMode.value) {
    case 'comfortable': return '舒适模式'
    case 'widescreen': return '宽屏模式'
    case 'vertical': return '竖屏模式'
    default: return '舒适模式'
  }
})

// 计算网格列数
const gridColsClass = computed(() => {
  if (layoutMode.value === 'comfortable') {
    return 'lg:col-span-3' // 左侧控制面板
  } else if (layoutMode.value === 'widescreen') {
    return 'lg:col-span-2' // 宽屏模式下左侧更窄
  } else {
    return 'lg:col-span-12' // 竖屏模式下占满整行
  }
})

const galleryColsClass = computed(() => {
  if (layoutMode.value === 'comfortable') {
    return 'lg:col-span-7' // 舒适模式
  } else if (layoutMode.value === 'widescreen') {
    return 'lg:col-span-8' // 宽屏模式下更宽
  } else {
    return 'lg:col-span-12' // 竖屏模式下占满整行
  }
})

const historyColsClass = computed(() => {
  if (layoutMode.value === 'vertical') {
    return 'lg:col-span-12' // 竖屏模式下历史记录不变
  }
  return 'lg:col-span-2'
})

// 计算当前选择需要的积分（不含高速通道附加）
const currentPointsCost = computed(() => {
  const modelInfo = availableModels.value.find(m => m.value === model.value)
  const pointsCost = modelInfo?.pointsCost
  
  // 如果模型有多档积分（如1K、2K、4K），根据选择的尺寸计算
  if (pointsCost && typeof pointsCost === 'object') {
    // 尝试匹配尺寸（忽略大小写）
    const sizeKey = Object.keys(pointsCost).find(k => k.toLowerCase() === imageSize.value.toLowerCase())
    return pointsCost[sizeKey] || Object.values(pointsCost)[0] || 1
  }
  
  // 固定积分模型
  return pointsCost || 1
})

// 计算总积分消耗（含高速通道附加）
const totalPointsCost = computed(() => {
  return currentPointsCost.value
})

// 检查积分是否足够
const hasEnoughPoints = computed(() => {
  if (!me.value) return true // 未登录时不检查
  const totalPoints = (me.value.package_points || 0) + (me.value.points || 0)
  return totalPoints >= totalPointsCost.value
})

// 用户套餐信息
const userPackageInfo = computed(() => {
  if (!me.value) return { hasPackage: false, concurrentLimit: 1 }
  
  // 判断是否有活跃套餐（只要套餐未过期即为VIP，不要求积分>0）
  const hasPackage = me.value.package_points_expires_at && 
                     me.value.package_points_expires_at > Date.now()
  
  // 并发限制：优先使用用户的 concurrent_limit（数据库设置值）
  const concurrentLimit = me.value.concurrent_limit || 1
  
  return {
    hasPackage,
    concurrentLimit
  }
})

// 当模型有多档积分时显示尺寸选项
const showResolutionOption = computed(() => {
  const modelInfo = availableModels.value.find(m => m.value === model.value)
  return modelInfo?.hasResolutionPricing || (modelInfo?.pointsCost && typeof modelInfo.pointsCost === 'object')
})

// 获取当前模型的可用尺寸选项
const availableResolutions = computed(() => {
  const modelInfo = availableModels.value.find(m => m.value === model.value)
  const pointsCost = modelInfo?.pointsCost
  
  if (pointsCost && typeof pointsCost === 'object') {
    return Object.entries(pointsCost).map(([size, points]) => ({
      value: size.toUpperCase(),
      label: `${size.toUpperCase()} (${points}积分)`
    }))
  }
  return []
})

// 获取可用的图片模型列表（从配置动态获取，根据当前模式过滤）
const availableModels = computed(() => {
  // 根据当前模式过滤：'text' = 文生图(t2i), 'image' = 图生图(i2i)
  const currentMode = mode.value === 'image' ? 'i2i' : 't2i'
  return getAvailableImageModels(currentMode)
})

// 获取模型显示名称
const getModelName = (modelKey) => {
  const customName = getModelDisplayName(modelKey, 'image')
  if (customName) return customName
  
  // 默认名称
  const defaultNames = {
    'nano-banana': 'Nano Banana',
    'nano-banana-hd': 'Nano Banana HD',
    'nano-banana-2': 'Nano Banana 2'
  }
  return defaultNames[modelKey] || modelKey
}

// 生成占位图片（当图片加载失败时）
function makePlaceholderImage(item) {
  const w = 400
  const h = 300
  const prompt = String(item.prompt || '').slice(0, 30)
  const model = String(item.model || '').slice(0, 20)
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#9333ea"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="${w/2}" y="${h/2-20}" fill="#ffffff" font-size="24" text-anchor="middle" font-family="system-ui,Arial">图片已过期</text><text x="${w/2}" y="${h/2+20}" fill="#ffffff" font-size="14" text-anchor="middle" font-family="system-ui,Arial" opacity="0.75">${prompt}</text><text x="${w/2}" y="${h/2+45}" fill="#ffffff" font-size="12" text-anchor="middle" font-family="system-ui,Arial" opacity="0.6">${model}</text></svg>`
  const b64 = btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${b64}`
}

// 键盘导航
function handleKeydown(e) {
  if (!showImageModal.value) return
  if (e.key === 'ArrowLeft') prevImage()
  if (e.key === 'ArrowRight') nextImage()
  if (e.key === 'Escape') closeModal()
}

// 兑换券相关方法
function openVoucherModal() {
  showVoucherModal.value = true
  voucherCode.value = ''
  voucherError.value = ''
  voucherSuccess.value = ''
}

function closeVoucherModal() {
  showVoucherModal.value = false
  voucherCode.value = ''
  voucherError.value = ''
  voucherSuccess.value = ''
}

async function submitVoucher() {
  if (!voucherCode.value || !voucherCode.value.trim()) {
    voucherError.value = '请输入兑换码'
    return
  }
  
  voucherLoading.value = true
  voucherError.value = ''
  voucherSuccess.value = ''
  
  try {
    const result = await redeemVoucher(voucherCode.value.trim().toUpperCase())
    
    // 获取兑换券的面值余额（不是用户总余额）
    const voucherBalance = result.balance || 0
    
    console.log('[Home/submitVoucher] 兑换成功，兑换券面值余额:', voucherBalance, '分 (¥' + (voucherBalance/100).toFixed(2) + ')')
    
    // 如果兑换券有余额，尝试自动购买套餐
    if (voucherBalance > 0) {
      console.log('[Home/submitVoucher] 开始自动购买套餐流程（使用兑换券面值）...')
      const autoPurchaseResult = await tryAutoPurchasePackage(voucherBalance)
      
      if (autoPurchaseResult.success) {
        // 自动购买成功 - 根据续费/升级/新购显示不同消息
        let actionText = '已自动购买'
        let detailText = ''
        if (autoPurchaseResult.isRenewal) {
          actionText = '已自动续费'
          detailText = `\n• 有效期延长：${autoPurchaseResult.durationDays}天\n• 累加积分：+${autoPurchaseResult.points}\n• 并发限制：不变`
        } else if (autoPurchaseResult.isUpgrade) {
          actionText = '已自动升级'
          detailText = `\n• 赠送积分：${autoPurchaseResult.points}\n• 并发限制：${autoPurchaseResult.concurrentLimit}个\n• 有效期：${autoPurchaseResult.durationDays}天\n• 原套餐剩余价值已自动折抵`
        } else {
          detailText = `\n• 赠送积分：${autoPurchaseResult.points}\n• 并发限制：${autoPurchaseResult.concurrentLimit}个\n• 有效期：${autoPurchaseResult.durationDays}天`
        }
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(result.balance / 100).toFixed(2)} 余额\n\n🎉 ${actionText}「${autoPurchaseResult.packageName}」套餐${detailText}\n\n💰 剩余余额：¥${(autoPurchaseResult.remainingBalance / 100).toFixed(2)}`
        // 刷新用户信息
        me.value = await getMe()
      } else if (autoPurchaseResult.reason === 'no_package') {
        // 没有可购买的套餐
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(result.balance / 100).toFixed(2)} 余额\n\n💡 ${autoPurchaseResult.message}`
      } else if (autoPurchaseResult.reason === 'purchase_failed') {
        // 购买失败
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(result.balance / 100).toFixed(2)} 余额\n\n⚠️ 自动购买套餐失败：${autoPurchaseResult.message}\n请手动前往套餐页面购买`
      } else {
        // 其他情况（只兑换了积分没有余额等）
        voucherSuccess.value = result.message || `成功兑换 ${result.points} 积分！`
      }
    } else if (result.points > 0) {
      // 只兑换了积分
      voucherSuccess.value = `✅ 成功兑换 ${result.points} 积分！`
    } else {
      voucherSuccess.value = result.message || '兑换成功！'
    }
    
    // 触发全局用户信息更新事件（更新导航栏）
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
    // 5秒后关闭模态框（给用户更多时间查看详情）
    setTimeout(() => {
      closeVoucherModal()
    }, 5000)
  } catch (e) {
    voucherError.value = e.message || '兑换失败，请检查兑换码是否正确'
  } finally {
    voucherLoading.value = false
  }
}

// 尝试自动购买套餐（使用兑换券面值余额）
async function tryAutoPurchasePackage(voucherBalance) {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      return { success: false, reason: 'no_token', message: '未登录' }
    }
    
    console.log('[Home/tryAutoPurchasePackage] 兑换券面值:', voucherBalance, '分 (¥' + (voucherBalance/100).toFixed(2) + ')')
    
    // 获取套餐列表
    console.log('[Home/tryAutoPurchasePackage] 获取套餐列表...')
    const pkgRes = await fetch('/api/packages', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (!pkgRes.ok) {
      console.log('[Home/tryAutoPurchasePackage] 获取套餐列表失败')
      return { success: false, reason: 'fetch_failed', message: '获取套餐列表失败' }
    }
    const pkgData = await pkgRes.json()
    const packages = pkgData.packages || []
    
    console.log('[Home/tryAutoPurchasePackage] 套餐列表:', packages.map(p => ({ name: p.name, price: p.price, type: p.type })))
    
    if (packages.length === 0) {
      return { success: false, reason: 'no_package', message: '暂无可用套餐' }
    }
    
    // 获取当前用户套餐
    const activeRes = await fetch('/api/user/package', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    let activePackage = null
    if (activeRes.ok) {
      const activeData = await activeRes.json()
      activePackage = activeData.package
    }
    
    console.log('[Home/tryAutoPurchasePackage] 当前活跃套餐:', activePackage ? `${activePackage.package_name} (${activePackage.package_type})` : '无')
    
    // 套餐等级定义
    const packageOrder = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, yearly: 5 }
    const currentOrder = activePackage ? (packageOrder[activePackage.package_type] || 0) : 0
    
    // 找到兑换券面值范围内可以购买的套餐（同级续费或升级，不能降级）
    const affordablePackages = packages.filter(pkg => {
      // 兑换券面值足够
      if (pkg.price > voucherBalance) {
        console.log(`[Home/tryAutoPurchasePackage] 套餐 "${pkg.name}" 价格 ${pkg.price} > 兑换券面值 ${voucherBalance} - 跳过`)
        return false
      }
      
      const newOrder = packageOrder[pkg.type] || 0
      
      // 不能降级（降级套餐不允许购买）
      if (activePackage && newOrder < currentOrder) {
        console.log(`[Home/tryAutoPurchasePackage] 套餐 "${pkg.name}" 会导致降级(${newOrder} < ${currentOrder}) - 跳过`)
        return false
      }
      
      // 同级续费或升级都可以
      if (activePackage) {
        if (newOrder === currentOrder) {
          console.log(`[Home/tryAutoPurchasePackage] 套餐 "${pkg.name}" 同级续费 - 符合条件`)
        } else {
          console.log(`[Home/tryAutoPurchasePackage] 套餐 "${pkg.name}" 升级(${currentOrder} → ${newOrder}) - 符合条件`)
        }
      } else {
        console.log(`[Home/tryAutoPurchasePackage] 套餐 "${pkg.name}" 新购 - 符合条件`)
      }
      return true
    })
    
    if (affordablePackages.length === 0) {
      // 分析原因并给出准确提示
      const minPricePackage = packages.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)
      const minPrice = minPricePackage ? minPricePackage.price : 0
      
      // 检查是否所有套餐都是降级
      const allDowngrade = activePackage && packages.every(pkg => {
        const newOrder = packageOrder[pkg.type] || 0
        return newOrder < currentOrder
      })
      
      // 检查是否面值不够买同级或更高级套餐
      const sameOrHigherPackages = packages.filter(pkg => {
        const newOrder = packageOrder[pkg.type] || 0
        return !activePackage || newOrder >= currentOrder
      })
      const minSameOrHigherPrice = sameOrHigherPackages.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)?.price || 0
      
      let hint = '兑换券面值不足以购买套餐'
      if (allDowngrade) {
        hint = `您当前是${activePackage.package_name}，兑换券面值只能购买更低级别套餐，不支持降级`
      } else if (minSameOrHigherPrice > 0 && voucherBalance < minSameOrHigherPrice) {
        hint = `续费或升级套餐最低需要 ¥${(minSameOrHigherPrice/100).toFixed(2)}，兑换券面值 ¥${(voucherBalance/100).toFixed(2)} 不足`
      } else if (minPrice > 0 && voucherBalance < minPrice) {
        hint = `最便宜的套餐需要 ¥${(minPrice/100).toFixed(2)}，兑换券面值 ¥${(voucherBalance/100).toFixed(2)}`
      }
      return { success: false, reason: 'no_package', message: hint }
    }
    
    // 按套餐等级排序，选择最大的（优先升级，其次续费）
    affordablePackages.sort((a, b) => {
      const orderA = packageOrder[a.type] || 0
      const orderB = packageOrder[b.type] || 0
      return orderB - orderA
    })
    
    const selectedPackage = affordablePackages[0]
    const selectedOrder = packageOrder[selectedPackage.type] || 0
    const isRenewal = activePackage && selectedOrder === currentOrder
    const isUpgrade = activePackage && selectedOrder > currentOrder
    
    console.log(`[Home/tryAutoPurchasePackage] 选择套餐: "${selectedPackage.name}" (${isRenewal ? '续费' : isUpgrade ? '升级' : '新购'})`)
    
    // 购买套餐（后端会自动处理续费延期、升级折抵等逻辑）
    console.log('[Home/tryAutoPurchasePackage] 开始购买套餐...')
    const purchaseRes = await fetch('/api/packages/purchase', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ package_id: selectedPackage.id })
    })
    
    const purchaseData = await purchaseRes.json()
    console.log('[Home/tryAutoPurchasePackage] 购买结果:', purchaseData)
    
    if (purchaseRes.ok && !purchaseData.pay_url) {
      // 购买成功
      // 刷新用户信息获取最新余额
      const userRes = await fetch('/api/user/me', {
        headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
      })
      let remainingBalance = 0
      if (userRes.ok) {
        const userData = await userRes.json()
        remainingBalance = userData.balance || 0
      }
      
      return {
        success: true,
        packageName: selectedPackage.name,
        points: selectedPackage.points,
        isRenewal: isRenewal,
        isUpgrade: isUpgrade,
        concurrentLimit: selectedPackage.concurrent_limit,
        durationDays: selectedPackage.duration_days,
        remainingBalance: remainingBalance
      }
    } else {
      return { success: false, reason: 'purchase_failed', message: purchaseData.message || '购买失败' }
    }
  } catch (e) {
    console.error('[Home/tryAutoPurchasePackage] 异常:', e)
    return { success: false, reason: 'error', message: e.message || '购买过程出错' }
  }
}

onMounted(async () => {
  me.value = await getMe()
  
  await loadHistory()
  
  // 初始化默认模型（使用模型列表的第一个）
  const models = availableModels.value
  if (models.length > 0 && !model.value) {
    model.value = models[0].value
    console.log('[init] 默认模型已设置为:', model.value)
    
    // 如果是按分辨率计费的模型，设置默认尺寸
    const modelInfo = models[0]
    if (modelInfo.pointsCost && typeof modelInfo.pointsCost === 'object') {
      const firstSize = Object.keys(modelInfo.pointsCost)[0]?.toUpperCase() || '1K'
      imageSize.value = firstSize
    }
  }
  
  // 初始化历史记录数量
  lastHistoryLength.value = history.value.length
  
  // 检查是否有未完成的任务
  const hasPendingTasks = history.value.some(item => 
    item.status === 'pending' || item.status === 'processing'
  )
  
  if (hasPendingTasks) {
    startPolling()
  }
  
  // 加载兑换券外部链接配置
  try {
    const configRes = await fetch('/api/points-config')
    if (configRes.ok) {
      const configData = await configRes.json()
      if (configData.voucher_external_link) {
        externalLinkConfig.value = {
          enabled: !!configData.voucher_external_link.enabled,
          button_text: configData.voucher_external_link.button_text || '获取兑换券',
          url: configData.voucher_external_link.url || '',
          open_in_new_tab: configData.voucher_external_link.open_in_new_tab !== false
        }
      }
    }
  } catch (e) {
    console.warn('[Home] 获取外部链接配置失败:', e)
  }
  
  // 从 localStorage 读取布局模式
  const savedLayoutMode = localStorage.getItem('layoutMode')
  if (savedLayoutMode && ['comfortable', 'widescreen', 'vertical'].includes(savedLayoutMode)) {
    layoutMode.value = savedLayoutMode
    // 初始化时也触发事件
    window.dispatchEvent(new CustomEvent('layout-mode-changed', { detail: layoutMode.value }))
  }
  
  window.addEventListener('keydown', handleKeydown)
  
  // 监听兑换券入口点击事件
  window.addEventListener('open-voucher-modal', openVoucherModal)
})

onUnmounted(() => {
  stopPolling()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('open-voucher-modal', openVoucherModal)
})
</script>

<template>
  <!-- 布局模式切换按钮 - 右上角固定位置 -->
  <button
    @click="cycleLayoutMode"
    class="fixed z-30 bg-white dark:bg-dark-700 hover:bg-slate-50 dark:hover:bg-dark-600 shadow-lg rounded-xl px-4 py-2.5 flex items-center space-x-2 transition-all duration-300 hover:scale-105 border border-slate-200 dark:border-dark-600 group"
    :class="layoutMode === 'widescreen' ? 'top-20 right-0 rounded-r-none' : 'top-20 right-4'"
    :title="`当前：${layoutModeText}，点击切换`"
  >
    <span class="text-xl">{{ layoutModeIcon }}</span>
    <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 hidden sm:inline">{{ layoutModeText }}</span>
    <svg class="w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
    </svg>
  </button>

  <!-- 主容器 - 根据布局模式调整 padding -->
  <div :class="layoutMode === 'widescreen' ? 'px-0 py-8' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'">
    <div class="gap-4" 
    :class="{
      'grid grid-cols-1 lg:grid-cols-12': layoutMode !== 'vertical',
      'lg:gap-3': layoutMode === 'widescreen',
      'flex flex-col': layoutMode === 'vertical'
    }">
    <!-- 左侧控制面板 -->
    <div :class="layoutMode !== 'vertical' ? gridColsClass : 'w-full order-1 lg:order-1'"
      :style="layoutMode === 'widescreen' ? 'padding-left: 0' : ''">
      <div class="card" 
        :class="{
          'p-5': layoutMode !== 'widescreen',
          'p-3.5': layoutMode === 'widescreen',
          'sticky top-24': layoutMode !== 'vertical'
        }">
        <!-- 模式切换标签 -->
        <div class="flex bg-slate-100 dark:bg-dark-700 rounded-xl p-1"
          :class="layoutMode === 'widescreen' ? 'mb-3' : 'mb-5'">
          <button 
            @click="mode = 'image'" 
            :class="mode === 'image' 
              ? 'bg-white dark:bg-dark-600 shadow-md text-pink-600 dark:text-pink-400' 
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
            class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium"
            :style="layoutMode === 'widescreen' ? 'padding: 0.5rem 0.75rem' : 'padding: 0.75rem 1rem'"
          >
            <span :class="layoutMode === 'widescreen' ? 'text-lg' : 'text-xl'">🎨</span>
            <span class="text-sm" :class="{'hidden xl:inline': layoutMode === 'widescreen'}">图生图</span>
          </button>
          <button 
            @click="mode = 'text'" 
            :class="mode === 'text' 
              ? 'bg-white dark:bg-dark-600 shadow-md text-primary-600 dark:text-primary-400' 
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
            class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium"
            :style="layoutMode === 'widescreen' ? 'padding: 0.5rem 0.75rem' : 'padding: 0.75rem 1rem'"
          >
            <span :class="layoutMode === 'widescreen' ? 'text-lg' : 'text-xl'">✍️</span>
            <span class="text-sm" :class="{'hidden xl:inline': layoutMode === 'widescreen'}">文生图</span>
          </button>
        </div>

        <div :class="layoutMode === 'widescreen' ? 'space-y-3' : 'space-y-4'">
          <!-- 模型选择 -->
          <div>
            <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400"
              :class="layoutMode === 'widescreen' ? 'mb-1' : 'mb-1.5'">
              <span>🤖</span>
              <span>模型</span>
            </label>
            <select v-model="model" class="input text-sm">
              <option v-for="m in availableModels" :key="m.value" :value="m.value">
                {{ m.label }} ({{ getModelPointsCost(m.value) }}积分)
              </option>
            </select>
          </div>

          <!-- 画面比例和尺寸 - 并排显示 -->
          <div class="grid gap-2" :class="showResolutionOption ? 'grid-cols-2' : 'grid-cols-1'">
            <div>
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400"
                :class="layoutMode === 'widescreen' ? 'mb-1' : 'mb-1.5'">
                <span>📐</span>
                <span>比例</span>
              </label>
              <select v-model="aspectRatio" class="input text-sm">
                <option value="auto">Auto (自动)</option>
                <option value="16:9">16:9</option>
                <option value="1:1">1:1</option>
                <option value="9:16">9:16</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="2:3">2:3</option>
                <option value="3:2">3:2</option>
                <option value="4:5">4:5</option>
                <option value="5:4">5:4</option>
                <option value="21:9">21:9</option>
              </select>
            </div>

            <!-- 尺寸选项 - 有多档积分的模型显示 -->
            <div v-if="showResolutionOption">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400"
                :class="layoutMode === 'widescreen' ? 'mb-1' : 'mb-1.5'">
                <span>📏</span>
                <span>尺寸</span>
              </label>
              <select v-model="imageSize" class="input text-sm">
                <option v-for="res in availableResolutions" :key="res.value" :value="res.value">
                  {{ res.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- 提示词 -->
          <div>
            <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400"
              :class="layoutMode === 'widescreen' ? 'mb-1' : 'mb-1.5'">
              <span>📝</span>
              <span>提示词</span>
              <span v-if="mode === 'image' && totalMarkersCount > 0" class="text-xs text-primary-600 dark:text-primary-400">
                (输入 @ 引用标记位置)
              </span>
            </label>
            
            <!-- 使用标签输入组件 -->
            <PromptInputWithTags
              ref="promptInputWithTagsRef"
              v-model="prompt"
              :markers="allMarkers"
              :rows="layoutMode === 'widescreen' ? 2 : 3"
              placeholder="描述你想要的图像..."
              @input="onPromptInput"
              @mention-trigger="onMentionTrigger"
            />
            
            <!-- @ 提及下拉菜单 -->
            <MentionDropdown
              :visible="showMentionDropdown"
              :markers="allMarkers"
              :position="mentionDropdownPosition"
              @select="onMentionSelect"
              @close="closeMentionDropdown"
            />
          </div>

          <!-- 图生图上传区域 -->
          <div v-if="mode === 'image'" :class="layoutMode === 'widescreen' ? 'space-y-2' : 'space-y-2.5'">
            <div class="flex items-center justify-between">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>🖼️</span>
                <span>上传参考图片</span>
              </label>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                <span class="font-semibold text-primary-600 dark:text-primary-400">{{ imageFiles.length }}</span> / 9张
              </div>
            </div>
            
            <!-- 拖拽区域 -->
            <div 
              v-if="imageFiles.length < 9"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
              :class="{ 'border-primary-500 bg-primary-50 dark:bg-primary-900/20': isDragging }"
              class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg text-center transition-colors cursor-pointer hover:border-primary-400"
              :style="layoutMode === 'widescreen' ? 'padding: 0.75rem' : 'padding: 1rem'"
              @click="$refs.fileInput.click()"
            >
              <div :class="layoutMode === 'widescreen' ? 'text-2xl mb-1' : 'text-3xl mb-1.5'">📤</div>
              <p class="text-xs text-slate-600 dark:text-slate-400 mb-1">
                点击或拖拽图片到这里
              </p>
              <p class="text-xs text-slate-400 dark:text-slate-500" v-if="layoutMode !== 'widescreen'">
                单张最大30MB
              </p>
              <input 
                ref="fileInput"
                type="file" 
                accept="image/*" 
                multiple 
                @change="onFilesChange" 
                class="hidden"
              />
            </div>

            <!-- 已达上限提示 -->
            <div 
              v-else
              class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-4 text-center bg-slate-50 dark:bg-dark-700/50"
            >
              <div class="text-2xl mb-1">✅</div>
              <p class="text-xs text-slate-600 dark:text-slate-400">
                已上传9张图片（已达上限）
              </p>
            </div>

            <!-- 预览已上传的图片 - 列表模式 -->
            <div v-if="previewUrls.length > 0" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  图片列表（可调整顺序）
                </span>
                <button 
                  @click="clearImages"
                  class="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  清空全部
                </button>
              </div>
              
              <div class="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar-small">
                <div 
                  v-for="(url, idx) in previewUrls" 
                  :key="idx" 
                  class="relative group flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600 hover:border-primary-300 dark:hover:border-primary-700 transition-all"
                >
                  <!-- 序号 -->
                  <div class="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full flex items-center justify-center text-xs font-bold">
                    {{ idx + 1 }}
                  </div>
                  
                  <!-- 缩略图 - 可点击放大 -->
                  <img 
                    :src="url" 
                    @click.stop="previewReferenceImage(idx)"
                    class="w-12 h-12 object-cover rounded flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all hover:scale-105" 
                    :title="`点击放大预览 - ${imageFiles[idx].name}`"
                  />
                  
                  <!-- 文件信息 -->
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-700 dark:text-slate-300 truncate font-medium">
                      {{ imageFiles[idx].name }}
                    </p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ (imageFiles[idx].size / 1024 / 1024).toFixed(2) }} MB
                    </p>
                  </div>
                  
                  <!-- 操作按钮组 -->
                  <div class="flex items-center space-x-1 flex-shrink-0">
                    <!-- 上移 -->
                    <button 
                      @click.stop="moveImageUp(idx)"
                      :disabled="idx === 0"
                      :class="idx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-dark-600'"
                      class="w-6 h-6 bg-slate-100 dark:bg-dark-600 text-slate-600 dark:text-slate-400 rounded flex items-center justify-center transition-colors"
                      title="上移"
                    >
                      ↑
                    </button>
                    
                    <!-- 下移 -->
                    <button 
                      @click.stop="moveImageDown(idx)"
                      :disabled="idx === imageFiles.length - 1"
                      :class="idx === imageFiles.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-dark-600'"
                      class="w-6 h-6 bg-slate-100 dark:bg-dark-600 text-slate-600 dark:text-slate-400 rounded flex items-center justify-center transition-colors"
                      title="下移"
                    >
                      ↓
                    </button>
                    
                    <!-- 删除 -->
                    <button 
                      @click.stop="removeImage(idx)"
                      class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 图片标注编辑器 -->
            <div v-if="imageFiles.length > 0" :class="layoutMode === 'widescreen' ? 'mt-3' : 'mt-4'">
              <div class="flex items-center justify-between mb-2">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>📍</span>
                  <span>标注编辑区</span>
                  <span class="text-primary-600 dark:text-primary-400">
                    (共{{ totalMarkersCount }}个标记)
                  </span>
                </label>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  标记关键位置，在提示词中引用
                </span>
              </div>
              
              <!-- 多图切换标签 -->
              <div v-if="imageFiles.length > 1" class="flex items-center gap-2 mb-3 overflow-x-auto pb-2 custom-scrollbar-small">
                <button
                  v-for="(file, idx) in imageFiles"
                  :key="idx"
                  @click="switchAnnotationImage(idx)"
                  class="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all"
                  :class="currentAnnotationImageIndex === idx 
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' 
                    : 'border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-400 hover:border-primary-300 dark:hover:border-primary-700'"
                >
                  <img :src="previewUrls[idx]" class="w-10 h-10 object-cover rounded" />
                  <div class="text-left">
                    <div class="text-xs font-semibold">图片 {{ idx + 1 }}</div>
                    <div class="text-xs opacity-75">
                      {{ allImageMarkers[idx]?.length || 0 }} 个标记
                    </div>
                  </div>
                </button>
              </div>
              
              <!-- 当前图片标注器 -->
              <ImageAnnotator
                ref="imageAnnotatorRef"
                :image="previewUrls[currentAnnotationImageIndex]"
                :disabled="loading"
                @update:markers="onMarkersUpdate"
                @annotated-image="onAnnotatedImage"
              />
            </div>
          </div>

          <!-- 生成按钮 -->
          <button 
            @click="generate" 
            :disabled="loading || (me && !hasEnoughPoints)"
            class="w-full btn-primary text-base disabled:opacity-60 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
            :class="layoutMode === 'widescreen' ? 'py-2.5' : 'py-3.5'"
          >
            <span v-if="loading" class="inline-flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              提交中...
            </span>
            <span v-else class="inline-flex items-center justify-center w-full">
              <span class="mr-2">✨</span>
              <span :class="{'hidden xl:inline': layoutMode === 'widescreen'}">立即</span>
              <span>生成</span>
              <span class="ml-2 text-sm opacity-90">(消耗{{ totalPointsCost }}积分)</span>
            </span>
          </button>

          <!-- 邀请好友赢积分 -->
          
          <!-- 未登录提示 -->
          <div v-if="!me" class="p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div class="flex items-start space-x-2">
              <span class="text-lg">🎁</span>
              <div class="flex-1">
                <p class="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">
                  注册即送积分！
                </p>
                <p class="text-xs text-blue-700 dark:text-blue-400">
                  新用户注册可获得奖励积分，立即开始创作吧～
                </p>
                <a 
                  href="/" 
                  class="mt-2 inline-block px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded-md transition-colors font-medium"
                >
                  立即注册/登录
                </a>
              </div>
            </div>
          </div>
          
          <!-- 并发限制提示 -->
          <div v-if="me" class="text-center">
            <p class="text-xs text-slate-500 dark:text-slate-400">
              <span v-if="userPackageInfo.hasPackage" class="text-purple-600 dark:text-purple-400">
                ⚡ VIP用户
              </span>
              <span v-else class="text-slate-600 dark:text-slate-400">
                👤 普通用户
              </span>
              <span class="mx-1">·</span>
              <span>最多支持 <span class="font-semibold text-primary-600 dark:text-primary-400">{{ userPackageInfo.concurrentLimit }}</span> 条并发任务</span>
            </p>
          </div>
          
          <!-- 积分不足提示 -->
          <div v-if="me && !hasEnoughPoints" class="p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p class="text-xs text-amber-700 dark:text-amber-400 flex items-center">
              <span class="mr-1.5">💰</span>
              <span>积分不足！当前: {{ (me.package_points || 0) + (me.points || 0) }}，需要: {{ totalPointsCost }}</span>
            </p>
          </div>

          <!-- 错误提示 -->
          <div v-if="error" class="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div class="flex items-center justify-between">
              <p class="text-xs text-red-700 dark:text-red-400 flex items-center flex-1">
                <span class="mr-1.5">⚠️</span>
                <span>{{ error }}</span>
              </p>
              <!-- 如果是未登录错误，显示登录按钮 -->
              <a 
                v-if="error.includes('请先登录')"
                href="/" 
                class="ml-2 px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded-md transition-colors whitespace-nowrap"
              >
                立即登录
              </a>
              <!-- 如果是并发限制错误且是普通用户，显示升级按钮 -->
              <a 
                v-else-if="error.includes('如需多并发') && !userPackageInfo.hasPackage"
                href="/packages" 
                class="ml-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition-colors whitespace-nowrap"
              >
                升级套餐
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 中间输出图库 - 扩大画幅 -->
    <div :class="layoutMode !== 'vertical' ? galleryColsClass : 'w-full order-2 lg:order-2'">
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold gradient-text flex items-center">
            <span class="mr-2">🖼️</span>
            <span>输出图库</span>
            <span class="ml-2 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-xs font-semibold">
              {{ items.length }}
            </span>
          </h2>
          <button 
            @click="refreshGallery"
            class="btn-secondary text-xs px-3 py-2 flex items-center space-x-1.5 hover:scale-105 transition-transform duration-200"
            title="刷新图库"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>刷新</span>
          </button>
        </div>

        <!-- 空状态 -->
        <div v-if="items.length === 0" class="text-center py-20">
          <div class="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 rounded-2xl flex items-center justify-center shadow-lg">
            <span class="text-4xl">🎨</span>
          </div>
          <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            开始创作
          </h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            在左侧输入提示词，点击生成按钮创造独特的图像
          </p>
        </div>

        <!-- 单张大图展示 -->
        <div v-else-if="items.length === 1" class="w-full">
          <div 
            v-for="(it, idx) in items" 
            :key="it.id"
            class="relative group cursor-pointer transition-all duration-500"
            :class="{ 'hover:shadow-2xl': it.status === 'completed' }"
            @click="() => { if (it.status === 'completed') openImageModal(it, idx) }"
          >
            <!-- 处理中状态 -->
            <div v-if="it.status === 'pending' || it.status === 'processing'" class="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-700 dark:to-dark-600 rounded-2xl overflow-hidden">
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <svg class="animate-spin h-16 w-16 text-primary-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="text-slate-600 dark:text-slate-400 text-base font-semibold">正在生成高清图像...</p>
                <p class="text-slate-500 dark:text-slate-500 text-sm mt-2 opacity-75">即将呈现精彩作品</p>
                <p class="text-primary-500 dark:text-primary-400 text-sm mt-3 font-medium">您可以继续创作，新的创作不会影响原来的任务生成</p>
              </div>
            </div>
            
            <!-- 失败/超时状态 -->
            <div v-else-if="it.status === 'failed' || it.status === 'timeout'" class="relative aspect-video bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-2xl overflow-hidden">
              <div class="absolute inset-0 flex flex-col items-center justify-center p-6">
                <div class="text-5xl mb-4">{{ it.status === 'timeout' ? '⏰' : '❌' }}</div>
                <p class="text-red-600 dark:text-red-400 text-lg font-semibold text-center">{{ it.status === 'timeout' ? '生成超时' : '生成失败' }}</p>
                <p class="text-red-500 dark:text-red-500 text-sm mt-2 text-center opacity-75">{{ it.error || (it.status === 'timeout' ? '请重试' : '请稍后重试') }}</p>
                <p class="text-sm text-green-600 dark:text-green-400 mt-4 font-medium">✓ 未扣除积分</p>
              </div>
            </div>
            
            <!-- 完成状态 - 大图展示 -->
            <div v-else class="relative overflow-hidden rounded-2xl shadow-xl">
              <!-- 高清图片（渐进式加载） -->
              <CachedImage 
                :src="it.url" 
                :thumbnail-src="it.thumbnail_url"
                :alt="it.prompt || '生成的图像'" 
                progressive
                img-class="w-full h-auto object-contain transition-all duration-700 group-hover:scale-[1.02]"
                loading="eager"
              />
              
              <!-- 高清标识和点击提示 -->
              <div class="absolute top-4 right-4 flex gap-2">
                <div class="px-3 py-1.5 bg-gradient-to-r from-primary-500 to-purple-500 text-white text-xs font-bold rounded-full shadow-lg backdrop-blur-sm">
                  {{ it.size }} 高清
                </div>
              </div>
              
              <!-- 悬停遮罩 - 美化的信息展示 -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
                <!-- 点击预览提示 -->
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="transform transition-all duration-500 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100">
                    <div class="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-2 border-white/50 shadow-2xl">
                      <span class="text-4xl">🔍</span>
                    </div>
                    <p class="text-white text-sm font-medium mt-3 text-center">点击放大预览</p>
                  </div>
                </div>
                
                <!-- 底部信息栏 -->
                <div class="absolute bottom-0 left-0 right-0 p-6">
                  <div class="flex items-end justify-between">
                    <div class="flex-1 min-w-0 mr-4">
                      <div class="flex items-center gap-2 mb-2">
                        <span class="px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-sm rounded-full font-medium">
                          {{ it.model }}
                        </span>
                        <span class="px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-sm rounded-full font-medium">
                          {{ it.aspect_ratio }}
                        </span>
                      </div>
                      <p v-if="it.prompt" class="text-white text-sm font-medium line-clamp-2 mb-1">
                        {{ it.prompt }}
                      </p>
                      <p class="text-white/80 text-xs">
                        {{ new Date(it.created * 1000).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                      </p>
                    </div>
                    
                    <!-- 操作按钮 -->
                    <div class="flex gap-2 flex-shrink-0">
                      <button 
                        @click.stop="download(it.url, `${it.model}_${it.created}.png`)"
                        class="w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-xl flex items-center justify-center transition-all hover:scale-110 shadow-lg border border-white/30"
                        title="下载图片"
                      >
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 多张图片网格展示 -->
        <div v-else class="grid gap-3" 
          :class="{
            'grid-cols-1 md:grid-cols-2 xl:grid-cols-3': layoutMode === 'comfortable',
            'grid-cols-1 md:grid-cols-2 xl:grid-cols-4': layoutMode === 'widescreen',
            'grid-cols-1 md:grid-cols-3 xl:grid-cols-4': layoutMode === 'vertical'
          }">
          <div 
            v-for="(it, idx) in items" 
            :key="it.id"
            class="card overflow-hidden group transition-all duration-300 hover:shadow-lg"
            :class="{ 'hover:scale-[1.02] cursor-pointer': it.status === 'completed' }"
            @click="() => { if (it.status === 'completed') openImageModal(it, idx) }"
          >
            <!-- 处理中状态 -->
            <div v-if="it.status === 'pending' || it.status === 'processing'" class="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-700 dark:to-dark-600">
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <!-- 队列中状态 -->
                <div v-if="it.queue_status === 'queued'" class="text-center">
                  <div class="text-4xl mb-3">⏳</div>
                  <p class="text-slate-600 dark:text-slate-400 text-xs font-semibold">排队中...</p>
                  <p class="text-slate-500 dark:text-slate-500 text-xs mt-1.5">
                    队列位置: <span class="font-semibold text-primary-600 dark:text-primary-400">第 {{ it.queue_position }} 位</span>
                  </p>
                  <p class="text-slate-500 dark:text-slate-500 text-xs mt-1 opacity-75">系统繁忙，请稍候</p>
                </div>
                <!-- 生成中状态 -->
                <div v-else class="text-center">
                  <svg class="animate-spin h-10 w-10 text-primary-500 mb-3 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p class="text-slate-600 dark:text-slate-400 text-xs font-semibold">正在生成中...</p>
                  <p class="text-slate-500 dark:text-slate-500 text-xs mt-1.5 opacity-75">可以继续创作新图片</p>
                </div>
              </div>
            </div>
            
            <!-- 失败/超时状态 -->
            <div v-else-if="it.status === 'failed' || it.status === 'timeout'" class="relative aspect-video bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
              <div class="absolute inset-0 flex flex-col items-center justify-center p-3">
                <div class="text-3xl mb-2">{{ it.status === 'timeout' ? '⏰' : '❌' }}</div>
                <p class="text-red-600 dark:text-red-400 text-xs font-semibold text-center">{{ it.status === 'timeout' ? '生成超时' : '生成失败' }}</p>
                <p class="text-red-500 dark:text-red-500 text-xs mt-1.5 text-center opacity-75">{{ it.error || (it.status === 'timeout' ? '请重试' : '请稍后重试') }}</p>
                <p class="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">✓ 未扣除积分</p>
              </div>
            </div>
            
            <!-- 完成状态 -->
            <div v-else class="relative overflow-hidden aspect-video">
              <CachedImage 
                :src="it.url" 
                :thumbnail-src="it.thumbnail_url"
                :alt="`生成图像 ${idx}`" 
                progressive
                img-class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                <div class="text-white text-xs">
                  <p class="font-semibold">{{ it.model }}</p>
                  <p class="text-xs opacity-90 mt-0.5">{{ new Date(it.created * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</p>
                </div>
              </div>
            </div>
            
            <div class="p-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center flex-wrap gap-1.5 text-xs">
                  <span class="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full font-medium">
                    {{ it.size }}
                  </span>
                  <span class="px-2 py-0.5 bg-slate-100 dark:bg-dark-600 rounded-full text-slate-600 dark:text-slate-400 font-medium">
                    {{ it.aspect_ratio }}
                  </span>
                  <span v-if="it.status === 'pending' || it.status === 'processing'" class="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full animate-pulse font-medium">
                    处理中
                  </span>
                  <span v-else-if="it.status === 'failed' || it.status === 'timeout'" class="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full font-medium">
                    {{ it.status === 'timeout' ? '超时' : '失败' }}
                  </span>
                </div>
                <button 
                  v-if="it.status === 'completed'"
                  @click.stop="download(it.url, `${it.model}_${it.created}.png`)"
                  class="btn-secondary text-xs py-1.5 px-2.5 hover:scale-105 transition-transform duration-200"
                  title="下载图片"
                >
                  💾
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧历史记录抽屉 -->
    <div :class="layoutMode !== 'vertical' ? historyColsClass : 'hidden'">
      <!-- 抽屉触发按钮（收起时显示） - 右侧居中 -->
      <div 
        v-if="!isHistoryDrawerOpen"
        class="fixed right-0 top-1/2 -translate-y-1/2 z-40"
      >
        <button
          @click="toggleHistoryDrawer"
          class="relative bg-gradient-to-br from-primary-500 to-primary-600 text-white px-3 py-6 rounded-l-xl shadow-2xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 group"
        >
          <div class="flex flex-col items-center space-y-2">
            <span class="text-xl">📚</span>
            <span class="text-xs font-medium writing-vertical-rl">历史</span>
            <span class="text-xs">{{ history.length }}</span>
          </div>
          
          <!-- 未读消息徽章 -->
          <div 
            v-if="unreadCount > 0"
            class="absolute -top-2 -left-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce shadow-lg"
          >
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </div>
        </button>
      </div>

      <!-- 抽屉内容 -->
      <div 
        class="fixed right-0 bg-white dark:bg-dark-800 shadow-2xl transition-transform duration-500 ease-out z-40 flex flex-col"
        :class="isHistoryDrawerOpen ? 'translate-x-0' : 'translate-x-full'"
        style="width: min(360px, 90vw); top: 64px; height: calc(100vh - 64px);"
      >
        <!-- 抽屉头部 -->
        <div class="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-dark-600 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20">
          <h3 class="text-base font-bold gradient-text flex items-center">
            <span class="mr-1.5">🕐</span>
            <span>历史记录</span>
            <span class="ml-2 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-xs font-semibold">
              {{ history.length }}
            </span>
          </h3>
          
          <button
            @click="toggleHistoryDrawer"
            class="w-7 h-7 bg-white/50 dark:bg-dark-700 hover:bg-white dark:hover:bg-dark-600 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all duration-200 shadow-sm"
            title="收起"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>

        <!-- 抽屉内容区（可滚动） -->
        <div class="flex-1 overflow-y-auto p-3 custom-scrollbar">
          <!-- 未登录提示 -->
          <div v-if="!me" class="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div class="flex items-start space-x-2">
              <span class="text-lg">⚠️</span>
              <div class="flex-1 text-xs">
                <p class="font-semibold text-amber-800 dark:text-amber-300 mb-1">需要登录</p>
                <p class="text-amber-700 dark:text-amber-400">登录后才能保存和查看历史记录哦～</p>
              </div>
            </div>
          </div>
          
          <!-- 空状态 -->
          <div v-if="history.length === 0" class="text-center py-12">
            <div class="text-4xl mb-3">📭</div>
            <p class="text-xs text-slate-500 dark:text-slate-400">暂无历史记录</p>
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-1.5">生成的图片会自动保存在这里</p>
          </div>
          
          <!-- 历史记录列表 -->
          <div v-else class="space-y-2.5">
            <div 
              v-for="(h, idx) in history" 
              :key="h.id"
              class="group rounded-lg overflow-hidden transition-all duration-300 hover:shadow-md border border-transparent hover:border-primary-200 dark:hover:border-primary-800"
              :class="h.status === 'completed' ? 'cursor-pointer' : ''"
              @click="h.status === 'completed' && openHistoryImage(h, idx)"
            >
              <!-- 处理中状态 -->
              <div v-if="h.status === 'pending' || h.status === 'processing'" class="relative overflow-hidden aspect-video bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-700 dark:to-dark-600">
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <!-- 队列中状态 -->
                  <div v-if="h.queue_status === 'queued'" class="text-center px-2">
                    <div class="text-2xl mb-2">⏳</div>
                    <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold">排队中</p>
                    <p class="text-xs text-slate-500 dark:text-slate-500 mt-1">
                      第 <span class="font-semibold text-primary-600 dark:text-primary-400">{{ h.queue_position }}</span> 位
                    </p>
                  </div>
                  <!-- 生成中状态 -->
                  <div v-else class="text-center">
                    <svg class="animate-spin h-7 w-7 text-primary-500 mb-2 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold">生成中...</p>
                  </div>
                </div>
              </div>
              
              <!-- 失败/超时状态 -->
              <div v-else-if="h.status === 'failed' || h.status === 'timeout'" class="relative overflow-hidden">
                <!-- 失败图标区域 -->
                <div class="aspect-video bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 group relative">
                  <div class="absolute inset-0 flex flex-col items-center justify-center p-3">
                    <div class="text-2xl mb-1">{{ h.status === 'timeout' ? '⏰' : '❌' }}</div>
                    <p class="text-xs text-red-600 dark:text-red-400 font-semibold">{{ h.status === 'timeout' ? '生成超时' : '生成失败' }}</p>
                    <p v-if="h.error" class="text-xs text-red-500 dark:text-red-400 mt-1 text-center line-clamp-2 px-2">{{ h.error }}</p>
                    <p class="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">✓ 未扣除积分</p>
                  </div>
                  <!-- 失败状态的操作按钮 - 右下角小按钮 -->
                  <div class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      @click.stop="regenerateFromHistory(h)"
                      class="w-7 h-7 bg-green-500/80 hover:bg-green-600 backdrop-blur-sm text-white rounded-lg flex items-center justify-center transition-all transform hover:scale-105 shadow-md"
                      title="再次生成"
                    >
                      🔄
                    </button>
                    <button 
                      @click.stop="deleteHistoryImage(h)"
                      class="w-7 h-7 bg-red-500/80 hover:bg-red-600 backdrop-blur-sm text-white rounded-lg flex items-center justify-center transition-all transform hover:scale-105 shadow-md"
                      title="删除失败记录"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <!-- 失败状态的信息栏 -->
                <div class="p-2.5 bg-slate-50 dark:bg-dark-700">
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex-1 truncate min-w-0">
                      <p class="text-slate-600 dark:text-slate-400 font-semibold text-xs">
                        {{ new Date(h.created * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                      </p>
                      <p class="text-slate-500 dark:text-slate-500 text-xs mt-0.5 truncate" v-if="h.prompt">
                        {{ h.prompt }}
                      </p>
                    </div>
                    <div class="flex items-center gap-1 ml-2 flex-shrink-0">
                      <!-- 再次生成按钮 -->
                      <button 
                        @click.stop="regenerateFromHistory(h)"
                        class="w-7 h-7 flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-all hover:scale-105"
                        title="再次生成"
                      >
                        🔄
                      </button>
                      <!-- 删除按钮 -->
                      <button 
                        @click.stop="deleteHistoryImage(h)"
                        class="w-7 h-7 flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all hover:scale-105"
                        title="删除记录"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <!-- 标签和星标 -->
                  <div class="flex items-center justify-between mt-1.5">
                    <div class="flex items-center gap-1">
                      <span class="px-1.5 py-0.5 bg-slate-200 dark:bg-dark-600 text-slate-600 dark:text-slate-400 rounded text-xs font-medium">
                        {{ h.size || '未知' }}
                      </span>
                      <span class="px-1.5 py-0.5 bg-slate-200 dark:bg-dark-600 text-slate-600 dark:text-slate-400 rounded text-xs font-medium">
                        {{ h.aspect_ratio || '未知' }}
                      </span>
                    </div>
                    <!-- 快捷星标 -->
                    <div class="flex items-center gap-0.5" @click.stop>
                      <button 
                        v-for="star in 5" 
                        :key="star"
                        @click="updateImageRating(h, h.rating === star ? 0 : star)"
                        class="text-sm transition-all hover:scale-125"
                        :class="star <= (h.rating || 0) ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-600 hover:text-yellow-300'"
                        :title="`${star}星`"
                      >
                        ★
                      </button>
                    </div>
                  </div>
                  
                  <!-- 快捷备注 -->
                  <div class="mt-1.5" @click.stop>
                    <input
                      type="text"
                      :value="h.note || ''"
                      @blur="(e) => updateImageNote(h, e.target.value)"
                      @keyup.enter="(e) => { updateImageNote(h, e.target.value); e.target.blur() }"
                      placeholder="添加备注（如分镜信息）..."
                      class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                    />
                  </div>
                </div>
              </div>
              
              <!-- 完成状态 -->
              <div v-else-if="h.status === 'completed'" class="relative overflow-hidden">
                <!-- 图片区域 - 点击放大 -->
                <div 
                  class="aspect-video relative cursor-pointer"
                  @click.stop="openHistoryImage(h, idx)"
                >
                  <!-- 🔧 历史列表使用 IndexedDB 缓存，加速二次加载 -->
                  <CachedImage 
                    :src="getQiniuThumbnailUrl(h.url) || h.url" 
                    :placeholder="makePlaceholderImage(h)"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    :alt="h.prompt || '历史图片'"
                    @error="(e) => { e.target.src = makePlaceholderImage(h) }"
                  />
                  
                  <!-- 悬停遮罩 - 点击预览 -->
                  <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div class="absolute inset-0 flex items-center justify-center">
                      <button
                        @click.stop="openHistoryImage(h, idx)"
                        class="w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white text-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-105 shadow-xl border border-white/30"
                        title="放大预览"
                      >
                        🔍
                      </button>
                    </div>
                  </div>
                  
                  <!-- 快速操作按钮组 - 右上角 -->
                  <div class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <!-- 发送到图生视频 -->
                    <button 
                      @click.stop="sendToVideoGeneration(h)"
                      class="w-7 h-7 bg-pink-500/80 hover:bg-pink-600 backdrop-blur-sm text-white rounded-lg flex items-center justify-center transition-all transform hover:scale-105 shadow-md"
                      title="发送到图生视频"
                    >
                      🎬
                    </button>
                    <!-- 添加到图生图 -->
                    <button 
                      @click.stop="loadImageToImg2Img(h)"
                      class="w-7 h-7 bg-purple-500/80 hover:bg-purple-600 backdrop-blur-sm text-white rounded-lg flex items-center justify-center transition-all transform hover:scale-105 shadow-md"
                      title="添加到图生图"
                    >
                      🖼️
                    </button>
                    <!-- 快速删除 -->
                    <button 
                      @click.stop="deleteHistoryImage(h)"
                      class="w-7 h-7 bg-red-500/80 hover:bg-red-600 backdrop-blur-sm text-white rounded-lg flex items-center justify-center transition-all transform hover:scale-105 shadow-md"
                      title="删除记录"
                    >
                      🗑️
                    </button>
                    <!-- 快速下载 -->
                    <button 
                      @click.stop="downloadHistoryImage(h)"
                      class="w-7 h-7 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-lg flex items-center justify-center transition-all transform hover:scale-105 shadow-md"
                      title="快速下载"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <!-- 信息栏 -->
                <div class="p-2.5 bg-slate-50 dark:bg-dark-700">
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex-1 truncate min-w-0">
                      <p class="text-slate-600 dark:text-slate-400 font-semibold text-xs">
                        {{ new Date(h.created * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                      </p>
                      <p class="text-slate-500 dark:text-slate-500 text-xs mt-0.5 truncate" v-if="h.prompt">
                        {{ h.prompt }}
                      </p>
                    </div>
                    <div class="flex items-center gap-1 ml-2 flex-shrink-0">
                      <!-- 再次生成按钮 -->
                      <button 
                        @click.stop="regenerateFromHistory(h)"
                        class="w-7 h-7 flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-all hover:scale-105"
                        title="再次生成"
                      >
                        🔄
                      </button>
                      <!-- 发送到图生视频按钮 -->
                      <button 
                        @click.stop="sendToVideoGeneration(h)"
                        class="w-7 h-7 flex items-center justify-center bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-lg hover:bg-pink-200 dark:hover:bg-pink-900/50 transition-all hover:scale-105"
                        title="发送到图生视频"
                      >
                        🎬
                      </button>
                      <!-- 添加到图生图按钮 -->
                      <button 
                        @click.stop="loadImageToImg2Img(h)"
                        class="w-7 h-7 flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-all hover:scale-105"
                        title="添加到图生图"
                      >
                        🖼️
                      </button>
                      <!-- 下载按钮 -->
                      <button 
                        @click.stop="downloadHistoryImage(h)"
                        class="w-7 h-7 flex items-center justify-center bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all hover:scale-105"
                        title="下载"
                      >
                        💾
                      </button>
                      <!-- 删除按钮 -->
                      <button 
                        @click.stop="deleteHistoryImage(h)"
                        class="w-7 h-7 flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all hover:scale-105"
                        title="删除记录"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <!-- 标签和星标 -->
                  <div class="flex items-center justify-between mt-1.5">
                    <div class="flex items-center gap-1">
                      <span class="px-1.5 py-0.5 bg-slate-200 dark:bg-dark-600 text-slate-600 dark:text-slate-400 rounded text-xs font-medium">
                        {{ h.size }}
                      </span>
                      <span class="px-1.5 py-0.5 bg-slate-200 dark:bg-dark-600 text-slate-600 dark:text-slate-400 rounded text-xs font-medium">
                        {{ h.aspect_ratio }}
                      </span>
                    </div>
                    <!-- 快捷星标 -->
                    <div class="flex items-center gap-0.5" @click.stop>
                      <button 
                        v-for="star in 5" 
                        :key="star"
                        @click="updateImageRating(h, h.rating === star ? 0 : star)"
                        class="text-sm transition-all hover:scale-125"
                        :class="star <= (h.rating || 0) ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-600 hover:text-yellow-300'"
                        :title="`${star}星`"
                      >
                        ★
                      </button>
                    </div>
                  </div>
                  
                  <!-- 快捷备注 -->
                  <div class="mt-1.5" @click.stop>
                    <input
                      type="text"
                      :value="h.note || ''"
                      @blur="(e) => updateImageNote(h, e.target.value)"
                      @keyup.enter="(e) => { updateImageNote(h, e.target.value); e.target.blur() }"
                      placeholder="添加备注（如分镜信息）..."
                      class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                    />
                  </div>
                </div>
              </div>
              
              <!-- 未知状态 -->
              <div v-else class="relative overflow-hidden aspect-video bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-700 dark:to-dark-600">
                <div class="absolute inset-0 flex flex-col items-center justify-center p-4">
                  <div class="text-3xl mb-2">⏳</div>
                  <p class="text-sm text-slate-600 dark:text-slate-400 font-medium">等待中...</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 抽屉底部 -->
        <div class="p-3 border-t border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700/50">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>共 {{ history.length }} 条</span>
            <span>保留7天</span>
          </div>
        </div>
      </div>

      <!-- 遮罩层（移动端） -->
      <div 
        v-if="isHistoryDrawerOpen"
        class="fixed bg-black/20 backdrop-blur-sm z-30 lg:hidden"
        style="top: 64px; left: 0; right: 0; bottom: 0;"
        @click="toggleHistoryDrawer"
      ></div>
    </div>
  </div>
  </div>

  <!-- 图片预览模态框 - 全屏无边框设计 -->
  <div 
    v-if="showImageModal && currentImage" 
    class="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm"
    @click.self="closeModal"
    @wheel="handleWheel"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
  >
    <!-- 关闭按钮 -->
    <button 
      @click="closeModal"
      class="fixed top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-2xl transition-all duration-200 shadow-xl hover:scale-110 z-50 border border-white/20"
      title="关闭 (ESC)"
    >
      ✕
    </button>

    <!-- 上一张按钮 -->
    <button 
      v-if="currentImageIndex > 0"
      @click="prevImage"
      class="fixed left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-2xl transition-all duration-200 shadow-xl hover:scale-110 z-50 border border-white/20"
      title="上一张 (←)"
    >
      ←
    </button>

    <!-- 下一张按钮 -->
    <button 
      v-if="currentImageIndex < (isViewingReference ? previewUrls.length : (isViewingHistory ? history.filter(h => h.status === 'completed').length : items.filter(i => i.status === 'completed').length)) - 1"
      @click="nextImage"
      class="fixed right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-2xl transition-all duration-200 shadow-xl hover:scale-110 z-50 border border-white/20"
      title="下一张 (→)"
    >
      →
    </button>

    <!-- 缩放控制按钮 -->
    <div class="fixed top-6 left-6 flex flex-col space-y-2 z-50">
      <button 
        @click="imageScale = Math.min(5, imageScale + 0.2)"
        class="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-xl font-bold transition-all duration-200 shadow-xl hover:scale-110 border border-white/20"
        title="放大 (滚轮向上)"
      >
        +
      </button>
      <button 
        @click="resetImageTransform"
        class="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-sm font-semibold transition-all duration-200 shadow-xl hover:scale-110 border border-white/20"
        title="重置"
      >
        1:1
      </button>
      <button 
        @click="imageScale = Math.max(0.5, imageScale - 0.2)"
        class="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-xl font-bold transition-all duration-200 shadow-xl hover:scale-110 border border-white/20"
        title="缩小 (滚轮向下)"
      >
        −
      </button>
      <!-- 缩放比例显示 -->
      <div class="w-12 h-auto px-2 py-1 bg-white/10 backdrop-blur-md rounded-lg flex items-center justify-center text-white text-xs font-medium shadow-xl border border-white/20">
        {{ Math.round(imageScale * 100) }}%
      </div>
    </div>

    <!-- 图片容器 - 全屏无边框 -->
    <div class="fixed inset-0 flex items-center justify-center overflow-hidden">
      <img 
        :src="currentImage.url" 
        class="max-w-none transition-transform duration-100 select-none"
        :style="{
          transform: `scale(${imageScale}) translate(${imageTranslate.x / imageScale}px, ${imageTranslate.y / imageScale}px)`,
          cursor: isDraggingImage ? 'grabbing' : 'grab',
          maxHeight: '100vh',
          maxWidth: '100vw'
        }"
        @mousedown="handleMouseDown"
        @click.stop
        @dragstart.prevent
        :alt="currentImage.prompt || '预览图片'"
      />
    </div>

    <!-- 底部信息栏 - 悬浮在图片上，仅鼠标移到底部时显示 -->
    <div 
      class="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent backdrop-blur-md transition-transform duration-300 z-40"
      :class="isDraggingImage ? 'translate-y-full' : 'translate-y-0'"
      @mouseenter="() => {}"
    >
      <div class="px-8 py-6 max-w-7xl mx-auto">
        <!-- 图片元数据 - 单行显示 -->
        <div class="flex flex-wrap items-center gap-3 mb-3 text-sm text-white/90">
          <div class="flex items-center space-x-2">
            <span class="text-white/60">📱</span>
            <span class="font-medium">{{ currentImage.model }}</span>
          </div>
          <div class="w-px h-4 bg-white/30"></div>
          <div class="flex items-center space-x-2">
            <span class="text-white/60">📐</span>
            <span class="font-medium">{{ currentImage.size }} · {{ currentImage.aspect_ratio }}</span>
          </div>
          <div class="w-px h-4 bg-white/30"></div>
          <div class="flex items-center space-x-2">
            <span class="text-white/60">🕐</span>
            <span class="font-medium">{{ new Date(currentImage.created * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
          </div>
          <div class="w-px h-4 bg-white/30"></div>
          <div class="flex items-center space-x-2">
            <span class="text-white/60">📍</span>
            <span class="font-medium">{{ currentImageIndex + 1 }} / {{ (isViewingReference ? previewUrls.length : (isViewingHistory ? history.filter(h => h.status === 'completed').length : items.filter(i => i.status === 'completed').length)) }}</span>
          </div>
          <div class="flex-1"></div>
          <!-- 下载按钮 - 右侧 -->
          <button 
            @click="download(currentImage.url, `${currentImage.model}_${currentImage.created}.png`)"
            class="px-6 py-2 bg-blue-500/90 hover:bg-blue-600 backdrop-blur-sm text-white font-semibold rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            <span>下载</span>
          </button>
        </div>
        
        <!-- 提示词 - 单行显示，超出滚动 -->
        <div v-if="currentImage.prompt" class="flex items-center space-x-3">
          <span class="text-white/60 text-xs flex-shrink-0">💬 提示词:</span>
          <p class="text-white text-sm truncate flex-1">{{ currentImage.prompt }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- 兑换券模态框 -->
  <div v-if="showVoucherModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeVoucherModal">
    <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
      <div class="p-6 border-b border-slate-200 dark:border-dark-600">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold gradient-text">🎫 兑换券</h3>
          <button @click="closeVoucherModal" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            兑换码
          </label>
          <input 
            v-model="voucherCode"
            type="text"
            class="input w-full uppercase"
            placeholder="请输入13位兑换码"
            maxlength="13"
            :disabled="voucherLoading"
            @keyup.enter="submitVoucher"
          />
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            兑换码为13位大写字母和数字组合
          </p>
        </div>
        
        <div v-if="voucherError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p class="text-sm text-red-600 dark:text-red-400">{{ voucherError }}</p>
        </div>
        
        <div v-if="voucherSuccess" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p class="text-sm text-green-600 dark:text-green-400">{{ voucherSuccess }}</p>
        </div>
      </div>
      
      <div v-if="me" class="p-4 bg-gradient-to-r from-slate-50 to-purple-50 dark:from-dark-600 dark:to-purple-900/20 rounded-lg mx-6 mb-6 border border-slate-200 dark:border-dark-500">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600 dark:text-slate-400">套餐积分</span>
            <span class="font-semibold text-purple-600 dark:text-purple-400">{{ me.package_points || 0 }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600 dark:text-slate-400">永久积分</span>
            <span class="font-semibold text-amber-600 dark:text-amber-400">{{ me.points || 0 }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600 dark:text-slate-400">当前余额</span>
            <span class="font-semibold text-green-600 dark:text-green-400">¥{{ ((me.balance || 0) / 100).toFixed(2) }}</span>
          </div>
          <div class="pt-2 border-t border-slate-200 dark:border-dark-500 flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-500">积分总计</span>
            <span class="text-lg font-bold gradient-text">{{ (me.package_points || 0) + (me.points || 0) }}</span>
          </div>
        </div>
      </div>
      
      <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-between items-center">
        <!-- 外部链接按钮 - 左下角 -->
        <div v-if="externalLinkConfig.enabled && externalLinkConfig.url">
          <a 
            :href="externalLinkConfig.url"
            :target="externalLinkConfig.open_in_new_tab ? '_blank' : '_self'"
            :rel="externalLinkConfig.open_in_new_tab ? 'noopener noreferrer' : ''"
            class="inline-flex items-center px-3 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
          >
            <span class="mr-1.5">🔗</span>
            <span>{{ externalLinkConfig.button_text || '获取兑换券' }}</span>
            <svg v-if="externalLinkConfig.open_in_new_tab" class="w-3.5 h-3.5 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </a>
        </div>
        
        <!-- 操作按钮 - 右侧 -->
        <div class="flex space-x-3">
          <button 
            @click="closeVoucherModal"
            class="btn-secondary"
            :disabled="voucherLoading"
          >
            取消
          </button>
          <button 
            @click="submitVoucher"
            class="btn-primary"
            :disabled="voucherLoading || !voucherCode.trim()"
          >
            <span v-if="voucherLoading">兑换中...</span>
            <span v-else>立即兑换</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义滚动条样式 */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.5);
}

/* Firefox 滚动条 */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(99, 102, 241, 0.3) rgba(0, 0, 0, 0.05);
}

/* 竖排文字 */
.writing-vertical-rl {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

/* 抽屉入场动画 */
@keyframes slideInFromRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* 未读徽章动画 */
@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.animate-bounce {
  animation: bounce 1s infinite, pulse-ring 2s infinite;
}

/* 布局过渡动画 */
.grid {
  transition: all 0.3s ease-in-out;
}

/* 宽屏模式下的卡片优化 */
.card {
  transition: padding 0.3s ease;
}
</style>
