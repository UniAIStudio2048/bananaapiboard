<script setup>
import { ref, computed, onMounted } from 'vue'
import { getLLMConfig, chatWithLLM, getUserLLMPresets } from '@/api/canvas/llm'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import { getAvailableLLMModels } from '@/config/tenant'
import { calculateLLMCost } from '@/utils/llmCost'
import { getTotalUserPoints } from '@/utils/points'
import { formatPoints } from '@/utils/format'
import { getMe } from '@/api/client'

const me = ref(null)
const llmConfig = ref({ enabled: false, models: [], presets: [], languages: [] })
const userPresets = ref([])

// 表单状态
const selectedModel = ref('')
const selectedPreset = ref('') // '' = 无预设，'temp-custom' = 自定义，'user-<id>' = 用户预设，其他 = 租户预设 id
const customSystemPrompt = ref('')
const userInput = ref('')
const language = ref('zh')

// 结果与状态
const isGenerating = ref(false)
const resultText = ref('')
const errorMsg = ref('')

// 媒体附件（图片/视频），用于图片反推 / 视频反推
// 每项: { url, type: 'image'|'video', name, status: 'uploading'|'done'|'error' }
const mediaItems = ref([])
const isDragging = ref(false)
const fileInput = ref(null)
const mediaErrorMsg = ref('')

const hasDoneMedia = computed(() => mediaItems.value.some(m => m.status === 'done'))
const isUploadingMedia = computed(() => mediaItems.value.some(m => m.status === 'uploading'))

// 可用模型（对齐画布端 availableModels computed）
const availableModels = computed(() => {
  if (llmConfig.value.models && llmConfig.value.models.length > 0) {
    return llmConfig.value.models.map(m => ({
      value: m.id,
      label: m.name,
      pointsCost: m.pointsCost
    }))
  }
  return [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5', pointsCost: 1 },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', pointsCost: 2 }
  ]
})

// 预设选项：无预设 / 租户预设 / 用户自定义预设 / 自定义
const presetOptions = computed(() => {
  const opts = [{ value: '', label: '无预设', pointsCost: 0 }]
  for (const p of (llmConfig.value.presets || [])) {
    opts.push({ value: p.id, label: p.name, pointsCost: Number(p.pointsCost ?? p.points_cost ?? 0), isTenant: true })
  }
  for (const p of userPresets.value) {
    opts.push({ value: `user-${p.id}`, label: p.name, pointsCost: 0, isUser: true })
  }
  opts.push({ value: 'temp-custom', label: '自定义提示词', pointsCost: 0, isCustom: true })
  return opts
})

const selectedPresetOption = computed(() => presetOptions.value.find(o => o.value === selectedPreset.value))

// 当前费用：模型基础 + 预设附加
const currentCost = computed(() => {
  const model = availableModels.value.find(m => m.value === selectedModel.value)
  const templateExtra = selectedPresetOption.value?.pointsCost || 0
  return calculateLLMCost(model?.pointsCost, templateExtra)
})

// 用户积分
const userPoints = computed(() => getTotalUserPoints(me.value))

const canSubmit = computed(() =>
  !isGenerating.value &&
  (userInput.value.trim().length > 0 || hasDoneMedia.value) &&
  selectedModel.value &&
  (selectedPreset.value !== 'temp-custom' || customSystemPrompt.value.trim().length > 0) &&
  userPoints.value >= currentCost.value
)

async function loadConfig() {
  try {
    // 优先租户配置模型
    const tenantModels = getAvailableLLMModels()
    if (tenantModels && tenantModels.length > 0) {
      llmConfig.value = { ...llmConfig.value, enabled: true, models: tenantModels }
    }
    const config = await getLLMConfig()
    if (config) {
      llmConfig.value = {
        ...config,
        models: (config.models && config.models.length > 0) ? config.models : llmConfig.value.models
      }
    }
    if (!selectedModel.value && availableModels.value.length > 0) {
      selectedModel.value = availableModels.value[0].value
    }
    if (config?.languages?.length > 0 && !language.value) {
      language.value = config.defaultLanguage || config.languages[0]?.id || 'zh'
    }
  } catch (e) {
    console.error('[TextGeneration] 加载 LLM 配置失败:', e)
    if (!selectedModel.value && availableModels.value.length > 0) {
      selectedModel.value = availableModels.value[0].value
    }
  }
}

