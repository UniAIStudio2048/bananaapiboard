<template>
  <div class="voice-picker-backdrop" @click.self="emit('close')">
    <section class="voice-picker" role="dialog" aria-modal="true" aria-label="音色选择">
      <header class="voice-picker-header">
        <h2>音色选择</h2>
        <button type="button" class="close-button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="voice-picker-toolbar">
        <div class="voice-picker-tabs" role="tablist" aria-label="音色分类">
          <button type="button" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">音色库</button>
          <button v-if="!isMiniMax" type="button" :class="{ active: activeTab === 'favorites' }" @click="activeTab = 'favorites'">收藏音色</button>
          <button type="button" :class="{ active: activeTab === 'mine' }" @click="switchToMine">我的音色</button>
          <button v-if="!isMiniMax || isMiniMaxCloneEnabled" type="button" :class="{ active: activeTab === 'clone' }" @click="activeTab = 'clone'">克隆新音色</button>
        </div>
        <label class="voice-search">
          <span aria-hidden="true">⌕</span>
          <input v-model.trim="keyword" type="search" placeholder="搜索音色库" />
        </label>
      </div>

      <div v-if="!isMiniMax" class="voice-picker-filters">
        <select v-model="locale"><option value="">全部语种</option><option v-for="item in locales" :key="item" :value="item">{{ localeLabels[item] || item }}</option></select>
        <select v-model="gender"><option value="">全部性别</option><option value="female">女声</option><option value="male">男声</option></select>
        <select v-model="style"><option value="">全部风格</option><option v-for="item in styles" :key="item" :value="item">{{ styleLabels[item] || item }}</option></select>
      </div>

      <div v-if="activeTab === 'clone'" class="voice-picker-list">
        <div class="clone-panel">
          <div class="clone-reading">
            <div class="clone-reading-header">
              <h3>朗读文案</h3>
              <button type="button" class="clone-refresh-button" :disabled="isRecording || readingTexts.length < 2" @click="refreshReadingText">换一段</button>
            </div>
            <p v-if="currentReadingText" class="clone-reading-text">{{ currentReadingText }}</p>
            <p v-else class="voice-empty">未配置朗读文案</p>
          </div>
          <div class="clone-recorder">
            <div class="clone-controls">
              <button v-if="!isRecording" type="button" class="clone-record-button" @click="startRecording">开始录音</button>
              <button v-else type="button" class="clone-record-button recording" @click="stopRecording">停止录音（{{ recordSeconds }}s）</button>
              <input v-if="isMiniMax" ref="cloneAudioInput" type="file" accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" class="mine-upload-input" @change="handleMiniMaxCloneAudioUpload" />
              <button v-if="isMiniMax" type="button" class="mine-upload-button" :disabled="cloneSaving" @click="openMiniMaxCloneAudioUpload">上传音频</button>
              <audio v-if="recordedBlobUrl" :src="recordedBlobUrl" controls class="clone-preview"></audio>
            </div>
            <p v-if="isMiniMax" class="clone-upload-hint">支持 MP3、M4A、WAV，时长 10 秒至 5 分钟，文件不超过 20MB。</p>
            <div v-if="isRecording" class="clone-waveform" role="status">
              <canvas ref="waveformCanvas" aria-label="录音实时波形"></canvas>
              <span>正在录音，实时显示麦克风波形</span>
            </div>
            <p v-if="recordError" class="clone-error">{{ recordError }}</p>
            <div v-if="recordedBlob" class="clone-save-form">
              <input v-model.trim="cloneName" type="text" placeholder="为音色命名" class="clone-name-input" />
              <button type="button" class="clone-save-button" :disabled="!canSaveClone" @click="saveCloneVoice">
                {{ cloneSaving ? '保存中…' : '保存音色' }}
              </button>
            </div>
            <div v-if="isMiniMax && recordedBlob" class="minimax-clone-billing">
              <strong>本次复刻将消耗 {{ formatClonePoints(clonePointsCost) }} 积分</strong>
              <label><input v-model="cloneAuthorized" type="checkbox" /> 我确认拥有该声音的合法授权</label>
            </div>
            <p v-if="cloneError" class="clone-error">{{ cloneError }}</p>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'mine'" class="voice-picker-list">
        <div v-if="!isMiniMax" class="mine-upload">
          <input ref="mineAudioInput" type="file" accept="audio/mpeg,.mp3" class="mine-upload-input" @change="handleMineAudioUpload" />
          <button type="button" class="mine-upload-button" :disabled="mineUploading" @click="openMineAudioUpload">{{ mineUploading ? '上传中…' : '上传 MP3' }}</button>
          <span>仅支持大于 3 秒且小于 35 秒的 MP3 文件</span>
        </div>
        <p v-if="mineUploadError" class="clone-error">{{ mineUploadError }}</p>
        <p v-if="mineLoading" class="voice-empty">正在加载我的音色…</p>
        <p v-else-if="mineError" class="voice-empty">{{ mineError }}</p>
        <p v-else-if="!mineVoices.length" class="voice-empty">{{ isMiniMax ? '还没有保存的 MiniMax 设计音色，先使用“音色设计”创建并保存吧' : '还没有个人音色，去“克隆新音色”创建一个吧' }}</p>
        <article v-for="voice in mineVoices" :key="voice.id" class="voice-row" :class="{ selected: modelValue?.id === voice.id }">
          <button type="button" class="preview-button" :disabled="!voice.hasPreview" :title="voice.hasPreview ? '试听音色' : '试听素材准备中'" @click="togglePreview(voice)">
            {{ playingId === voice.id ? '■' : '▶' }}
          </button>
          <div class="voice-main">
            <strong>{{ voice.name }}</strong>
            <small v-if="voice.transcript">{{ voice.transcript }}</small>
            <small v-if="isMiniMax && voice.cloneExpiresAt && !voice.cloneActivatedAt" class="minimax-clone-expiry">请在 {{ formatCloneExpiry(voice.cloneExpiresAt) }} 前首次使用该音色合成</small>
          </div>
          <button type="button" class="select-button" :disabled="!voice.hasPreview && !isMiniMax" @click="emit('select', voice)">{{ modelValue?.id === voice.id ? '已选' : '选择' }}</button>
          <button type="button" class="favorite-button delete-button" title="删除" @click="requestDeleteMineVoice(voice)">删除</button>
        </article>
      </div>
      <div v-else class="voice-picker-list">
        <p v-if="loading" class="voice-empty">正在加载音色库…</p>
        <p v-else-if="error" class="voice-empty">{{ error }}</p>
        <p v-else-if="!filteredVoices.length" class="voice-empty">没有符合条件的音色</p>
        <article v-for="voice in paginatedVoices" :key="voice.id" class="voice-row" :class="{ selected: modelValue?.id === voice.id }">
          <button type="button" class="preview-button" :disabled="previewLoadingId === voice.id || (!voice.hasPreview && !(isMiniMax && voice.isSystem))" :title="previewButtonTitle(voice)" @click="togglePreview(voice)">
            {{ previewLoadingId === voice.id ? '…' : playingId === voice.id ? '■' : '▶' }}
          </button>
          <div class="voice-main">
            <strong>{{ voice.name }}</strong>
            <small v-if="voice.description">{{ voice.description }}</small>
            <span>{{ voice.tags?.join(' · ') }}</span>
            <div v-if="voice.sourceVoice" class="voice-id">
              <span>音色ID：{{ voice.sourceVoice }}</span>
              <button type="button" @click.stop="copyVoiceId(voice.sourceVoice)">{{ copiedVoiceId === voice.sourceVoice ? '已复制' : '复制' }}</button>
            </div>
          </div>
          <div class="voice-meta"><span>{{ localeLabels[voice.locale] || voice.locale }}</span><span>{{ genderLabel(voice.gender) }}</span><span>{{ styleLabels[voice.style] || voice.style }}</span></div>
          <button type="button" class="select-button" :disabled="!voice.hasPreview && !isMiniMax" @click="emit('select', voice)">{{ modelValue?.id === voice.id ? '已选' : '选择' }}</button>
          <button v-if="!isMiniMax" type="button" class="favorite-button" :class="{ active: voice.isFavorite }" :title="voice.isFavorite ? '取消收藏' : '收藏'" @click="toggleFavorite(voice)">{{ voice.isFavorite ? '★' : '☆' }}</button>
        </article>
      </div>
      <footer v-if="activeTab !== 'clone' && activeTab !== 'mine' && pageCount > 1" class="voice-picker-pagination" aria-label="音色分页">
        <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">上一页</button>
        <template v-for="item in visiblePageItems" :key="item.key">
          <span v-if="item.type === 'ellipsis'" class="voice-pagination-ellipsis" aria-hidden="true">…</span>
          <button v-else type="button" :class="{ active: currentPage === item.page }" :aria-current="currentPage === item.page ? 'page' : undefined" @click="currentPage = item.page">{{ item.page }}</button>
        </template>
        <button type="button" :disabled="currentPage === pageCount" @click="currentPage += 1">下一页</button>
        <span class="voice-pagination-summary">第 {{ currentPage }} / {{ pageCount }} 页</span>
      </footer>
    </section>
    <div v-if="voicePendingDeletion" class="delete-confirm-backdrop" @click.self="cancelDeleteMineVoice">
      <section class="delete-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <div class="delete-confirm-icon" aria-hidden="true">!</div>
        <h2 id="delete-confirm-title">删除音色？</h2>
        <p>确定要删除“{{ voicePendingDeletion.name }}”吗？</p>
        <p class="delete-confirm-warning">删除后无法恢复</p>
        <div class="delete-confirm-actions">
          <button type="button" class="delete-confirm-cancel" :disabled="mineDeleting" @click="cancelDeleteMineVoice">取消</button>
          <button type="button" class="delete-confirm-submit" :disabled="mineDeleting" @click="confirmDeleteMineVoice">{{ mineDeleting ? '删除中…' : '确认删除' }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import apiClient, { apiRequest } from '@/api/client'
import { uploadCanvasMedia } from '@/api/canvas/workflow'

const props = defineProps({
  modelValue: { type: Object, default: null },
  readingTexts: { type: Array, default: () => [] },
  provider: { type: String, default: 'coze' },
  model: { type: String, default: '' },
  clonePointsCost: { type: Number, default: null },
  spaceType: { type: String, default: 'personal' },
  teamId: { type: String, default: '' }
})
const emit = defineEmits(['select', 'close'])
const isMiniMax = computed(() => props.provider === 'minimax')
const isMiniMaxCloneEnabled = computed(() => isMiniMax.value && Number.isFinite(props.clonePointsCost) && props.clonePointsCost >= 0)
const voices = ref([])
const activeTab = ref('all')
const keyword = ref('')
const locale = ref(isMiniMax.value ? '' : 'zh-CN')
const gender = ref('')
const style = ref('')
const loading = ref(false)
const error = ref('')
const playingId = ref('')
const previewLoadingId = ref('')
const copiedVoiceId = ref('')
const currentPage = ref(1)
const pageSize = 12
let previewAudio = null

const styleLabels = { narration: '旁白', conversational: '对话', advertising: '广告', emotional: '情感', news: '资讯' }
const localeLabels = {
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（台湾）',
  'yue-HK': '粤语（港澳）',
  'en-US': '英语（美国）',
  'ja-JP': '日语',
  'ko-KR': '韩语',
  'es-ES': '西班牙语（西班牙）',
  'es-MX': '西班牙语（墨西哥）',
  'es-AR': '西班牙语（阿根廷）',
  'fr-FR': '法语',
  'de-DE': '德语',
  'pt-BR': '葡萄牙语（巴西）',
  'pt-PT': '葡萄牙语（葡萄牙）',
  'ru-RU': '俄语',
  'ar-SA': '阿拉伯语',
  'hi-IN': '印地语',
  'id-ID': '印度尼西亚语',
  'tr-TR': '土耳其语'
}
const locales = computed(() => [...new Set(voices.value.map(item => item.locale))])
const styles = computed(() => [...new Set(voices.value.map(item => item.style))])
const filteredVoices = computed(() => {
  const query = keyword.value.toLocaleLowerCase()
  return voices.value.filter(voice => {
    const searchable = [voice.name, voice.description, voice.locale, voice.gender, voice.style, ...(voice.tags || [])].join(' ').toLocaleLowerCase()
    return (isMiniMax.value || activeTab.value !== 'favorites' || voice.isFavorite) &&
      (!query || searchable.includes(query)) &&
      (isMiniMax.value || !locale.value || voice.locale === locale.value) &&
      (isMiniMax.value || !gender.value || voice.gender === gender.value) &&
      (isMiniMax.value || !style.value || voice.style === style.value)
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredVoices.value.length / pageSize)))
const paginatedVoices = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredVoices.value.slice(start, start + pageSize)
})
const visiblePageItems = computed(() => getVisiblePageItems(pageCount.value, currentPage.value))

