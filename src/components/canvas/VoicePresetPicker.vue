<template>
  <div class="voice-picker-backdrop" @click.self="emit('close')">
    <section class="voice-picker" role="dialog" aria-modal="true" :aria-label="translateUi('uiMessages.mf59a1ecfa906')">
      <header class="voice-picker-header">
        <h2>{{ translateUi('uiMessages.mf59a1ecfa906') }}</h2>
        <button type="button" class="close-button" :aria-label="translateUi('common.close')" @click="emit('close')">×</button>
      </header>

      <div class="voice-picker-toolbar">
        <div class="voice-picker-tabs" role="tablist" :aria-label="translateUi('uiMessages.me72a98c29f36')">
          <button type="button" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">{{ translateUi('uiMessages.m27d2cbd9672d') }}</button>
          <button v-if="!isMiniMax && !isFish" type="button" :class="{ active: activeTab === 'favorites' }" @click="activeTab = 'favorites'">{{ translateUi('uiMessages.m92118bfec471') }}</button>
          <button type="button" :class="{ active: activeTab === 'mine' }" @click="switchToMine">{{ translateUi('uiMessages.m3eb9b0316310') }}</button>
          <button v-if="(!isMiniMax && !isFish) || isMiniMaxCloneEnabled || isFishCloneEnabled" type="button" :class="{ active: activeTab === 'clone' }" @click="activeTab = 'clone'">{{ translateUi('uiMessages.mc0d8a2c5e363') }}</button>
        </div>
        <label class="voice-search">
          <span aria-hidden="true">⌕</span>
          <input v-model.trim="keyword" type="search" :placeholder="translateUi('uiMessages.m7b3bc6e622eb')" />
        </label>
      </div>

      <div v-if="!isMiniMax && !isFish" class="voice-picker-filters">
        <select v-model="locale"><option value="">{{ translateUi('uiMessages.m95ee12babffe') }}</option><option v-for="item in locales" :key="item" :value="item">{{ localeLabels[item] || item }}</option></select>
        <select v-model="gender"><option value="">{{ translateUi('uiMessages.m8a860413090c') }}</option><option value="female">{{ translateUi('uiMessages.m12a25ecd3917') }}</option><option value="male">{{ translateUi('uiMessages.m221a8fbb1cc2') }}</option></select>
        <select v-model="style"><option value="">{{ translateUi('uiMessages.md33ee59a8236') }}</option><option v-for="item in styles" :key="item" :value="item">{{ styleLabels[item] || item }}</option></select>
      </div>

      <div v-if="activeTab === 'clone'" class="voice-picker-list">
        <div class="clone-panel">
          <div class="clone-reading">
            <div class="clone-reading-header">
              <h3>{{ translateUi('uiMessages.mdd5872162737') }}</h3>
              <button type="button" class="clone-refresh-button" :disabled="isRecording || readingTexts.length < 2" @click="refreshReadingText">{{ translateUi('uiMessages.m258fb70e6c91') }}</button>
            </div>
            <p v-if="currentReadingText" class="clone-reading-text">{{ currentReadingText }}</p>
            <p v-else class="voice-empty">{{ translateUi('uiMessages.m4d5b8c93b491') }}</p>
          </div>
          <div class="clone-recorder">
            <div class="clone-controls">
              <button v-if="!isRecording" type="button" class="clone-record-button" @click="startRecording">{{ translateUi('uiMessages.mee9247035880') }}</button>
              <button v-else type="button" class="clone-record-button recording" @click="stopRecording">{{ translateUi('uiMessages.m949ba32bcb6e', { value1: (recordSeconds) }) }}</button>
              <input v-if="isMiniMax || isFish" ref="cloneAudioInput" type="file" accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" class="mine-upload-input" @change="handleMiniMaxCloneAudioUpload" />
              <button v-if="isMiniMax || isFish" type="button" class="mine-upload-button" :disabled="cloneSaving" @click="openMiniMaxCloneAudioUpload">{{ translateUi('canvas.audioNode.upload') }}</button>
              <audio v-if="recordedBlobUrl" :src="recordedBlobUrl" controls class="clone-preview"></audio>
            </div>
            <p v-if="isMiniMax || isFish" class="clone-upload-hint">{{ translateUi('uiMessages.m30ba9e69834d') }}</p>
            <div v-if="isRecording" class="clone-waveform" role="status">
              <canvas ref="waveformCanvas" :aria-label="translateUi('uiMessages.m7ed244e99207')"></canvas>
              <span>{{ translateUi('uiMessages.m72b708ed3323') }}</span>
            </div>
            <p v-if="recordError" class="clone-error">{{ recordError }}</p>
            <div v-if="recordedBlob" class="clone-save-form">
              <input v-model.trim="cloneName" type="text" :placeholder="translateUi('uiMessages.mff0e2d630faf')" class="clone-name-input" />
              <button type="button" class="clone-save-button" :disabled="!canSaveClone" @click="saveCloneVoice">
                {{ cloneSaving ? translateUi('uiMessages.mff509c9ba052') : translateUi('uiMessages.m0956175192de') }}
              </button>
            </div>
            <div v-if="(isMiniMax || isFish) && recordedBlob" class="minimax-clone-billing">
              <strong>{{ translateUi('uiMessages.m0b7f798d5bde', { value1: (formatClonePoints(clonePointsCost)) }) }}</strong>
              <label><input v-model="cloneAuthorized" type="checkbox" /> {{ translateUi('uiMessages.m41af1648f0e5') }}</label>
            </div>
            <p v-if="cloneError" class="clone-error">{{ cloneError }}</p>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'mine'" class="voice-picker-list">
        <div v-if="!isMiniMax && !isFish" class="mine-upload">
          <input ref="mineAudioInput" type="file" accept="audio/mpeg,.mp3" class="mine-upload-input" @change="handleMineAudioUpload" />
          <button type="button" class="mine-upload-button" :disabled="mineUploading" @click="openMineAudioUpload">{{ mineUploading ? translateUi('uiMessages.mce1c9d61565f') : translateUi('uiMessages.m0dc94b186f5f') }}</button>
          <span>{{ translateUi('uiMessages.ma065e851f2b7') }}</span>
        </div>
        <p v-if="mineUploadError" class="clone-error">{{ mineUploadError }}</p>
        <p v-if="mineLoading" class="voice-empty">{{ translateUi('uiMessages.m4506bd1f51da') }}</p>
        <p v-else-if="mineError" class="voice-empty">{{ mineError }}</p>
        <p v-else-if="!mineVoices.length" class="voice-empty">{{ isMiniMax ? translateUi('uiMessages.m9c4a6ddcedf8') : isFish ? translateUi('uiMessages.m340fa08d341a') : translateUi('uiMessages.m568220ae30ea') }}</p>
        <article v-for="voice in mineVoices" :key="voice.id" class="voice-row" :class="{ selected: modelValue?.id === voice.id }">
          <button type="button" class="preview-button" :disabled="!voice.hasPreview" :title="voice.hasPreview ? translateUi('uiMessages.m7bd037a4c443') : translateUi('uiMessages.m2e17cf356090')" @click="togglePreview(voice)">
            {{ playingId === voice.id ? '■' : '▶' }}
          </button>
          <div class="voice-main">
            <strong>{{ voice.name }}</strong>
            <small v-if="voice.transcript">{{ voice.transcript }}</small>
            <small v-if="isMiniMax && voice.cloneExpiresAt && !voice.cloneActivatedAt" class="minimax-clone-expiry">{{ translateUi('uiMessages.m95f8b71150a0', { value1: (formatCloneExpiry(voice.cloneExpiresAt)) }) }}</small>
          </div>
          <button type="button" class="select-button" :disabled="!voice.hasPreview && !isMiniMax && !isFish" @click="emit('select', voice)">{{ modelValue?.id === voice.id ? translateUi('uiMessages.m7ecf1cde6486') : translateUi('uiMessages.mc11330b85234') }}</button>
          <button type="button" class="favorite-button delete-button" :title="translateUi('common.delete')" @click="requestDeleteMineVoice(voice)">{{ translateUi('common.delete') }}</button>
        </article>
      </div>
      <div v-else class="voice-picker-list">
        <p v-if="loading" class="voice-empty">{{ translateUi('uiMessages.m57ea117cf39a') }}</p>
        <p v-else-if="error" class="voice-empty">{{ error }}</p>
        <p v-else-if="!filteredVoices.length" class="voice-empty">{{ translateUi('uiMessages.mde6a50beb8cf') }}</p>
        <article v-for="voice in paginatedVoices" :key="voice.id" class="voice-row" :class="{ selected: modelValue?.id === voice.id }">
          <button type="button" class="preview-button" :disabled="previewLoadingId === voice.id || (!voice.hasPreview && !(isMiniMax && voice.isSystem))" :title="previewButtonTitle(voice)" @click="togglePreview(voice)">
            {{ previewLoadingId === voice.id ? '…' : playingId === voice.id ? '■' : '▶' }}
          </button>
          <div class="voice-main">
            <strong>{{ voice.name }}</strong>
            <small v-if="voice.description">{{ voice.description }}</small>
            <span>{{ voice.tags?.join(' · ') }}</span>
            <div v-if="voice.sourceVoice" class="voice-id">
              <span>{{ translateUi('uiMessages.m37562774b74c', { value1: (voice.sourceVoice) }) }}</span>
              <button type="button" @click.stop="copyVoiceId(voice.sourceVoice)">{{ copiedVoiceId === voice.sourceVoice ? translateUi('common.copied') : translateUi('common.copy') }}</button>
            </div>
          </div>
          <div class="voice-meta"><span>{{ localeLabels[voice.locale] || voice.locale }}</span><span>{{ genderLabel(voice.gender) }}</span><span>{{ styleLabels[voice.style] || voice.style }}</span></div>
          <button type="button" class="select-button" :disabled="!voice.hasPreview && !isMiniMax && !isFish" @click="emit('select', voice)">{{ modelValue?.id === voice.id ? translateUi('uiMessages.m7ecf1cde6486') : translateUi('uiMessages.mc11330b85234') }}</button>
          <button v-if="!isMiniMax && !isFish" type="button" class="favorite-button" :class="{ active: voice.isFavorite }" :title="voice.isFavorite ? translateUi('uiMessages.mdca60869e7d2') : translateUi('canvas.assetPanel.favorite')" @click="toggleFavorite(voice)">{{ voice.isFavorite ? '★' : '☆' }}</button>
        </article>
      </div>
      <footer v-if="activeTab !== 'clone' && activeTab !== 'mine' && pageCount > 1" class="voice-picker-pagination" :aria-label="translateUi('uiMessages.m5b691b13fc0b')">
        <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">{{ translateUi('uiMessages.mc9b9ae7a6144') }}</button>
        <template v-for="item in visiblePageItems" :key="item.key">
          <span v-if="item.type === 'ellipsis'" class="voice-pagination-ellipsis" aria-hidden="true">…</span>
          <button v-else type="button" :class="{ active: currentPage === item.page }" :aria-current="currentPage === item.page ? 'page' : undefined" @click="currentPage = item.page">{{ item.page }}</button>
        </template>
        <button type="button" :disabled="currentPage === pageCount" @click="currentPage += 1">{{ translateUi('uiMessages.m8a8542f69648') }}</button>
        <span class="voice-pagination-summary">{{ translateUi('uiMessages.m494b82c0e36c', { value1: (currentPage), value2: (pageCount) }) }}</span>
      </footer>
    </section>
    <div v-if="voicePendingDeletion" class="delete-confirm-backdrop" @click.self="cancelDeleteMineVoice">
      <section class="delete-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <div class="delete-confirm-icon" aria-hidden="true">!</div>
        <h2 id="delete-confirm-title">{{ translateUi('uiMessages.m1b9bb66c6062') }}</h2>
        <p>{{ translateUi('uiMessages.m3a70201e1e24', { value1: (voicePendingDeletion.name) }) }}</p>
        <p class="delete-confirm-warning">{{ translateUi('uiMessages.mee185bcc30b0') }}</p>
        <div class="delete-confirm-actions">
          <button type="button" class="delete-confirm-cancel" :disabled="mineDeleting" @click="cancelDeleteMineVoice">{{ translateUi('common.cancel') }}</button>
          <button type="button" class="delete-confirm-submit" :disabled="mineDeleting" @click="confirmDeleteMineVoice">{{ mineDeleting ? translateUi('uiMessages.m5e8e7af57abb') : translateUi('uiMessages.ma3ea3c17b401') }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

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
const isFish = computed(() => props.provider === 'fish')
const isMiniMaxCloneEnabled = computed(() => isMiniMax.value && Number.isFinite(props.clonePointsCost) && props.clonePointsCost >= 0)
const isFishCloneEnabled = computed(() => isFish.value && Number.isFinite(props.clonePointsCost) && props.clonePointsCost >= 0)
const voices = ref([])
const activeTab = ref('all')
const keyword = ref('')
const locale = ref(isMiniMax.value || isFish.value ? '' : 'zh-CN')
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

const styleLabels = { get narration() { return translateUi('uiMessages.m101f6e6d6095') }, get conversational() { return translateUi('uiMessages.m6bf6d3f3d626') }, get advertising() { return translateUi('uiMessages.m5f9f1409615a') }, get emotional() { return translateUi('uiMessages.m3e741dd4830a') }, get news() { return translateUi('uiMessages.m71d9a93075be') } }
const localeLabels = {
  'zh-CN': translateUi('uiMessages.m4eaa632ed776'),
  'zh-TW': translateUi('uiMessages.me1c18b74f239'),
  'yue-HK': translateUi('uiMessages.md896f2009d96'),
  'en-US': translateUi('uiMessages.m95072679248b'),
  'ja-JP': translateUi('uiMessages.m3a944ddb3868'),
  'ko-KR': translateUi('uiMessages.m259cdcf75199'),
  'es-ES': translateUi('uiMessages.ma559a3e8e474'),
  'es-MX': translateUi('uiMessages.madb88f66f1a1'),
  'es-AR': translateUi('uiMessages.m5761f2a6dafc'),
  'fr-FR': translateUi('uiMessages.m99cdf164a814'),
  'de-DE': translateUi('uiMessages.m7566092dce72'),
  'pt-BR': translateUi('uiMessages.m949a18a9deda'),
  'pt-PT': translateUi('uiMessages.md165352d62b9'),
  'ru-RU': translateUi('uiMessages.mbdb6608a4dc8'),
  'ar-SA': translateUi('uiMessages.mfc9a0bdeb77f'),
  'hi-IN': translateUi('uiMessages.m99012cae1587'),
  'id-ID': translateUi('uiMessages.m7d4387ca81dd'),
  'tr-TR': translateUi('uiMessages.m3c647ca8d8cc')
}
const locales = computed(() => [...new Set(voices.value.map(item => item.locale))])
const styles = computed(() => [...new Set(voices.value.map(item => item.style))])
const filteredVoices = computed(() => {
  const query = keyword.value.toLocaleLowerCase()
  return voices.value.filter(voice => {
    const searchable = [voice.name, voice.description, voice.locale, voice.gender, voice.style, ...(voice.tags || [])].join(' ').toLocaleLowerCase()
    return ((isMiniMax.value || isFish.value) || activeTab.value !== 'favorites' || voice.isFavorite) &&
      (!query || searchable.includes(query)) &&
      ((isMiniMax.value || isFish.value) || !locale.value || voice.locale === locale.value) &&
      ((isMiniMax.value || isFish.value) || !gender.value || voice.gender === gender.value) &&
      ((isMiniMax.value || isFish.value) || !style.value || voice.style === style.value)
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
  return value === 'female' ? translateUi('uiMessages.m0ab4610b9257') : value === 'male' ? translateUi('uiMessages.m4e79758a9900') : value
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
    error.value = translateUi('uiMessages.meb43fe89bee6')
  }
}

async function loadVoices() {
  loading.value = true
  error.value = ''
  try {
    const response = isMiniMax.value
      ? await apiClient.get(`/api/audio/minimax/system-voices?model=${encodeURIComponent(props.model)}`)
      : isFish.value
        ? await apiClient.get(`/api/audio/fish/voices?model=${encodeURIComponent(props.model)}`)
        : await apiClient.get('/api/audio/voice-presets')
    voices.value = response.data || []
  } catch (requestError) {
    error.value = requestError?.message || translateUi('uiMessages.m36b51d2a84f9')
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
  if (previewLoadingId.value === voice.id) return translateUi('uiMessages.m12001224a3f1')
  if (voice.hasPreview) return translateUi('uiMessages.m7bd037a4c443')
  return isMiniMax.value && voice.isSystem ? translateUi('uiMessages.m82b8bc672848') : translateUi('uiMessages.m2e17cf356090')
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
  if (response.status === 'failed') throw new Error(response.data?.error_message || translateUi('uiMessages.m4a36119a9cda'))
  if (attempts >= 18) throw new Error(translateUi('uiMessages.m2872dbf2d56e'))
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
    error.value = requestError?.message || translateUi('uiMessages.m4a36119a9cda')
  } finally {
    if (previewLoadingId.value === voice.id) previewLoadingId.value = ''
  }
}

async function toggleFavorite(voice) {
  try {
    const response = await apiClient.post(`/api/audio/voice-presets/${encodeURIComponent(voice.id)}/favorite`)
    voice.isFavorite = Boolean(response.isFavorite)
  } catch (requestError) {
    error.value = requestError?.message || translateUi('uiMessages.mc674b208ca0c')
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
  if (!isMiniMax.value && !isFish.value) return Boolean(recordedBlob.value)
  return (isMiniMaxCloneEnabled.value || isFishCloneEnabled.value) && Boolean(cloneFile.value) && cloneDurationSeconds.value >= 10 && cloneDurationSeconds.value <= 300 && cloneAuthorized.value
})

function refreshReadingText() {
  if (readingTexts.value.length < 2 || isRecording.value) return
  currentReadingTextIndex.value = (currentReadingTextIndex.value + 1) % readingTexts.value.length
  clearRecordedAudio()
}

async function loadMineVoices(attempt = 0) {
  mineLoading.value = true
  mineError.value = ''
  try {
    const providerQuery = isMiniMax.value
      ? `?provider=minimax&_t=${Date.now()}`
      : isFish.value
        ? `?provider=fish&_t=${Date.now()}`
        : `?_t=${Date.now()}`
    const response = await apiClient.get(`/api/audio/user-voices${providerQuery}`)
    const list = Array.isArray(response?.data) ? response.data : []
    mineVoices.value = list.map(item => ({
      id: item.id,
      name: item.name,
      previewUrl: item.reference_audio_url || item.previewUrl || '',
      transcript: item.transcript || '',
      sourceVoice: item.sourceVoice || ((isMiniMax.value || isFish.value) ? '' : item.reference_audio_url || ''),
      provider: item.provider || (isMiniMax.value ? 'minimax' : isFish.value ? 'fish' : 'reference'),
      cloneExpiresAt: item.cloneExpiresAt || null,
      cloneActivatedAt: item.cloneActivatedAt || null,
      hasPreview: Boolean(item.reference_audio_url || item.previewUrl)
    }))
  } catch (requestError) {
    const message = requestError?.message || ''
    const isTransientNetworkError = /Failed to fetch|fetch failed|NetworkError|Load failed|ERR_CONNECTION/i.test(message)
    if (isTransientNetworkError && attempt < 1) {
      await new Promise(resolve => window.setTimeout(resolve, 300))
      return loadMineVoices(attempt + 1)
    }
    mineError.value = message || translateUi('uiMessages.mebfc94d55883')
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
      reject(new Error(translateUi('uiMessages.m1618c1b742c5')))
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
    cloneError.value = translateUi('uiMessages.m7ebccbe10d88')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    cloneError.value = translateUi('uiMessages.ma58811bc72e9')
    return
  }
  try {
    const durationSeconds = await getAudioDuration(file)
    if (durationSeconds < 10 || durationSeconds > 300) {
      cloneError.value = translateUi('uiMessages.m30beb3ad969b')
      return
    }
    setMiniMaxCloneFile(file, durationSeconds)
    if (!cloneName.value) cloneName.value = file.name.replace(/\.(mp3|m4a|wav)$/i, '').trim().slice(0, 120)
  } catch (requestError) {
    cloneError.value = requestError?.message || translateUi('uiMessages.m48207f8eb6e9')
  }
}

function formatClonePoints(value) {
  const points = Number(value)
  return Number.isFinite(points) ? String(points) : '0'
}

function formatCloneExpiry(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(uiLanguage.value, { hour12: false }) : translateUi('uiMessages.mb794d5e76145')
}

async function handleMineAudioUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  mineUploadError.value = ''
  if (!file.name.toLowerCase().endsWith('.mp3')) {
    mineUploadError.value = translateUi('uiMessages.mc20ea07961b4')
    return
  }

  try {
    const duration = await getAudioDuration(file)
    if (!(duration > 3 && duration < 35)) {
      mineUploadError.value = translateUi('uiMessages.m176aaa53e0ee')
      return
    }

    mineUploading.value = true
    const uploadResult = await uploadCanvasMedia(file, 'audio', { nodeId: 'user-voice-' + Date.now() })
    const audioUrl = uploadResult?.url || uploadResult?.result?.url
    if (!audioUrl) throw new Error(translateUi('uiMessages.mc2f31c9ed349'))
    const name = file.name.replace(/\.mp3$/i, '').trim().slice(0, 120) || translateUi('uiMessages.m3eb9b0316310')
    await apiClient.post('/api/audio/user-voices', {
      name,
      reference_audio_url: audioUrl,
      duration_seconds: Math.round(duration)
    })
    await loadMineVoices()
  } catch (requestError) {
    mineUploadError.value = requestError?.message || translateUi('uiMessages.mc368414725c1')
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
    mineError.value = requestError?.message || translateUi('uiMessages.md4cb2ba34b87')
  } finally {
    mineDeleting.value = false
  }
}

function startRecording() {
  recordError.value = ''
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    recordError.value = translateUi('uiMessages.macd7d1fca1ad')
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
        if (isMiniMax.value || isFish.value) {
          cloneFile.value = new File([blob], `recording-${Date.now()}${getRecordingExtension(blob.type)}`, { type: blob.type })
          cloneDurationSeconds.value = recordSeconds.value
        }
        isRecording.value = false
        stopRecordTimer()
        stopWaveform()
        stopStreamTracks()
      }
      mediaRecorder.onerror = () => {
        recordError.value = translateUi('uiMessages.mbe28dce35515')
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
      recordError.value = translateUi('uiMessages.mcecdaa5f2217')
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
    if (isMiniMax.value || isFish.value) {
      if (cloneDurationSeconds.value < 10 || cloneDurationSeconds.value > 300) {
        throw new Error(translateUi('uiMessages.m30beb3ad969b'))
      }
      const form = new FormData()
      form.append('file', cloneFile.value)
      form.append('model', props.model)
      form.append('name', cloneName.value)
      form.append('transcript', currentReadingText.value)
      form.append('authorized', 'true')
      form.append('spaceType', props.spaceType)
      if (props.teamId) form.append('teamId', props.teamId)
      await apiRequest(isFish.value ? '/api/audio/fish/voices/clone' : '/api/audio/minimax/voices/clone', { method: 'POST', body: form, json: false })
      clearRecordedAudio()
      cloneName.value = ''
      recordSeconds.value = 0
      await switchToMine()
      return
    }
    const file = new File([recordedBlob.value], `recording-${Date.now()}.mp3`, { type: 'audio/mpeg' })
    const uploadResult = await uploadCanvasMedia(file, 'audio', { nodeId: 'voice-clone-' + Date.now() })
    const audioUrl = uploadResult?.url || uploadResult?.result?.url
    if (!audioUrl) throw new Error(translateUi('uiMessages.ma23ce45df172'))
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
    cloneError.value = requestError?.message || translateUi('uiMessages.m2c3eb1fda63a')
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
:root.canvas-theme-light .voice-picker-backdrop { background: rgba(0, 0, 0, .28); }
:root.canvas-theme-light .voice-picker { color: #171717; background: #fff; border-color: #dedede; box-shadow: 0 24px 72px rgba(0,0,0,.16); }
:root.canvas-theme-light .voice-picker-header { border-bottom-color: #ededed; }
:root.canvas-theme-light .close-button { color: #777; }
:root.canvas-theme-light .close-button:hover { color: #171717; }
:root.canvas-theme-light .voice-picker-tabs, :root.canvas-theme-light .voice-search, :root.canvas-theme-light .voice-picker-filters select, :root.canvas-theme-light .clone-name-input, :root.canvas-theme-light .voice-picker-pagination button { color: #303030; background: #f2f2f2; border-color: #dedede; }
:root.canvas-theme-light .voice-picker-tabs button { color: #777; }
:root.canvas-theme-light .voice-picker-tabs button.active { color: #171717; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
:root.canvas-theme-light .voice-search input { color: #171717; }
:root.canvas-theme-light .voice-row, :root.canvas-theme-light .clone-reading-text { color: #303030; background: #f7f7f7; }
:root.canvas-theme-light .voice-row.selected { background: #ededed; border-color: #cfcfcf; }
:root.canvas-theme-light .preview-button { color: #171717; background: #e5e5e5; }
:root.canvas-theme-light .voice-main small { color: #656565; }
:root.canvas-theme-light .voice-main span, :root.canvas-theme-light .voice-meta span, :root.canvas-theme-light .voice-id span, :root.canvas-theme-light .favorite-button, :root.canvas-theme-light .voice-empty, :root.canvas-theme-light .clone-upload-hint, :root.canvas-theme-light .mine-upload span, :root.canvas-theme-light .voice-pagination-summary { color: #777; }
:root.canvas-theme-light .voice-meta span, :root.canvas-theme-light .voice-id button, :root.canvas-theme-light .clone-refresh-button { color: #303030; background: #ededed; border-color: #dedede; }
:root.canvas-theme-light .voice-id button:hover, :root.canvas-theme-light .clone-refresh-button:hover:not(:disabled) { color: #171717; background: #e0e0e0; }
:root.canvas-theme-light .select-button, :root.canvas-theme-light .clone-record-button, :root.canvas-theme-light .clone-save-button, :root.canvas-theme-light .mine-upload-button, :root.canvas-theme-light .voice-picker-pagination button.active { color: #fff; background: #171717; }
:root.canvas-theme-light .select-button:disabled, :root.canvas-theme-light .clone-record-button:disabled, :root.canvas-theme-light .clone-save-button:disabled, :root.canvas-theme-light .mine-upload-button:disabled { color: #999; background: #e5e5e5; }
:root.canvas-theme-light .clone-reading h3 { color: #171717; }
:root.canvas-theme-light .minimax-clone-billing { color: #8a6116; background: #fdf6e3; border-color: #f1dfb0; }
:root.canvas-theme-light .minimax-clone-billing label { color: #303030; }
:root.canvas-theme-light .minimax-clone-expiry { color: #8a6116 !important; }
:root.canvas-theme-light .clone-waveform { background: #eef8f2; border-color: #c8ead6; }
:root.canvas-theme-light .clone-waveform span { color: #2f7d55; }
:root.canvas-theme-light .delete-button { color: #b42318; border-color: #dedede; }
:root.canvas-theme-light .delete-button:hover { color: #fff; background: #c83f3f; }
:root.canvas-theme-light .delete-confirm-backdrop { background: rgba(0,0,0,.28); }
:root.canvas-theme-light .delete-confirm-card { color: #171717; background: #fff; border-color: #dedede; box-shadow: 0 20px 50px rgba(0,0,0,.16); }
:root.canvas-theme-light .delete-confirm-card p { color: #656565; }
:root.canvas-theme-light .delete-confirm-cancel { color: #303030; background: #f2f2f2; border-color: #dedede; }
@media (max-width: 760px) { .voice-picker-backdrop { padding: 12px; }.voice-picker-header, .voice-picker-toolbar, .voice-picker-filters, .voice-picker-list { padding-left: 16px; padding-right: 16px; }.voice-picker-toolbar { align-items: stretch; flex-direction: column; }.voice-picker-tabs { overflow-x: auto; }.voice-picker-tabs button { flex: 0 0 auto; }.voice-row { gap: 10px; padding: 12px; }.voice-meta { display: none; }.voice-main strong { font-size: 15px; } }
</style>
