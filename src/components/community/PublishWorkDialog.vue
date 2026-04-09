<script setup>
/**
 * PublishWorkDialog.vue - 发布作品到社区
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useCommunityStore } from '@/stores/community'
import { publishWork, getPlatformFeeRate, getUploadConfig } from '@/api/community'
import { getWorkflowList } from '@/api/canvas/workflow'
import { getProjectList } from '@/api/canvas/project'
import { uploadImages } from '@/api/client'
import { compressImage } from '@/utils/imageCompress'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  workflowId: { type: String, default: '' },
  workflowName: { type: String, default: '' },
  workflowUid: { type: String, default: '' },
  projectId: { type: [String, Number], default: '' },
  projectName: { type: String, default: '' },
  initialCoverUrl: { type: String, default: '' },
  initialMediaUrl: { type: String, default: '' },
  initialMediaType: { type: String, default: '' },
  initialOrientation: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'published'])

const communityStore = useCommunityStore()

const coverInput = ref(null)
const workInput = ref(null)

const SUPPORTED_MEDIA_TYPES = ['image', 'video']

function inferMediaTypeFromFile(file) {
  if (!file?.type) return ''
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return ''
}

function inferMediaTypeFromUrl(url = '') {
  if (!url || typeof url !== 'string') return ''
  const normalizedUrl = url.split('?')[0].toLowerCase()
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(normalizedUrl)) return 'video'
  if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/.test(normalizedUrl)) return 'image'
  return ''
}

function normalizeMediaType(type = '') {
  return SUPPORTED_MEDIA_TYPES.includes(type) ? type : ''
}

async function uploadWorkMedia(file, { onProgress, timeout = 120000 } = {}) {
  const mediaType = inferMediaTypeFromFile(file)
  if (!mediaType) {
    throw new Error('请上传图片或视频文件')
  }

  if (mediaType === 'image') {
    return uploadImages([file], { onProgress, timeout })
  }

  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('token')

  if (onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', getApiUrl('/api/videos/upload'))

      const headers = getTenantHeaders()
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.timeout = timeout
      xhr.ontimeout = () => reject(new Error('upload_timeout'))
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percent: Math.round(e.loaded / e.total * 100) })
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const j = JSON.parse(xhr.responseText)
            const url = j.url || j.urls?.[0]
            resolve(url ? [url] : [])
          } catch {
            reject(new Error('parse_error'))
          }
        } else {
          reject(new Error('upload_failed'))
        }
      }

      xhr.onerror = () => reject(new Error('upload_failed'))
      xhr.send(formData)
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(getApiUrl('/api/videos/upload'), {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || err.message || 'upload_failed')
    }

    const result = await response.json()
    const url = result.url || result.urls?.[0]
    return url ? [url] : []
  } catch (e) {
    clearTimeout(timeoutId)
    if (e.name === 'AbortError') throw new Error('upload_timeout')
    throw e
  }
}

// 表单
const title = ref('')
const description = ref('')
const selectedWorkflowId = ref('')
const selectedTags = ref([])
const selectedCategory = ref('')
const shareMode = ref('free') // 'free' | 'paid'
const orientation = ref('') // 'landscape' | 'portrait'
const isAnonymous = ref(false)
const price = ref(10)
const loading = ref(false)
const error = ref('')
const feeRate = ref(0)

// 文件上传
const coverFile = ref(null)
const coverPreview = ref('')
const workFile = ref(null)
const workPreview = ref('')
const workMediaType = ref('')
const isDraggingCover = ref(false)
const isDraggingWork = ref(false)
const uploadProgress = ref(0)
const uploadType = ref('video')
const workFiles = ref([])
const workPreviews = ref([])
const MAX_IMAGE_COUNT = 9

const MAX_VIDEO_SIZE = 500 * 1024 * 1024
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

// 工作流列表（支持个人空间 + 团队空间分组）
const workflowGroups = ref([])
const loadingWorkflows = ref(false)

// 关联项目
const linkProject = ref(false)
const selectedProjectId = ref('')
const projects = ref([])
const projectWorkflowCount = ref(0)
const projectDropdownOpen = ref(false)
const workflowDropdownOpen = ref(false)

const selectedWorkflowName = computed(() => {
  if (!selectedWorkflowId.value) return ''
  const allWfs = workflowGroups.value.flatMap(g => g.workflows)
  const found = allWfs.find(w => w.id === selectedWorkflowId.value)
  return found ? `${found.name} (${found.workflow_uid || found.id.slice(0, 8)})` : '已选择'
})

function toggleWorkflowDropdown() {
  workflowDropdownOpen.value = !workflowDropdownOpen.value
}

function selectWorkflow(id) {
  selectedWorkflowId.value = id
  workflowDropdownOpen.value = false
}

const selectedProjectName = computed(() => {
  if (!selectedProjectId.value) return props.projectName || '选择项目'
  const proj = projects.value.find(p => p.id === selectedProjectId.value || String(p.id) === String(selectedProjectId.value))
  return proj ? `${proj.name} (${proj.workflow_count || 0} 个工作流)` : (props.projectName || '选择项目')
})

function selectProject(id) {
  selectedProjectId.value = id
  projectDropdownOpen.value = false
}

function toggleProjectDropdown() {
  projectDropdownOpen.value = !projectDropdownOpen.value
}

function onDocClick(e) {
  if (!e.target.closest('.project-dropdown-wrapper')) {
    projectDropdownOpen.value = false
  }
  if (!e.target.closest('.workflow-dropdown-wrapper')) {
    workflowDropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

const descCount = computed(() => description.value.length)

watch(selectedProjectId, (id) => {
  const proj = projects.value.find(p => p.id === id)
  projectWorkflowCount.value = proj?.workflow_count || 0
})

watch(linkProject, (checked) => {
  if (checked) {
    selectedWorkflowId.value = ''
  } else {
    selectedProjectId.value = ''
    projectWorkflowCount.value = 0
    if (props.workflowId) {
      selectedWorkflowId.value = props.workflowId
    }
  }
})

watch(() => props.modelValue, async (v) => {
  if (v) {
    error.value = ''
    title.value = props.workflowName || ''
    selectedWorkflowId.value = props.workflowId || ''
    selectedTags.value = []
    selectedCategory.value = ''
    shareMode.value = 'free'
    orientation.value = props.initialOrientation || ''
    isAnonymous.value = false
    price.value = 10
    coverFile.value = null
    coverPreview.value = props.initialCoverUrl || ''
    workFile.value = null
    workPreview.value = props.initialMediaUrl || ''
    workMediaType.value = normalizeMediaType(props.initialMediaType) || inferMediaTypeFromUrl(props.initialMediaUrl)
    description.value = ''
    isDraggingCover.value = false
    isDraggingWork.value = false
    uploadProgress.value = 0
    workFiles.value = []
    workPreviews.value = []
    linkProject.value = false
    selectedProjectId.value = props.projectId || ''
    projects.value = []
    projectWorkflowCount.value = 0
    projectDropdownOpen.value = false
    workflowDropdownOpen.value = false

    // 加载平台抽佣比例
    try {
      const feeRes = await getPlatformFeeRate()
      feeRate.value = feeRes?.data?.fee_rate ?? 0.1
    } catch (e) {
      feeRate.value = 0.1
    }

    // 加载上传类型配置
    try {
      const configRes = await getUploadConfig()
      uploadType.value = configRes?.data?.upload_type || 'video'
    } catch (e) {
      uploadType.value = 'video'
    }

    // 加载分类和标签
    if (communityStore.categories.length === 0) communityStore.loadCategories()
    if (communityStore.tags.length === 0) communityStore.loadTags()

    // 加载用户项目列表
    try {
      const result = await getProjectList()
      projects.value = result.data || []
      if (selectedProjectId.value) {
        const matchedProject = projects.value.find(p => String(p.id) === String(selectedProjectId.value))
        if (!matchedProject) {
          selectedProjectId.value = ''
          linkProject.value = false
        }
      }
    } catch (e) {
      console.error('[Publish] 加载项目列表失败:', e)
    }

    // 加载用户工作流列表供选择
    await loadWorkflows()
  }
})

async function loadWorkflows() {
  loadingWorkflows.value = true
  try {
    const groups = []
    const currentWfId = props.workflowId
    let currentWf = null

    const personalResult = await getWorkflowList({ page: 1, pageSize: 100, spaceType: 'personal' })
    const personalWfs = personalResult.list || personalResult.workflows || personalResult.data || []

    if (currentWfId) {
      const idx = personalWfs.findIndex(wf => wf.id === currentWfId)
      if (idx >= 0) {
        currentWf = personalWfs.splice(idx, 1)[0]
      }
    }

    if (personalWfs.length) {
      groups.push({ label: t('team.personalSpace'), workflows: personalWfs })
    }

    try {
      const token = localStorage.getItem('token')
      const teamsRes = await fetch(getApiUrl('/api/teams'), {
        headers: { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json()
        const teams = teamsData.teams || []
        for (const team of teams) {
          try {
            const teamResult = await getWorkflowList({ page: 1, pageSize: 100, spaceType: 'team', teamId: team.id })
            const teamWfs = teamResult.list || teamResult.workflows || teamResult.data || []

            if (currentWfId && !currentWf) {
              const idx = teamWfs.findIndex(wf => wf.id === currentWfId)
              if (idx >= 0) {
                currentWf = teamWfs.splice(idx, 1)[0]
              }
            }

            if (teamWfs.length) {
              groups.push({ label: `团队: ${team.name}`, teamId: team.id, workflows: teamWfs })
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error('[PublishDialog] 加载团队工作流失败:', e)
    }

    if (currentWf) {
      groups.unshift({ label: '当前工作流', workflows: [currentWf] })
    }

    workflowGroups.value = groups
  } catch (e) {
    console.error('[PublishDialog] 加载工作流列表失败:', e)
  } finally {
    loadingWorkflows.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function validateWorkFile(file) {
  const mediaType = inferMediaTypeFromFile(file)

  if (uploadType.value === 'image') {
    if (mediaType !== 'image') {
      error.value = '当前仅支持上传图片文件'
      return false
    }
    if (file.size > MAX_IMAGE_SIZE) {
      error.value = '图片文件不能超过 10MB'
      return false
    }
    return true
  }

  if (uploadType.value === 'video') {
    if (mediaType !== 'video') {
      error.value = '作品仅支持上传视频文件（MP4、MOV、WebM）'
      return false
    }
    if (file.size > MAX_VIDEO_SIZE) {
      error.value = `视频文件不能超过 500MB，当前文件 ${(file.size / 1024 / 1024).toFixed(1)}MB`
      return false
    }
    return true
  }

  // both
  if (!mediaType) {
    error.value = '请上传图片或视频文件'
    return false
  }
  if (mediaType === 'video' && file.size > MAX_VIDEO_SIZE) {
    error.value = '视频文件不能超过 500MB'
    return false
  }
  if (mediaType === 'image' && file.size > MAX_IMAGE_SIZE) {
    error.value = '图片文件不能超过 10MB'
    return false
  }
  return true
}

// 封面上传
async function handleCoverChange(e) {
  const file = e instanceof File ? e : e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = '封面图请上传图片文件'
    return
  }
  error.value = ''
  let finalFile = file
  if (file.size > MAX_IMAGE_SIZE) {
    if (file.type === 'image/gif') {
      error.value = 'GIF 图片不能超过 10MB'
      return
    }
    try {
      finalFile = await compressImage(file, { maxSizeMB: 10 })
    } catch {
      error.value = '图片压缩失败，请换一张图片'
      return
    }
  }
  coverFile.value = finalFile
  coverPreview.value = URL.createObjectURL(finalFile)
}

function clearCoverFile() {
  coverFile.value = null
  coverPreview.value = props.initialCoverUrl || ''
  if (coverInput.value) coverInput.value.value = ''
}

function handleCoverDrop(e) {
  isDraggingCover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleCoverChange(file)
}

// 作品文件上传
function updateWorkPreview(file) {
  const mediaType = inferMediaTypeFromFile(file)
  workFile.value = file
  workMediaType.value = mediaType
  workPreview.value = URL.createObjectURL(file)
  error.value = ''
}

function handleMultiImageChange(e) {
  const files = e.target?.files || e.dataTransfer?.files
  if (!files || files.length === 0) return

  const remaining = MAX_IMAGE_COUNT - workFiles.value.length
  if (remaining <= 0) {
    error.value = `最多上传 ${MAX_IMAGE_COUNT} 张图片`
    return
  }

  const newFiles = Array.from(files).slice(0, remaining)
  for (const file of newFiles) {
    if (!file.type.startsWith('image/')) {
      error.value = '请选择图片文件'
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      error.value = `图片 ${file.name} 超过 10MB 限制`
      return
    }
  }

  error.value = ''
  for (const file of newFiles) {
    workFiles.value.push(file)
    workPreviews.value.push(URL.createObjectURL(file))
  }
}

function removeImage(index) {
  workFiles.value.splice(index, 1)
  workPreviews.value.splice(index, 1)
}

function handleMultiImageDrop(e) {
  isDraggingWork.value = false
  handleMultiImageChange(e)
}

function handleWorkFileChange(e) {
  if (uploadType.value === 'image') {
    return handleMultiImageChange(e)
  }
  const file = e instanceof File ? e : e.target.files?.[0]
  if (!file) return
  if (uploadType.value === 'both' && inferMediaTypeFromFile(file) === 'image') {
    return handleMultiImageChange(e)
  }
  if (!validateWorkFile(file)) return
  updateWorkPreview(file)
}

function handleWorkDrop(e) {
  isDraggingWork.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  if (uploadType.value === 'image') {
    return handleMultiImageChange(e)
  }

  const file = files[0]
  if (uploadType.value === 'both' && inferMediaTypeFromFile(file) === 'image') {
    return handleMultiImageChange(e)
  }

  if (!validateWorkFile(file)) return
  updateWorkPreview(file)
}

function clearWorkFile() {
  workFile.value = null
  workPreview.value = props.initialMediaUrl || ''
  workMediaType.value = normalizeMediaType(props.initialMediaType) || inferMediaTypeFromUrl(props.initialMediaUrl)
  workFiles.value = []
  workPreviews.value = []
  if (workInput.value) workInput.value.value = ''
}

function toggleTag(tagId) {
  const idx = selectedTags.value.indexOf(tagId)
  if (idx >= 0) {
    selectedTags.value.splice(idx, 1)
  } else {
    selectedTags.value.push(tagId)
  }
}

async function handlePublish() {
  error.value = ''

  // 验证
  if (!title.value.trim()) { error.value = '请输入作品名称'; return }
  if (!coverFile.value && !coverPreview.value) { error.value = '请上传封面图'; return }
  const isMultiImage = workFiles.value.length > 0
  if (!isMultiImage && !workFile.value && !workPreview.value) { error.value = '请上传作品媒体文件'; return }
  const hasWorkflow = !!selectedWorkflowId.value
  const hasProject = linkProject.value && !!selectedProjectId.value
  if (!hasWorkflow && !hasProject) { error.value = '请选择关联工作流或关联项目'; return }
  if (linkProject.value && !selectedProjectId.value) { error.value = '已启用关联项目，请选择一个项目'; return }
  if (selectedTags.value.length === 0) { error.value = '请至少选择一个标签'; return }
  if (!orientation.value) { error.value = '请选择作品方向（横屏或竖屏）'; return }
  if (shareMode.value === 'paid' && (!price.value || price.value < 1)) {
    error.value = '请输入有效的积分价格'
    return
  }
  const wfId = selectedWorkflowId.value || props.workflowId || undefined

  loading.value = true
  try {
    let mediaUrl = props.initialMediaUrl || ''
    let mediaType = normalizeMediaType(props.initialMediaType) || inferMediaTypeFromUrl(mediaUrl)

    if (workFiles.value.length > 0) {
      uploadProgress.value = 0
      const imageUrls = []
      for (let i = 0; i < workFiles.value.length; i++) {
        const urls = await uploadImages([workFiles.value[i]])
        if (urls && urls.length > 0) {
          imageUrls.push(urls[0])
        }
        uploadProgress.value = Math.round(((i + 1) / workFiles.value.length) * 100)
      }
      if (imageUrls.length === 0) throw new Error('图片上传失败')
      mediaUrl = JSON.stringify(imageUrls)
      mediaType = 'image'
      uploadProgress.value = 0
    } else if (workFile.value) {
      uploadProgress.value = 0
      const mediaUrls = await uploadWorkMedia(workFile.value, {
        onProgress: (p) => { uploadProgress.value = p.percent || Math.round((p.loaded / p.total) * 100) },
        timeout: 600000
      })
      if (!mediaUrls || mediaUrls.length === 0) {
        throw new Error('作品媒体上传失败')
      }
      mediaUrl = mediaUrls[0]
      mediaType = inferMediaTypeFromFile(workFile.value)
      uploadProgress.value = 0
    }

    let coverUrl = props.initialCoverUrl || ''
    if (coverFile.value) {
      const coverUrls = await uploadImages([coverFile.value])
      if (!coverUrls || coverUrls.length === 0) throw new Error('封面上传失败')
      coverUrl = coverUrls[0]
    } else if (!coverUrl && workFiles.value.length > 0) {
      try {
        const parsed = JSON.parse(mediaUrl)
        if (Array.isArray(parsed) && parsed.length > 0) coverUrl = parsed[0]
      } catch {}
    }

    const payload = {
      title: title.value.trim(),
      description: description.value.trim(),
      cover_url: coverUrl || undefined,
      media_url: mediaUrl || undefined,
      orientation: orientation.value,
      is_anonymous: isAnonymous.value,
      ...(wfId ? { workflow_id: wfId } : {}),
      tag_ids: selectedTags.value,
      category_id: selectedCategory.value || undefined,
      share_mode: shareMode.value,
      price: shareMode.value === 'paid' ? Number(price.value) : 0,
      ...(mediaType ? { media_type: mediaType } : {}),
      ...(linkProject.value && selectedProjectId.value ? {
        project_id: selectedProjectId.value,
        share_project: true
      } : {})
    }

    const result = await publishWork(payload)
    emit('published', result)
    close()
  } catch (e) {
    error.value = e.message || '发布失败，请重试'
  } finally {
    loading.value = false
    uploadProgress.value = 0
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[9999999] flex items-center justify-center"
      @click.self="close"
    >
      <div class="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div class="publish-dialog relative w-full max-w-[920px] mx-4 bg-[#1c1c1f] rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.5)] max-h-[90vh] flex flex-col overflow-hidden">

        <!-- 头部区域：标题 + 装饰图 -->
        <div class="relative px-8 pt-7 pb-5 shrink-0 overflow-hidden">
          <div class="publish-hero-glow" />
          <div class="publish-hero-tv">
            <svg viewBox="0 0 120 100" fill="none" class="w-full h-full opacity-60">
              <rect x="10" y="20" width="100" height="65" rx="8" fill="#2a2a2e" stroke="#444" stroke-width="1.5"/>
              <rect x="18" y="28" width="84" height="50" rx="4" fill="#333" stroke="#555" stroke-width="0.5"/>
              <rect x="22" y="32" width="76" height="42" rx="2" fill="#3a3a3e"/>
              <line x1="42" y1="8" x2="60" y2="20" stroke="#555" stroke-width="2" stroke-linecap="round"/>
              <line x1="78" y1="8" x2="60" y2="20" stroke="#555" stroke-width="2" stroke-linecap="round"/>
              <circle cx="42" cy="8" r="3" fill="#666"/>
              <circle cx="78" cy="8" r="3" fill="#666"/>
              <rect x="40" y="88" width="40" height="4" rx="2" fill="#333"/>
              <circle cx="96" cy="40" r="2" fill="#0d9488" opacity="0.8"/>
              <circle cx="96" cy="47" r="2" fill="#555"/>
              <rect x="30" y="40" width="50" height="2" rx="1" fill="#4a4a4e" opacity="0.5"/>
              <rect x="35" y="46" width="40" height="2" rx="1" fill="#4a4a4e" opacity="0.3"/>
              <rect x="30" y="52" width="45" height="2" rx="1" fill="#4a4a4e" opacity="0.4"/>
            </svg>
          </div>
          <div class="relative z-10">
            <h2 class="text-xl font-bold text-white tracking-tight">发布作品到社区</h2>
            <p class="mt-1.5 text-sm text-white/40 max-w-md leading-relaxed">将您的作品发布到社区参加活动，和全球优秀创作者同台竞技，优质画布/作品/封面将极大提升获奖概率！</p>
          </div>
          <button
            class="absolute top-5 right-5 z-20 w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all"
            @click="close"
            aria-label="关闭"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 内容区（左右两栏） -->
        <div class="flex-1 overflow-y-auto publish-scroll">
          <div class="flex gap-8 px-8 pb-6">
            <!-- 左栏：媒体上传 -->
            <div class="w-[280px] shrink-0 space-y-5">
              <!-- 作品上传 -->
              <div>
                <label class="publish-label">上传作品<span class="text-teal-400">*</span></label>

                <!-- 多图片上传模式 -->
                <template v-if="uploadType === 'image'">
                  <div class="space-y-2">
                    <div class="grid grid-cols-3 gap-2">
                      <div
                        v-for="(preview, idx) in workPreviews"
                        :key="idx"
                        class="relative aspect-square rounded-lg overflow-hidden border border-white/10"
                      >
                        <img :src="preview" class="w-full h-full object-cover" />
                        <button
                          type="button"
                          class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition"
                          @click.stop="removeImage(idx)"
                        >
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <div
                        v-if="workPreviews.length < MAX_IMAGE_COUNT"
                        class="aspect-square rounded-lg border border-dashed border-white/10 hover:border-white/20 flex flex-col items-center justify-center cursor-pointer transition"
                        @click="workInput?.click()"
                        @dragover.prevent="isDraggingWork = true"
                        @dragenter.prevent="isDraggingWork = true"
                        @dragleave.prevent="isDraggingWork = false"
                        @drop.prevent="handleMultiImageDrop"
                        :class="isDraggingWork ? 'border-teal-500/40 bg-teal-500/5' : ''"
                      >
                        <svg class="w-5 h-5 text-white/20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                        <span class="text-[10px] text-white/20 mt-1">添加图片</span>
                      </div>
                    </div>
                    <p class="text-[11px] text-white/20">支持 PNG、JPG、WebP（每张≤10MB，最多{{ MAX_IMAGE_COUNT }}张，已选{{ workPreviews.length }}张）</p>
                  </div>
                  <input ref="workInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple class="hidden" @change="handleWorkFileChange" />
                </template>

                <!-- 视频上传模式 -->
                <template v-else-if="uploadType === 'video'">
                  <div
                    class="publish-upload-card h-[180px]"
                    :class="isDraggingWork ? 'publish-upload-active' : workPreview ? 'publish-upload-has-file' : ''"
                    @click="workInput?.click()"
                    @dragover.prevent="isDraggingWork = true"
                    @dragenter.prevent="isDraggingWork = true"
                    @dragleave.prevent="isDraggingWork = false"
                    @drop.prevent="handleWorkDrop"
                  >
                    <button
                      v-if="workFile || workPreview"
                      type="button"
                      class="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition"
                      @click.stop="clearWorkFile"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                    <div v-if="isDraggingWork" class="flex flex-col items-center justify-center h-full text-teal-400">
                      <svg class="w-8 h-8 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                      <span class="text-xs">松开上传</span>
                    </div>
                    <img v-else-if="workPreview && workMediaType === 'image'" :src="workPreview" class="w-full h-full object-cover" alt="作品预览" />
                    <video v-else-if="workPreview && workMediaType === 'video'" :src="workPreview" class="w-full h-full object-cover" muted playsinline />
                    <div v-else class="flex flex-col items-center justify-center h-full text-white/25">
                      <div class="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center mb-2.5">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                      </div>
                      <span class="text-xs">点击上传</span>
                    </div>
                  </div>
                  <input ref="workInput" type="file" accept="video/mp4,video/quicktime,video/webm" class="hidden" @change="handleWorkFileChange" />
                  <p v-if="workFile" class="text-xs text-white/30 mt-1.5 truncate">{{ workFile.name }} · {{ formatFileSize(workFile.size) }}</p>
                  <div v-else class="mt-1.5">
                    <p class="text-[11px] text-white/20">支持 MP4、MOV、WebM 格式（≤500MB）</p>
                  </div>
                </template>

                <!-- both模式 -->
                <template v-else>
                  <!-- 如果已选了多图片则显示多图UI -->
                  <template v-if="workFiles.length > 0">
                    <div class="space-y-2">
                      <div class="grid grid-cols-3 gap-2">
                        <div
                          v-for="(preview, idx) in workPreviews"
                          :key="idx"
                          class="relative aspect-square rounded-lg overflow-hidden border border-white/10"
                        >
                          <img :src="preview" class="w-full h-full object-cover" />
                          <button
                            type="button"
                            class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition"
                            @click.stop="removeImage(idx)"
                          >
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                        <div
                          v-if="workPreviews.length < MAX_IMAGE_COUNT"
                          class="aspect-square rounded-lg border border-dashed border-white/10 hover:border-white/20 flex flex-col items-center justify-center cursor-pointer transition"
                          @click="workInput?.click()"
                          @dragover.prevent="isDraggingWork = true"
                          @dragenter.prevent="isDraggingWork = true"
                          @dragleave.prevent="isDraggingWork = false"
                          @drop.prevent="handleMultiImageDrop"
                          :class="isDraggingWork ? 'border-teal-500/40 bg-teal-500/5' : ''"
                        >
                          <svg class="w-5 h-5 text-white/20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                          <span class="text-[10px] text-white/20 mt-1">添加图片</span>
                        </div>
                      </div>
                      <p class="text-[11px] text-white/20">已选{{ workPreviews.length }}/{{ MAX_IMAGE_COUNT }}张图片</p>
                    </div>
                    <input ref="workInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple class="hidden" @change="handleWorkFileChange" />
                  </template>
                  <!-- 否则显示通用上传 -->
                  <template v-else>
                    <div
                      class="publish-upload-card h-[180px]"
                      :class="isDraggingWork ? 'publish-upload-active' : workPreview ? 'publish-upload-has-file' : ''"
                      @click="workInput?.click()"
                      @dragover.prevent="isDraggingWork = true"
                      @dragenter.prevent="isDraggingWork = true"
                      @dragleave.prevent="isDraggingWork = false"
                      @drop.prevent="handleWorkDrop"
                    >
                      <button
                        v-if="workFile || workPreview"
                        type="button"
                        class="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition"
                        @click.stop="clearWorkFile"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                      <div v-if="isDraggingWork" class="flex flex-col items-center justify-center h-full text-teal-400">
                        <svg class="w-8 h-8 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                        <span class="text-xs">松开上传</span>
                      </div>
                      <img v-else-if="workPreview && workMediaType === 'image'" :src="workPreview" class="w-full h-full object-cover" alt="作品预览" />
                      <video v-else-if="workPreview && workMediaType === 'video'" :src="workPreview" class="w-full h-full object-cover" muted playsinline />
                      <div v-else class="flex flex-col items-center justify-center h-full text-white/25">
                        <div class="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center mb-2.5">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                        </div>
                        <span class="text-xs">点击上传图片或视频</span>
                      </div>
                    </div>
                    <input ref="workInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm" class="hidden" @change="handleWorkFileChange" />
                    <p v-if="workFile" class="text-xs text-white/30 mt-1.5 truncate">{{ workFile.name }} · {{ formatFileSize(workFile.size) }}</p>
                    <div v-else class="mt-1.5">
                      <p class="text-[11px] text-white/20">支持图片（PNG、JPG，最多9张）或视频（MP4、MOV、WebM，≤500MB）</p>
                    </div>
                  </template>
                </template>
              </div>

              <!-- 封面上传 -->
              <div>
                <label class="publish-label">上传封面<span class="text-teal-400">*</span></label>
                <div
                  class="publish-upload-card h-[140px]"
                  :class="isDraggingCover ? 'publish-upload-active' : coverPreview ? 'publish-upload-has-file' : ''"
                  @click="coverInput?.click()"
                  @dragover.prevent="isDraggingCover = true"
                  @dragenter.prevent="isDraggingCover = true"
                  @dragleave.prevent="isDraggingCover = false"
                  @drop.prevent="handleCoverDrop"
                >
                  <button
                    v-if="coverFile || coverPreview"
                    type="button"
                    class="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition"
                    @click.stop="clearCoverFile"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  <div v-if="isDraggingCover" class="flex flex-col items-center justify-center h-full text-teal-400">
                    <svg class="w-8 h-8 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    <span class="text-xs">松开上传</span>
                  </div>
                  <img v-else-if="coverPreview" :src="coverPreview" class="w-full h-full object-cover" alt="封面预览" />
                  <div v-else class="flex flex-col items-center justify-center h-full text-white/25">
                    <div class="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center mb-2.5">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                    </div>
                    <span class="text-xs">点击上传</span>
                  </div>
                </div>
                <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" @change="handleCoverChange" />
                <div class="mt-1.5 space-y-0.5">
                  <p class="text-[11px] text-white/20">建议比例 16:9，支持 PNG、JPG、GIF、WebP（超过10MB自动压缩）</p>
                </div>
              </div>
            </div>

            <!-- 右栏：表单信息 -->
            <div class="flex-1 min-w-0 space-y-5">
              <!-- 作品名称 -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="publish-label mb-0">作品名称<span class="text-teal-400">*</span></label>
                  <span class="text-xs text-white/20 tabular-nums">{{ title.length }}/100</span>
                </div>
                <input
                  v-model="title"
                  type="text"
                  maxlength="100"
                  class="publish-input"
                  placeholder="请输入作品名称"
                />
              </div>

              <!-- 作品描述 -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="publish-label mb-0">作品描述</label>
                  <span class="text-xs text-white/20 tabular-nums">{{ descCount }}/200</span>
                </div>
                <textarea
                  v-model="description"
                  maxlength="200"
                  rows="3"
                  class="publish-input resize-none"
                  placeholder="请输入作品描述"
                />
              </div>

              <!-- 关联工作流 -->
              <div>
                <label class="publish-label">关联工作流</label>
                <div v-if="!linkProject">
                  <div class="workflow-dropdown-wrapper relative">
                    <button
                      type="button"
                      class="publish-input flex items-center justify-between cursor-pointer"
                      :class="workflowDropdownOpen ? '!border-teal-500/40' : ''"
                      :disabled="loadingWorkflows"
                      @click="toggleWorkflowDropdown"
                    >
                      <span class="truncate" :class="selectedWorkflowId ? 'text-white/80' : 'text-white/25'">
                        {{ loadingWorkflows ? '加载中...' : (selectedWorkflowId ? selectedWorkflowName : '请选择工作流') }}
                      </span>
                      <svg class="w-4 h-4 shrink-0 text-white/20 transition-transform" :class="workflowDropdownOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div
                      v-if="workflowDropdownOpen"
                      class="absolute left-0 right-0 mt-1 bg-[#222226] border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden"
                      style="z-index: 10000000;"
                    >
                      <div class="max-h-56 overflow-y-auto publish-scroll">
                        <template v-for="group in workflowGroups" :key="group.label">
                          <div class="px-3 py-1.5 text-[11px] font-medium text-teal-400/60 uppercase tracking-wider bg-white/[0.02] border-b border-white/[0.04] sticky top-0">
                            {{ group.label }}
                          </div>
                          <button
                            v-for="wf in group.workflows"
                            :key="wf.id"
                            type="button"
                            class="w-full px-3.5 py-2.5 text-left text-sm transition flex items-center gap-2"
                            :class="selectedWorkflowId === wf.id ? 'bg-teal-500/10 text-teal-400' : 'text-white/60 hover:bg-white/[0.04]'"
                            @click="selectWorkflow(wf.id)"
                          >
                            <svg class="w-4 h-4 shrink-0" :class="selectedWorkflowId === wf.id ? 'text-teal-400' : 'text-white/20'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                            <span class="truncate">{{ wf.name }}</span>
                            <span class="text-[11px] ml-auto shrink-0" :class="selectedWorkflowId === wf.id ? 'text-teal-400/50' : 'text-white/15'">{{ wf.workflow_uid || wf.id.slice(0, 8) }}</span>
                          </button>
                        </template>
                        <div v-if="workflowGroups.length === 0 && !loadingWorkflows" class="px-3.5 py-4 text-center text-sm text-white/20">
                          暂无已保存的工作流
                        </div>
                      </div>
                    </div>
                  </div>
                  <p v-if="workflowGroups.length === 0 && !loadingWorkflows" class="text-xs text-white/20 mt-1.5">暂无已保存的工作流，请先在画布中保存</p>
                </div>
              </div>

              <!-- 作品方向 -->
              <div>
                <label class="publish-label">作品方向<span class="text-teal-400">*</span></label>
                <div class="flex gap-3">
                  <button
                    type="button"
                    class="publish-choice-btn"
                    :class="orientation === 'landscape' ? 'publish-choice-active' : ''"
                    @click="orientation = 'landscape'"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" stroke-width="1.5"/></svg>
                    <span>横屏</span>
                  </button>
                  <button
                    type="button"
                    class="publish-choice-btn"
                    :class="orientation === 'portrait' ? 'publish-choice-active' : ''"
                    @click="orientation = 'portrait'"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" stroke-width="1.5"/></svg>
                    <span>竖屏</span>
                  </button>
                </div>
              </div>

              <!-- 标签选择 -->
              <div>
                <label class="publish-label">标签<span class="text-teal-400">*</span></label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="tag in communityStore.tags"
                    :key="tag.id"
                    type="button"
                    class="publish-tag-btn"
                    :class="selectedTags.includes(tag.id) ? 'publish-tag-active' : ''"
                    @click="toggleTag(tag.id)"
                  >{{ tag.name }}</button>
                  <span v-if="communityStore.tags.length === 0" class="text-xs text-white/20">暂无标签</span>
                </div>
              </div>

              <!-- 关联项目 -->
              <div>
                <label class="flex items-center gap-2.5 cursor-pointer group">
                  <input type="checkbox" v-model="linkProject" class="hidden" />
                  <div class="publish-checkbox" :class="linkProject ? 'publish-checkbox-active' : ''">
                    <svg v-if="linkProject" class="w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <span class="text-sm text-white/50 group-hover:text-white/70 transition">关联项目（分享项目下所有工作流）</span>
                </label>

                <div v-if="linkProject" class="mt-3">
                  <div class="project-dropdown-wrapper relative">
                    <button
                      type="button"
                      class="publish-input flex items-center justify-between cursor-pointer"
                      :class="projectDropdownOpen ? '!border-teal-500/40' : ''"
                      @click="toggleProjectDropdown"
                    >
                      <span class="truncate" :class="selectedProjectId ? 'text-white/80' : 'text-white/25'">{{ selectedProjectName }}</span>
                      <svg class="w-4 h-4 shrink-0 text-white/20 transition-transform" :class="projectDropdownOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div
                      v-if="projectDropdownOpen"
                      class="absolute left-0 right-0 mt-1 bg-[#222226] border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden"
                      style="z-index: 10000000;"
                    >
                      <div class="max-h-48 overflow-y-auto publish-scroll">
                        <button
                          v-for="p in projects"
                          :key="p.id"
                          type="button"
                          class="w-full px-3.5 py-2.5 text-left text-sm transition flex items-center gap-2"
                          :class="selectedProjectId === p.id ? 'bg-teal-500/10 text-teal-400' : 'text-white/60 hover:bg-white/[0.04]'"
                          @click="selectProject(p.id)"
                        >
                          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                          <span class="truncate">{{ p.name }}</span>
                          <span class="text-xs text-white/20 ml-auto shrink-0">{{ p.workflow_count || 0 }} 个工作流</span>
                        </button>
                        <div v-if="projects.length === 0" class="px-3.5 py-4 text-center text-sm text-white/20">
                          暂无项目
                        </div>
                      </div>
                    </div>
                  </div>
                  <p v-if="selectedProjectId && projectWorkflowCount > 0" class="text-xs text-teal-400/70 mt-1.5">
                    将分享该项目下所有 {{ projectWorkflowCount }} 个工作流
                  </p>
                </div>
              </div>

              <!-- 分类选择 -->
              <div>
                <label class="publish-label">分类<span class="text-white/20 text-xs font-normal ml-1">可选</span></label>
                <select
                  v-model="selectedCategory"
                  class="publish-input cursor-pointer"
                >
                  <option value="" class="bg-[#1c1c1f]">不选择分类</option>
                  <option v-for="cat in communityStore.categories" :key="cat.id" :value="cat.id" class="bg-[#1c1c1f]">{{ cat.name }}</option>
                </select>
              </div>

              <!-- 分享模式 -->
              <div>
                <label class="publish-label">分享模式</label>
                <div class="flex gap-3">
                  <button
                    type="button"
                    class="publish-choice-btn"
                    :class="shareMode === 'free' ? 'publish-choice-active' : ''"
                    @click="shareMode = 'free'"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"/></svg>
                    <span>免费</span>
                  </button>
                  <button
                    type="button"
                    class="publish-choice-btn"
                    :class="shareMode === 'paid' ? 'publish-choice-active' : ''"
                    @click="shareMode = 'paid'"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>付费</span>
                  </button>
                </div>
                <div v-if="shareMode === 'paid'" class="mt-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <label class="block text-xs text-white/30 mb-1.5">积分数量</label>
                  <input
                    v-model.number="price"
                    type="number"
                    min="1"
                    class="publish-input !w-32"
                    placeholder="输入积分"
                  />
                  <p class="mt-2 text-xs text-white/30">
                    <span class="text-amber-400/60">平台服务费 {{ (feeRate * 100).toFixed(0) }}%</span>
                    <template v-if="price > 0">
                      ，实际到账 <span class="text-teal-400/70">{{ price - Math.floor(price * feeRate) }}</span> 积分
                    </template>
                  </p>
                </div>
              </div>

              <!-- 匿名发布 -->
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2.5 cursor-pointer">
                  <div 
                    class="relative w-9 h-5 rounded-full transition-colors cursor-pointer"
                    :class="isAnonymous ? 'bg-teal-600' : 'bg-white/[0.08]'"
                    @click="isAnonymous = !isAnonymous"
                  >
                    <div 
                      class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
                      :class="isAnonymous ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </div>
                  <span class="text-sm text-white/50">匿名发布</span>
                </label>
                <span class="text-xs text-white/20">启用后显示为「匿名用户」</span>
              </div>

              <!-- 错误 -->
              <div v-if="error" class="p-3 bg-red-500/[0.06] border border-red-500/20 rounded-xl text-sm text-red-400/80">
                {{ error }}
              </div>
            </div>
          </div>
        </div>

        <!-- 底部区域 -->
        <div class="flex items-center gap-3 justify-end px-8 py-5 shrink-0">
          <div v-if="uploadProgress > 0" class="flex-1 flex items-center gap-2.5">
            <div class="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full bg-teal-500 rounded-full transition-all duration-300"
                :style="{ width: uploadProgress + '%' }"
              />
            </div>
            <span class="text-xs text-white/30 tabular-nums whitespace-nowrap">{{ uploadProgress }}%</span>
          </div>
          <button
            class="publish-btn-primary"
            @click="handlePublish"
            :disabled="loading"
          >
            <span v-if="loading" class="inline-flex items-center">
              <svg class="animate-spin -ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
              发布中...
            </span>
            <span v-else>发布并投稿</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes publishSlideUp {
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.publish-dialog {
  animation: publishSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.publish-hero-glow {
  position: absolute;
  top: -40px;
  right: -20px;
  width: 200px;
  height: 160px;
  background: radial-gradient(ellipse at center, rgba(13, 148, 136, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.publish-hero-tv {
  position: absolute;
  top: 0;
  right: 24px;
  width: 130px;
  height: 110px;
  pointer-events: none;
  opacity: 0.7;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
}

.publish-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 0.5rem;
  letter-spacing: 0.01em;
}

.publish-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.75rem;
  color: white;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s, background-color 0.2s;
}

.publish-input::placeholder {
  color: rgba(255, 255, 255, 0.18);
}

.publish-input:focus {
  border-color: rgba(13, 148, 136, 0.35);
  background: rgba(255, 255, 255, 0.035);
}

.publish-upload-card {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.875rem;
  overflow: hidden;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 0.2s, background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.publish-upload-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.publish-upload-active {
  border-color: rgba(13, 148, 136, 0.4) !important;
  background: rgba(13, 148, 136, 0.05) !important;
}

.publish-upload-has-file {
  border-color: rgba(255, 255, 255, 0.1);
}

.publish-choice-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border-radius: 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.8125rem;
  transition: all 0.2s;
}

.publish-choice-btn:hover {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.55);
}

.publish-choice-active {
  border-color: rgba(13, 148, 136, 0.35) !important;
  background: rgba(13, 148, 136, 0.08) !important;
  color: rgb(13, 148, 136) !important;
}

.publish-tag-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.75rem;
  transition: all 0.2s;
}

.publish-tag-btn:hover {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.55);
}

.publish-tag-active {
  border-color: rgba(13, 148, 136, 0.35) !important;
  background: rgba(13, 148, 136, 0.08) !important;
  color: rgb(13, 148, 136) !important;
}

.publish-checkbox {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 0.3rem;
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.publish-checkbox-active {
  border-color: rgb(13, 148, 136);
  background: rgb(13, 148, 136);
}

.publish-btn-primary {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, #0d9488, #0f766e);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.75rem;
  transition: all 0.2s;
  letter-spacing: 0.02em;
}

.publish-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #14b8a6, #0d9488);
  box-shadow: 0 4px 16px rgba(13, 148, 136, 0.25);
}

.publish-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.publish-scroll::-webkit-scrollbar {
  width: 4px;
}

.publish-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.publish-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
}

.publish-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.12);
}

select.publish-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.2)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}
</style>