watch([keyword, locale, gender, style, activeTab], () => { currentPage.value = 1 })
watch(pageCount, count => {
  if (currentPage.value > count) currentPage.value = count
})

function genderLabel(value) {
  return value === 'female' ? '女' : value === 'male' ? '男' : value
}

function getVisiblePageItems(total, current) {
  const pages = new Set([1, total])
  if (total <= 7) {
    for (let page = 1; page <= total; page += 1) pages.add(page)
  } else if (current <= 4) {
    for (let page = 2; page <= 5; page += 1) pages.add(page)
  } else if (current >= total - 3) {
    for (let page = total - 4; page < total; page += 1) pages.add(page)
  } else {
    for (let page = current - 1; page <= current + 1; page += 1) pages.add(page)
  }
  const sortedPages = [...pages].sort((left, right) => left - right)
  return sortedPages.flatMap((page, index) => {
    const previous = sortedPages[index - 1]
    const gap = previous && page - previous > 1
      ? [{ type: 'ellipsis', key: `ellipsis-${previous}-${page}` }]
      : []
    return [...gap, { type: 'page', page, key: `page-${page}` }]
  })
}

async function copyVoiceId(voiceId) {
  try {
    await navigator.clipboard.writeText(voiceId)
    copiedVoiceId.value = voiceId
    window.setTimeout(() => {
      if (copiedVoiceId.value === voiceId) copiedVoiceId.value = ''
    }, 1600)
  } catch {
    error.value = '复制音色 ID 失败，请检查浏览器权限'
  }
}