async function loadUserPresets() {
  try {
    const res = await getUserLLMPresets()
    userPresets.value = res.presets || []
  } catch (e) {
    console.warn('[TextGeneration] 加载用户预设失败:', e)
    userPresets.value = []
  }
}

// 校验文件类型：仅图片/视频
function validateFileType(file) {
  return file.type.startsWith('image/') || file.type.startsWith('video/')
}

// 上传单个文件，先 push 占位项，成功/失败后更新
async function uploadOne(file) {
  if (!validateFileType(file)) {
    mediaErrorMsg.value = '仅支持图片或视频'
    return
  }
  const type = file.type.startsWith('video/') ? 'video' : 'image'
  const item = ref({ url: '', type, name: file.name, status: 'uploading' })
  mediaItems.value.push(item.value)
  try {
    const result = await uploadCanvasMedia(file, type)
    const url = result?.url
    if (!url) throw new Error('上传返回的 url 为空')
    item.value.url = url
    item.value.status = 'done'
  } catch (e) {
    console.error('[TextGeneration] 媒体上传失败:', e)
    item.value.status = 'error'
    mediaErrorMsg.value = `${file.name} 上传失败：${e?.message || '未知错误'}`
  }
}

// 处理选中的文件列表（点击选择或拖拽）
async function handleFiles(fileList) {
  if (!fileList || fileList.length === 0) return
  mediaErrorMsg.value = ''
  const files = Array.from(fileList)
  await Promise.allSettled(files.map(f => uploadOne(f)))
}

function onFileInputChange(e) {
  const input = e.target
  if (input.files && input.files.length > 0) {
    handleFiles(input.files)
    input.value = '' // 允许重复选择同一文件
  }
}

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) handleFiles(files)
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function removeMedia(index) {
  mediaItems.value.splice(index, 1)
}

function clearMedia() {
  mediaItems.value = []
  mediaErrorMsg.value = ''
}

async function generate() {
  if (!canSubmit.value) return
  errorMsg.value = ''
  resultText.value = ''
  isGenerating.value = true
  try {
    // 反推场景可无文本，content 允许为空字符串
    const messages = [{ role: 'user', content: userInput.value.trim() }]
    const apiParams = {
      messages,
      model: selectedModel.value,
      language: language.value || 'zh',
      stream: false
    }
    if (selectedPreset.value === 'temp-custom') {
      apiParams.customSystemPrompt = customSystemPrompt.value.trim()
    } else if (selectedPreset.value && selectedPreset.value.startsWith('user-')) {
      apiParams.userPresetId = selectedPreset.value.replace('user-', '')
    } else if (selectedPreset.value) {
      apiParams.preset = selectedPreset.value
    }

    // 收集已上传完成的媒体 URL，按后端约定放入 images 数组
    const images = mediaItems.value
      .filter(m => m.status === 'done' && m.url)
      .map(m => m.url)
    if (images.length > 0) {
      apiParams.images = images
    }

    const result = await chatWithLLM(apiParams)
    resultText.value = result.result || result.text || result.content || ''
    // 生成成功后刷新余额
    try { me.value = await getMe(true) } catch (_) {}
  } catch (e) {
    console.error('[TextGeneration] 生成失败:', e)
    errorMsg.value = e?.message || '生成失败，请稍后重试'
  } finally {
    isGenerating.value = false
  }
}