async function loadVoices() {
  loading.value = true
  error.value = ''
  try {
    const response = isMiniMax.value
      ? await apiClient.get(`/api/audio/minimax/system-voices?model=${encodeURIComponent(props.model)}`)
      : await apiClient.get('/api/audio/voice-presets')
    voices.value = response.data || []
  } catch (requestError) {
    error.value = requestError?.message || '音色库加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function stopPreview() {
  previewAudio?.pause()
  previewAudio = null
  playingId.value = ''
}

function previewButtonTitle(voice) {
  if (previewLoadingId.value === voice.id) return '正在生成试听…'
  if (voice.hasPreview) return '试听音色'
  return isMiniMax.value && voice.isSystem ? '生成试听' : '试听素材准备中'
}

function playPreview(voice) {
  if (playingId.value === voice.id) return stopPreview()
  stopPreview()
  previewAudio = new Audio(voice.previewUrl)
  previewAudio.onended = stopPreview
  previewAudio.onerror = stopPreview
  previewAudio.play().then(() => { playingId.value = voice.id }).catch(stopPreview)
}

async function requestMiniMaxSystemPreview(voice, attempts = 0) {
  const response = await apiClient.post(`/api/audio/minimax/system-voices/${encodeURIComponent(voice.sourceVoice)}/preview`, { model: props.model })
  if (response.status === 'completed' && response.data?.audio_url) return response.data.audio_url
  if (response.status === 'failed') throw new Error(response.data?.error_message || '试听生成失败，请稍后重试')
  if (attempts >= 18) throw new Error('试听生成时间较长，请稍后再试')
  await new Promise(resolve => window.setTimeout(resolve, Number(response.retry_after_ms) || 2500))
  return requestMiniMaxSystemPreview(voice, attempts + 1)
}

async function togglePreview(voice) {
  if (playingId.value === voice.id) return stopPreview()
  if (voice.hasPreview) return playPreview(voice)
  if (!(isMiniMax.value && voice.isSystem)) return
  previewLoadingId.value = voice.id
  error.value = ''
  try {
    const previewUrl = await requestMiniMaxSystemPreview(voice)
    voice.previewUrl = previewUrl
    voice.hasPreview = true
    playPreview(voice)
  } catch (requestError) {
    error.value = requestError?.message || '试听生成失败，请稍后重试'
  } finally {
    if (previewLoadingId.value === voice.id) previewLoadingId.value = ''
  }
}

async function toggleFavorite(voice) {
  try {
    const response = await apiClient.post(`/api/audio/voice-presets/${encodeURIComponent(voice.id)}/favorite`)
    voice.isFavorite = Boolean(response.isFavorite)
  } catch (requestError) {
    error.value = requestError?.message || '收藏音色失败，请稍后重试'
  }
}

// 克隆新音色 / 我的音色
const mineVoices = ref([])
const mineLoading = ref(false)
const mineError = ref('')
const mineAudioInput = ref(null)
const cloneAudioInput = ref(null)
const mineUploading = ref(false)
const mineUploadError = ref('')
const voicePendingDeletion = ref(null)
const mineDeleting = ref(false)
const isRecording = ref(false)
const recordSeconds = ref(0)
const recordedBlob = ref(null)
const recordedBlobUrl = ref('')
const recordError = ref('')
const cloneName = ref('')
const cloneSaving = ref(false)
const cloneError = ref('')
const cloneAuthorized = ref(false)
const cloneFile = ref(null)
const cloneDurationSeconds = ref(0)
const waveformCanvas = ref(null)
const currentReadingTextIndex = ref(0)
let mediaRecorder = null
let mediaStream = null
let recordChunks = []
let recordTimer = null
let recordStartAt = 0
let audioContext = null
let audioAnalyser = null
let waveformFrame = null

const readingTexts = computed(() => Array.isArray(props.readingTexts) ? props.readingTexts.filter(Boolean) : [])
const currentReadingText = computed(() => {
  const texts = readingTexts.value
  return texts[currentReadingTextIndex.value % texts.length] || ''
})
const canSaveClone = computed(() => {
  if (cloneSaving.value || !cloneName.value) return false
  if (!isMiniMax.value) return Boolean(recordedBlob.value)
  return isMiniMaxCloneEnabled.value && Boolean(cloneFile.value) && cloneDurationSeconds.value >= 10 && cloneDurationSeconds.value <= 300 && cloneAuthorized.value
})

function refreshReadingText() {
  if (readingTexts.value.length < 2 || isRecording.value) return
  currentReadingTextIndex.value = (currentReadingTextIndex.value + 1) % readingTexts.value.length
  clearRecordedAudio()
}

async function loadMineVoices() {
  mineLoading.value = true
  mineError.value = ''
  try {
    const response = await apiClient.get(isMiniMax.value ? '/api/audio/user-voices?provider=minimax' : '/api/audio/user-voices')
    const list = Array.isArray(response?.data) ? response.data : []
    mineVoices.value = list.map(item => ({
      id: item.id,
      name: item.name,
      previewUrl: item.reference_audio_url || item.previewUrl || '',
      transcript: item.transcript || '',
      sourceVoice: item.sourceVoice || (isMiniMax.value ? '' : item.reference_audio_url || ''),
      provider: item.provider || (isMiniMax.value ? 'minimax' : 'reference'),
      cloneExpiresAt: item.cloneExpiresAt || null,
      cloneActivatedAt: item.cloneActivatedAt || null,
      hasPreview: Boolean(item.reference_audio_url || item.previewUrl)
    }))
  } catch (requestError) {
    mineError.value = requestError?.message || '加载个人音色失败，请稍后重试'
  } finally {
    mineLoading.value = false
  }
}

function switchToMine() {
  activeTab.value = 'mine'
  return loadMineVoices()
}

function openMineAudioUpload() {
  mineAudioInput.value?.click()
}

function openMiniMaxCloneAudioUpload() {
  cloneAudioInput.value?.click()
}

function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio')
    const audioUrl = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audioUrl)
      resolve(audio.duration)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl)
      reject(new Error('无法读取音频文件时长'))
    }
    audio.src = audioUrl
  })
}

function getRecordingExtension(mimeType = '') {
  if (mimeType.includes('ogg')) return '.ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3'
  return '.webm'
}

function setMiniMaxCloneFile(file, durationSeconds) {
  clearRecordedAudio()
  recordedBlob.value = file
  recordedBlobUrl.value = URL.createObjectURL(file)
  cloneFile.value = file
  cloneDurationSeconds.value = Math.round(durationSeconds)
}

async function handleMiniMaxCloneAudioUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  cloneError.value = ''
  if (!/\.(mp3|m4a|wav)$/i.test(file.name)) {
    cloneError.value = '请上传 MP3、M4A 或 WAV 文件'
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    cloneError.value = '复刻音频不能超过20MB'
    return
  }
  try {
    const durationSeconds = await getAudioDuration(file)
    if (durationSeconds < 10 || durationSeconds > 300) {
      cloneError.value = '复刻音频时长需在10秒至5分钟之间'
      return
    }
    setMiniMaxCloneFile(file, durationSeconds)
    if (!cloneName.value) cloneName.value = file.name.replace(/\.(mp3|m4a|wav)$/i, '').trim().slice(0, 120)
  } catch (requestError) {
    cloneError.value = requestError?.message || '无法读取复刻音频'
  }
}

function formatClonePoints(value) {
  const points = Number(value)
  return Number.isFinite(points) ? String(points) : '0'
}