onMounted(async () => {
  try { me.value = await getMe() } catch (e) { console.warn('[TextGeneration] 获取用户信息失败:', e) }
  await Promise.all([loadConfig(), loadUserPresets()])
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">✍️ 文本生成</h1>

    <div class="card p-6 space-y-5">
      <!-- 模型选择 -->
      <div>
        <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
          <span>🤖</span><span>模型</span>
        </label>
        <select v-model="selectedModel" class="input text-sm">
          <option v-for="m in availableModels" :key="m.value" :value="m.value">
            {{ m.label }} ({{ m.pointsCost ?? 1 }}积分)
          </option>
        </select>
      </div>

      <!-- 预设选择 -->
      <div>
        <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
          <span>📝</span><span>预设</span>
        </label>
        <select v-model="selectedPreset" class="input text-sm">
          <option v-for="o in presetOptions" :key="o.value" :value="o.value">
            {{ o.label }}{{ o.isTenant ? ` (+${o.pointsCost}积分)` : '' }}
          </option>
        </select>
      </div>

      <!-- 自定义系统提示 -->
      <div v-if="selectedPreset === 'temp-custom'">
        <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
          <span>⚙️</span><span>自定义系统提示词</span>
        </label>
        <textarea
          v-model="customSystemPrompt"
          rows="3"
          class="input text-sm resize-y"
          placeholder="例如：你是一位专业的文案编辑，请根据用户输入进行润色..."
        ></textarea>
      </div>

      <!-- 媒体附件（图片/视频），用于图片反推 / 视频反推 -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <span>📎</span><span>附件（图片/视频）</span>
          </label>
          <button
            v-if="mediaItems.length > 0"
            type="button"
            @click="clearMedia"
            class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >清空</button>
        </div>

        <!-- 上传区：点击选择 + 拖拽 -->
        <div
          @click="fileInput?.click()"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop"
          :class="[
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
            isDragging
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-dark-600 hover:border-slate-400 dark:hover:border-dark-500'
          ]"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/*,video/*"
            multiple
            class="hidden"
            @change="onFileInputChange"
          />
          <div class="text-sm text-slate-500 dark:text-slate-400">
            <span v-if="isUploadingMedia">上传中...</span>
            <span v-else>点击选择 或 拖拽 图片 / 视频到此处</span>
          </div>
        </div>

        <!-- 上传错误提示 -->
        <div v-if="mediaErrorMsg" class="mt-2 text-xs text-red-600 dark:text-red-400">
          {{ mediaErrorMsg }}
        </div>

        <!-- 已上传的媒体列表 -->
        <div v-if="mediaItems.length > 0" class="mt-3 flex flex-wrap gap-2">
          <div
            v-for="(item, idx) in mediaItems"
            :key="idx"
            class="relative group w-20 h-20 rounded-lg border border-slate-200 dark:border-dark-600 overflow-hidden bg-slate-50 dark:bg-dark-700"
          >
            <!-- 图片缩略图 -->
            <img
              v-if="item.type === 'image' && item.url"
              :src="item.url"
              :alt="item.name"
              class="w-full h-full object-cover"
            />
            <!-- 视频卡片 -->
            <div
              v-else-if="item.type === 'video'"
              class="w-full h-full flex flex-col items-center justify-center text-center px-1"
            >
              <span class="text-2xl">🎬</span>
              <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate w-full mt-0.5">{{ item.name }}</span>
            </div>
            <!-- 上传中占位 -->
            <div
              v-else
              class="w-full h-full flex items-center justify-center"
            >
              <span class="text-xs text-slate-400">上传中</span>
            </div>

            <!-- 上传失败标识 -->
            <div
              v-if="item.status === 'error'"
              class="absolute inset-0 flex items-center justify-center bg-red-500/40 text-white text-xs"
            >失败</div>

            <!-- 删除按钮 -->
            <button
              type="button"
              @click.stop="removeMedia(idx)"
              class="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              aria-label="删除"
            >×</button>
          </div>
        </div>
      </div>

      <!-- 用户输入 -->
      <div>
        <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
          <span>💬</span><span>输入内容</span>
        </label>
        <textarea
          v-model="userInput"
          rows="6"
          class="input text-sm resize-y"
          placeholder="请输入要生成的文本内容...（图片/视频反推时可留空）"
        ></textarea>
      </div>

      <!-- 余额不足提示 -->
      <div v-if="userPoints < currentCost" class="text-xs text-amber-600 dark:text-amber-400">
        当前余额 {{ formatPoints(userPoints) }} 积分不足，本次需要 {{ formatPoints(currentCost) }} 分
      </div>

      <!-- 生成按钮 + 费用预览 -->
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-slate-500 dark:text-slate-400">
          消耗 <span class="font-semibold text-slate-700 dark:text-slate-200">{{ formatPoints(currentCost) }}</span> 积分
          <span class="mx-1">·</span>
          余额 {{ formatPoints(userPoints) }}
        </span>
        <button
          @click="generate"
          :disabled="!canSubmit"
          class="btn-primary text-sm px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span v-if="isGenerating">生成中...</span>
          <span v-else>生成</span>
        </button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-sm text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
      {{ errorMsg }}
    </div>

    <!-- 结果展示 -->
    <div v-if="resultText" class="mt-4 card p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">生成结果</h2>
        <button
          @click="navigator.clipboard?.writeText(resultText)"
          class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >复制</button>
      </div>
      <pre class="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words font-sans leading-relaxed">{{ resultText }}</pre>
    </div>
  </div>
</template>