function formatCloneExpiry(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '7天内'
}

async function handleMineAudioUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  mineUploadError.value = ''
  if (!file.name.toLowerCase().endsWith('.mp3')) {
    mineUploadError.value = '请上传 MP3 文件'
    return
  }

  try {
    const duration = await getAudioDuration(file)
    if (!(duration > 3 && duration < 35)) {
      mineUploadError.value = 'MP3 文件时长需大于 3 秒且小于 35 秒'
      return
    }

    mineUploading.value = true
    const uploadResult = await uploadCanvasMedia(file, 'audio', { nodeId: 'user-voice-' + Date.now() })
    const audioUrl = uploadResult?.url || uploadResult?.result?.url
    if (!audioUrl) throw new Error('上传 MP3 失败，未获取到音频地址')
    const name = file.name.replace(/\.mp3$/i, '').trim().slice(0, 120) || '我的音色'
    await apiClient.post('/api/audio/user-voices', {
      name,
      reference_audio_url: audioUrl,
      duration_seconds: Math.round(duration)
    })
    await loadMineVoices()
  } catch (requestError) {
    mineUploadError.value = requestError?.message || '上传 MP3 失败，请稍后重试'
  } finally {
    mineUploading.value = false
  }
}

function requestDeleteMineVoice(voice) {
  if (!voice?.id) return
  voicePendingDeletion.value = voice
}

function cancelDeleteMineVoice() {
  if (!mineDeleting.value) voicePendingDeletion.value = null
}

async function confirmDeleteMineVoice() {
  const voice = voicePendingDeletion.value
  if (!voice?.id) return
  mineDeleting.value = true
  try {
    await apiClient.delete(`/api/audio/user-voices/${encodeURIComponent(voice.id)}`)
    mineVoices.value = mineVoices.value.filter(item => item.id !== voice.id)
    voicePendingDeletion.value = null
  } catch (requestError) {
    mineError.value = requestError?.message || '删除音色失败，请稍后重试'
  } finally {
    mineDeleting.value = false
  }
}

function startRecording() {
  recordError.value = ''
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    recordError.value = '当前浏览器不支持录音功能，请使用最新版 Chrome 或 Edge'
    return
  }
  recordChunks = []
  clearRecordedAudio()
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaStream = stream
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/mp3')) mimeType = 'audio/mp3'
      else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg'
      mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) recordChunks.push(event.data)
      }
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordChunks, { type: mediaRecorder.mimeType || 'audio/webm' })
        recordedBlob.value = blob
        recordedBlobUrl.value = URL.createObjectURL(blob)
        if (isMiniMax.value) {
          cloneFile.value = new File([blob], `recording-${Date.now()}${getRecordingExtension(blob.type)}`, { type: blob.type })
          cloneDurationSeconds.value = recordSeconds.value
        }
        isRecording.value = false
        stopRecordTimer()
        stopWaveform()
        stopStreamTracks()
      }
      mediaRecorder.onerror = () => {
        recordError.value = '录音失败，请检查麦克风权限'
        isRecording.value = false
        stopRecordTimer()
        stopWaveform()
        stopStreamTracks()
      }
      mediaRecorder.start()
      isRecording.value = true
      recordStartAt = Date.now()
      recordSeconds.value = 0
      recordTimer = window.setInterval(() => {
        recordSeconds.value = Math.floor((Date.now() - recordStartAt) / 1000)
        if (recordSeconds.value >= 300) stopRecording()
      }, 200)
      nextTick(() => {
        if (isRecording.value) startWaveform(stream)
      })
    })
    .catch(requestError => {
      recordError.value = '无法访问麦克风，请检查浏览权限或使用 HTTPS 环境'
      isRecording.value = false
      stopWaveform()
      stopStreamTracks()
    })
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
}

function stopStreamTracks() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop())
    mediaStream = null
  }
}

function stopRecordTimer() {
  if (recordTimer) {
    clearInterval(recordTimer)
    recordTimer = null
  }
}

function clearRecordedAudio() {
  recordedBlob.value = null
  cloneFile.value = null
  cloneDurationSeconds.value = 0
  cloneAuthorized.value = false
  if (recordedBlobUrl.value) {
    URL.revokeObjectURL(recordedBlobUrl.value)
    recordedBlobUrl.value = ''
  }
}

function startWaveform(stream) {
  stopWaveform()
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    audioContext = new AudioContext()
    audioAnalyser = audioContext.createAnalyser()
    audioAnalyser.fftSize = 1024
    audioContext.createMediaStreamSource(stream).connect(audioAnalyser)
    const samples = new Uint8Array(audioAnalyser.fftSize)

    const draw = () => {
      const canvas = waveformCanvas.value
      if (!canvas || !audioAnalyser) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const pixelRatio = window.devicePixelRatio || 1
      if (canvas.width !== width * pixelRatio || canvas.height !== height * pixelRatio) {
        canvas.width = width * pixelRatio
        canvas.height = height * pixelRatio
      }
      const context = canvas.getContext('2d')
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)
      audioAnalyser.getByteTimeDomainData(samples)
      context.beginPath()
      samples.forEach((sample, index) => {
        const x = (index / (samples.length - 1)) * width
        const y = height / 2 + ((sample - 128) / 128) * height * 0.38
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.strokeStyle = '#63e6a3'
      context.lineWidth = 1.5
      context.stroke()
      waveformFrame = window.requestAnimationFrame(draw)
    }

    audioContext.resume().catch(() => {})
    draw()
  } catch {
    stopWaveform()
  }
}

function stopWaveform() {
  if (waveformFrame) {
    window.cancelAnimationFrame(waveformFrame)
    waveformFrame = null
  }
  audioAnalyser = null
  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }
}

async function saveCloneVoice() {
  if (!canSaveClone.value) return
  cloneSaving.value = true
  cloneError.value = ''
  try {
    if (isMiniMax.value) {
      if (cloneDurationSeconds.value < 10 || cloneDurationSeconds.value > 300) {
        throw new Error('复刻音频时长需在10秒至5分钟之间')
      }
      const form = new FormData()
      form.append('file', cloneFile.value)
      form.append('model', props.model)
      form.append('name', cloneName.value)
      form.append('transcript', currentReadingText.value)
      form.append('authorized', 'true')
      form.append('spaceType', props.spaceType)
      if (props.teamId) form.append('teamId', props.teamId)
      await apiRequest('/api/audio/minimax/voices/clone', { method: 'POST', body: form, json: false })
      clearRecordedAudio()
      cloneName.value = ''
      recordSeconds.value = 0
      await switchToMine()
      return
    }
    const file = new File([recordedBlob.value], `recording-${Date.now()}.mp3`, { type: 'audio/mpeg' })
    const uploadResult = await uploadCanvasMedia(file, 'audio', { nodeId: 'voice-clone-' + Date.now() })
    const audioUrl = uploadResult?.url || uploadResult?.result?.url
    if (!audioUrl) throw new Error('上传录音失败，未获取到音频地址')
    await apiClient.post('/api/audio/user-voices', {
      name: cloneName.value,
      reference_audio_url: audioUrl,
      transcript: currentReadingText.value,
      duration_seconds: recordSeconds.value
    })
    // 重置克隆面板
    clearRecordedAudio()
    cloneName.value = ''
    recordSeconds.value = 0
    // 切到"我的音色"并刷新
    switchToMine()
  } catch (requestError) {
    cloneError.value = requestError?.message || '保存音色失败，请稍后重试'
  } finally {
    cloneSaving.value = false
  }
}

function cleanupRecording() {
  if (isRecording.value) stopRecording()
  stopStreamTracks()
  stopRecordTimer()
  stopWaveform()
  clearRecordedAudio()
}

onMounted(loadVoices)
onBeforeUnmount(() => {
  stopPreview()
  cleanupRecording()
})
</script>

<style scoped>
.voice-picker-backdrop { position: fixed; inset: 0; z-index: 12000; display: grid; place-items: center; padding: 18px; background: rgba(0, 0, 0, .68); backdrop-filter: blur(8px); }
.voice-picker { display: flex; flex-direction: column; width: min(930px, 100%); max-height: min(650px, calc(100vh - 36px)); overflow: hidden; color: #f5f5f5; background: #242424; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; box-shadow: 0 24px 72px rgba(0,0,0,.5); }
.voice-picker-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,.08); }
.voice-picker-header h2 { margin: 0; font-size: 17px; font-weight: 600; }.close-button { color: #aaa; font-size: 28px; line-height: 1; background: none; border: 0; cursor: pointer; }.close-button:hover { color: #fff; }
.voice-picker-toolbar { display: flex; gap: 10px; align-items: center; padding: 14px 20px 9px; }.voice-picker-tabs { display: flex; gap: 2px; padding: 4px; background: #343434; border-radius: 9px; }.voice-picker-tabs button { padding: 7px 10px; color: #aaa; font-size: 13px; background: transparent; border: 0; border-radius: 6px; cursor: pointer; }.voice-picker-tabs button.active { color: #fff; background: #606060; }
.voice-search { display: flex; flex: 1; gap: 7px; align-items: center; min-width: 160px; padding: 0 11px; background: #343434; border-radius: 9px; color: #aaa; }.voice-search span { font-size: 19px; }.voice-search input { width: 100%; height: 36px; color: #fff; font-size: 13px; background: transparent; border: 0; outline: 0; }
.voice-picker-filters { display: flex; gap: 7px; padding: 0 20px 9px; }.voice-picker-filters select { min-width: 98px; padding: 6px 8px; color: #ddd; font-size: 13px; background: #343434; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; outline: 0; }
.voice-picker-list { min-height: 200px; padding: 0 20px 12px; overflow-y: auto; }.voice-row { display: flex; gap: 10px; align-items: center; min-height: 66px; margin: 5px 0; padding: 9px 12px; background: #323232; border: 1px solid transparent; border-radius: 11px; }.voice-row.selected { background: #414141; border-color: rgba(255,255,255,.18); }.preview-button { width: 34px; height: 34px; color: #fff; font-size: 13px; background: #515151; border: 0; border-radius: 8px; cursor: pointer; }.preview-button:disabled { cursor: wait; opacity: .4; }.voice-main { display: grid; flex: 1; min-width: 140px; gap: 2px; }.voice-main strong { font-size: 14px; font-weight: 600; }.voice-main small { overflow: hidden; color: #d5d5d5; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.voice-main span { overflow: hidden; color: #aaa; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.voice-meta { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }.voice-meta span { padding: 3px 5px; color: #aaa; font-size: 10px; background: #444; border-radius: 4px; }.select-button { min-width: 58px; padding: 7px 10px; color: #202020; font-size: 12px; font-weight: 600; background: #fff; border: 0; border-radius: 999px; cursor: pointer; }.select-button:disabled { cursor: not-allowed; color: #aaa; background: #555; }.favorite-button { padding: 4px; color: #aaa; font-size: 20px; background: transparent; border: 0; cursor: pointer; }.favorite-button.active { color: #f4cf49; }.voice-empty { padding: 56px 0; color: #aaa; text-align: center; }
.voice-id { display: flex; gap: 6px; align-items: center; min-width: 0; }.voice-id span { color: #b9b9b9; font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }.voice-id button { flex: 0 0 auto; padding: 1px 5px; color: #ddd; font-size: 10px; line-height: 16px; background: #4b4b4b; border: 1px solid rgba(255,255,255,.12); border-radius: 4px; cursor: pointer; }.voice-id button:hover { color: #fff; background: #5b5b5b; }
.clone-panel { display: flex; flex-direction: column; gap: 16px; padding: 8px 0 16px; }
.clone-reading-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.clone-reading h3 { margin: 0; font-size: 14px; font-weight: 600; color: #f5f5f5; }
.clone-refresh-button { padding: 4px 9px; color: #ddd; font-size: 12px; background: #454545; border: 1px solid rgba(255,255,255,.1); border-radius: 6px; cursor: pointer; }
.clone-refresh-button:hover:not(:disabled) { color: #fff; background: #565656; }
.clone-refresh-button:disabled { cursor: not-allowed; opacity: .45; }
.clone-reading-text { margin: 0; padding: 14px 16px; color: #d5d5d5; font-size: 13px; line-height: 1.7; background: #323232; border-radius: 10px; }
.clone-recorder { display: flex; flex-direction: column; gap: 12px; }
.clone-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.clone-upload-hint { margin: -4px 0 0; color: #aaa; font-size: 12px; }
.minimax-clone-billing { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; padding: 10px 12px; color: #f5d88a; font-size: 12px; background: rgba(156, 119, 39, .16); border: 1px solid rgba(245, 216, 138, .22); border-radius: 8px; }
.minimax-clone-billing label { display: flex; gap: 6px; align-items: center; color: #ddd; }
.minimax-clone-expiry { color: #f5d88a !important; }
.clone-waveform { display: flex; gap: 10px; align-items: center; min-height: 56px; padding: 8px 12px; background: #2e3933; border: 1px solid rgba(99,230,163,.2); border-radius: 8px; }
.clone-waveform canvas { flex: 1; width: 100%; height: 40px; }
.clone-waveform span { flex: 0 0 auto; color: #9bd9b6; font-size: 12px; }
.clone-record-button { padding: 10px 18px; color: #202020; font-size: 13px; font-weight: 600; background: #fff; border: 0; border-radius: 999px; cursor: pointer; }
.clone-record-button.recording { color: #fff; background: #d33; }
.clone-record-button:disabled { cursor: not-allowed; color: #aaa; background: #555; }
.clone-preview { height: 36px; max-width: 100%; }
.clone-save-form { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.clone-name-input { flex: 1; min-width: 200px; height: 38px; padding: 0 12px; color: #fff; font-size: 13px; background: #343434; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; outline: 0; }
.clone-save-button { padding: 9px 18px; color: #202020; font-size: 13px; font-weight: 600; background: #fff; border: 0; border-radius: 999px; cursor: pointer; }
.clone-save-button:disabled { cursor: not-allowed; color: #aaa; background: #555; }
.clone-error { color: #f5a3a3; font-size: 12px; }
.mine-upload { display: flex; gap: 10px; align-items: center; margin: 8px 0 12px; }
.mine-upload-input { display: none; }
.mine-upload-button { padding: 8px 14px; color: #202020; font-size: 12px; font-weight: 600; background: #fff; border: 0; border-radius: 999px; cursor: pointer; }
.mine-upload-button:disabled { cursor: wait; color: #aaa; background: #555; }
.mine-upload span { color: #aaa; font-size: 12px; }
.delete-button { color: #d5a0a0; font-size: 13px; padding: 4px 10px; background: transparent; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; cursor: pointer; }
.delete-button:hover { color: #fff; background: #5b3838; }
.delete-confirm-backdrop { position: fixed; inset: 0; z-index: 2; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.56); backdrop-filter: blur(4px); }
.delete-confirm-card { width: min(360px, 100%); padding: 24px; color: #f5f5f5; text-align: center; background: #2d2d2d; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,.48); }
.delete-confirm-icon { display: grid; place-items: center; width: 38px; height: 38px; margin: 0 auto 14px; color: #f2a1a1; font-size: 21px; font-weight: 700; background: rgba(207,65,65,.16); border: 1px solid rgba(227,91,91,.42); border-radius: 50%; }
.delete-confirm-card h2 { margin: 0 0 9px; font-size: 18px; }
.delete-confirm-card p { margin: 0; color: #d4d4d4; font-size: 13px; line-height: 1.6; word-break: break-word; }
.delete-confirm-card .delete-confirm-warning { margin-top: 5px; color: #e69b9b; font-size: 12px; }
.delete-confirm-actions { display: flex; gap: 10px; justify-content: center; margin-top: 21px; }
.delete-confirm-actions button { min-width: 104px; padding: 9px 15px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; }
.delete-confirm-cancel { color: #e5e5e5; background: #464646; border: 1px solid rgba(255,255,255,.12); }
.delete-confirm-submit { color: #fff; background: #c83f3f; border: 1px solid #d85a5a; }
.delete-confirm-actions button:hover:not(:disabled) { filter: brightness(1.12); }
.delete-confirm-actions button:disabled { cursor: wait; opacity: .55; }
.voice-picker-pagination { display: flex; gap: 5px; align-items: center; justify-content: center; padding: 0 20px 15px; }.voice-picker-pagination button { min-width: 28px; padding: 5px 8px; color: #ccc; font-size: 12px; background: #343434; border: 1px solid rgba(255,255,255,.08); border-radius: 6px; cursor: pointer; }.voice-picker-pagination button.active { color: #202020; background: #fff; }.voice-picker-pagination button:disabled { cursor: not-allowed; opacity: .4; }.voice-pagination-ellipsis { width: 18px; color: #888; font-size: 15px; line-height: 1; text-align: center; }.voice-pagination-summary { margin-left: 4px; color: #999; font-size: 11px; white-space: nowrap; }
@media (max-width: 760px) { .voice-picker-backdrop { padding: 12px; }.voice-picker-header, .voice-picker-toolbar, .voice-picker-filters, .voice-picker-list { padding-left: 16px; padding-right: 16px; }.voice-picker-toolbar { align-items: stretch; flex-direction: column; }.voice-picker-tabs { overflow-x: auto; }.voice-picker-tabs button { flex: 0 0 auto; }.voice-row { gap: 10px; padding: 12px; }.voice-meta { display: none; }.voice-main strong { font-size: 15px; } }
</style>
