<script setup>
import { t as translateUi } from '@/i18n'

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import {
  createDigitalHuman,
  createDigitalHumanConsent,
  getDigitalHumanChannels,
  getDigitalHumanTask
} from '@/api/canvas/digital-humans'
import { showConfirm, showToast } from '@/composables/useCanvasDialog'

const props = defineProps({
  assets: { type: Array, default: () => [] }
})

const emit = defineEmits(['insert-image', 'refresh', 'upsert'])
const channels = ref([])
const selectedChannelId = ref('')
const name = ref('')
const sourceFile = ref(null)
const fileInputRef = ref(null)
const isDraggingFile = ref(false)
const training = ref(false)
const errorMessage = ref('')
const consentUrl = ref('')
let pollTimer = null

const humans = computed(() => props.assets.filter(asset => asset.type === 'digital-human'))
const trainingPointsCost = computed(() => {
  const channel = channels.value.find(item => item.id === selectedChannelId.value)
  const pricing = channel?.pricing || {}
  const points = sourceFile.value?.type?.startsWith('image/')
    ? pricing.photoAvatarTraining
    : pricing.digitalTwinTraining
  return Number.isFinite(Number(points)) && Number(points) > 0 ? Number(points) : 0
})

function metadata(asset) {
  if (typeof asset?.metadata === 'string') {
    try { return JSON.parse(asset.metadata) } catch { return {} }
  }
  return asset?.metadata || {}
}

function trainingStatusLabel(status) {
  const labels = {
    submitting: translateUi('uiMessages.m6b70462dbb4c'),
    pending: translateUi('uiMessages.mb5c80acce1ea'),
    processing: translateUi('uiMessages.m63c2322f1c10'),
    pending_consent: translateUi('uiMessages.m43d902bfca1e'),
    completed: translateUi('uiMessages.m382d4e628eff'),
    failed: translateUi('uiMessages.m19532f9cdee0')
  }
  return labels[status] || translateUi('uiMessages.m63c2322f1c10')
}

function notifyTrainingStatus(asset, result) {
  const nextAsset = result?.asset || asset
  const nextStatus = metadata(nextAsset).status || result?.status || ''
  const previousStatus = metadata(asset).status || ''
  if (!nextStatus || nextStatus === previousStatus) return

  const assetName = nextAsset?.name || asset?.name || translateUi('uiMessages.mb901660d9e33')
  if (nextStatus === 'completed') {
    showToast(translateUi('uiMessages.mf1f9628232eb', { value1: (assetName) }), 'success', 5000)
  } else if (nextStatus === 'failed') {
    showToast(translateUi('uiMessages.m1adb00e188cc', { value1: (assetName), value2: (result?.error || metadata(nextAsset).error || translateUi('uiMessages.mc6fb9f302d92')) }), 'error', 6000)
  } else if (nextStatus === 'pending_consent') {
    showToast(translateUi('uiMessages.m7bbed6527852', { value1: (assetName) }), 'warning', 5000)
  }
}

function digitalHumanPreviewUrl(asset) {
  return metadata(asset).previewUrl || asset?.thumbnail_url || ''
}

async function loadChannels() {
  try {
    const result = await getDigitalHumanChannels()
    channels.value = result.channels || []
    if (!selectedChannelId.value && channels.value[0]) selectedChannelId.value = channels.value[0].id
  } catch (error) {
    errorMessage.value = error.message || translateUi('uiMessages.mc1dfbe56fa96')
  }
}

function handleFileChange(event) {
  const file = event.target.files?.[0] || null
  if (!file) return
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    errorMessage.value = translateUi('uiMessages.m4552d2195b3c')
    event.target.value = ''
    return
  }
  sourceFile.value = file
  if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '')
}

function handleDrop(event) {
  isDraggingFile.value = false
  const file = event.dataTransfer?.files?.[0] || null
  if (!file) return
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    errorMessage.value = translateUi('uiMessages.m4552d2195b3c')
    return
  }
  sourceFile.value = file
  errorMessage.value = ''
  if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '')
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function submitTraining() {
  if (!sourceFile.value || !name.value.trim() || !selectedChannelId.value || training.value) return
  training.value = true
  errorMessage.value = ''
  try {
    const kind = sourceFile.value.type.startsWith('image/') ? 'photo_avatar' : 'digital_twin'
    const trainingLabel = kind === 'photo_avatar' ? translateUi('uiMessages.mc85b4243b866') : translateUi('uiMessages.mbad0a6586b64')
    if (trainingPointsCost.value > 0) {
      const confirmed = await showConfirm(
        translateUi('uiMessages.mf818d56ffe78', { value1: (trainingLabel), value2: (trainingPointsCost.value) }),
        translateUi('uiMessages.m89c1aef7687d'),
        {
          detail: translateUi('uiMessages.m39daa1de18d6'),
          confirmText: translateUi('uiMessages.m5132ee4f77a4')
        }
      )
      if (!confirmed) return
    }
    const upload = await uploadCanvasMedia(sourceFile.value, kind === 'photo_avatar' ? 'image' : 'video')
    if (upload.status !== 'completed' || !upload.url) throw new Error(translateUi('uiMessages.m7779eb2e41ee'))
    const result = await createDigitalHuman({
      name: name.value.trim(),
      kind,
      sourceUrl: upload.url,
      channelId: selectedChannelId.value
    })
    if (result.asset) emit('upsert', result.asset)
    if (result.status === 'failed') {
      const message = result.asset?.metadata?.error || translateUi('uiMessages.m7996034828e8')
      errorMessage.value = message
      showToast(translateUi('uiMessages.m8d248a7ab28d', { value1: (message) }), 'error', 6000)
    } else if (result.status === 'completed') {
      showToast(translateUi('uiMessages.ma2858677ecec'), 'success', 5000)
    } else if (result.status === 'pending_consent') {
      showToast(translateUi('uiMessages.m05bba528fddc'), 'warning', 5000)
    } else {
      showToast(translateUi('uiMessages.m1901610b7d39'), 'info', 4000)
    }
    name.value = ''
    sourceFile.value = null
  } catch (error) {
    const message = error.message || translateUi('uiMessages.m17b17d70b5ff')
    errorMessage.value = message
    showToast(translateUi('uiMessages.m0adfd4fe7a6a', { value1: (message) }), 'error', 6000)
  } finally {
    training.value = false
  }
}

async function refreshTrainingStates() {
  const active = humans.value.filter(asset => {
    const meta = metadata(asset)
    return meta.trainingTaskId && !['completed', 'failed'].includes(meta.status)
  })
  if (active.length === 0) return
  try {
    const results = await Promise.all(active.map(async asset => ({
      asset,
      result: await getDigitalHumanTask(metadata(asset).trainingTaskId)
    })))
    results.forEach(({ asset, result }) => {
      if (result.asset) emit('upsert', result.asset)
      notifyTrainingStatus(asset, result)
    })
  } catch (error) {
    console.warn('[DigitalHumanPanel] 刷新训练状态失败:', error.message)
  }
}

async function openConsent(asset) {
  errorMessage.value = ''
  consentUrl.value = ''
  try {
    const result = await createDigitalHumanConsent(asset.id)
    consentUrl.value = result.consent_url || ''
    if (consentUrl.value) window.open(consentUrl.value, '_blank', 'noopener,noreferrer')
    emit('refresh')
  } catch (error) {
    errorMessage.value = error.message || translateUi('uiMessages.mb154339e1931')
  }
}

onMounted(async () => {
  await loadChannels()
  await refreshTrainingStates()
  pollTimer = window.setInterval(refreshTrainingStates, 5000)
})

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <section class="digital-human-panel">
    <div class="digital-human-training">
      <div class="digital-human-training-heading">
        <div class="digital-human-training-icon">✦</div>
        <div>
          <h3>{{ translateUi('uiMessages.m63d6e50896a6') }}</h3>
          <p>{{ translateUi('uiMessages.me2411793457a') }}</p>
        </div>
      </div>
      <label class="digital-human-field">
        <span>{{ translateUi('uiMessages.mfc812ade9c09') }}</span>
        <input v-model="name" maxlength="255" :placeholder="translateUi('uiMessages.m5e082949a8ca')" />
      </label>
      <label class="digital-human-field">
        {{ translateUi('uiMessages.m962a9940669b') }}
        <select v-model="selectedChannelId" :disabled="channels.length === 0">
          <option v-if="channels.length === 0" value="">{{ translateUi('uiMessages.m1f4623ca8426') }}</option>
          <option v-for="channel in channels" :key="channel.id" :value="channel.id">{{ channel.name }}</option>
        </select>
      </label>
      <input ref="fileInputRef" class="digital-human-file-input" type="file" accept="image/*,video/*" @change="handleFileChange" />
      <button
        type="button"
        class="digital-human-dropzone"
        :class="{ 'is-dragging': isDraggingFile, 'has-file': sourceFile }"
        @click="openFilePicker"
        @dragenter.prevent="isDraggingFile = true"
        @dragover.prevent
        @dragleave.prevent="isDraggingFile = false"
        @drop.prevent="handleDrop"
      >
        <template v-if="sourceFile">
          <span class="digital-human-file-icon">{{ sourceFile.type.startsWith('video/') ? '▷' : '▧' }}</span>
          <span class="digital-human-file-details">
            <strong>{{ sourceFile.name }}</strong>
            <small>{{ sourceFile.type.startsWith('video/') ? translateUi('uiMessages.m9007e7c00e41') : translateUi('uiMessages.m7a7ed8f41a01') }}</small>
          </span>
          <span class="digital-human-file-change">{{ translateUi('uiMessages.m916afcd85322') }}</span>
        </template>
        <template v-else>
          <span class="digital-human-upload-icon">↑</span>
          <span><strong>{{ translateUi('uiMessages.m772dd4de24e3') }}</strong><small>{{ translateUi('uiMessages.md594c3367dd0') }}</small></span>
        </template>
      </button>
      <div class="digital-human-training-footer">
        <p v-if="sourceFile && trainingPointsCost > 0">{{ translateUi('uiMessages.m93eaf8878a61', { value1: (trainingPointsCost) }) }}</p>
        <p v-else>{{ translateUi('uiMessages.m0e76f5a6222b') }}</p>
        <button type="button" :disabled="training || !sourceFile || !name.trim() || !selectedChannelId" @click="submitTraining">
          {{ training ? translateUi('uiMessages.m81fd5024f74f') : translateUi('uiMessages.mb6b73f94d4c7') }}
        </button>
      </div>
      <p v-if="errorMessage" class="digital-human-error">{{ errorMessage }}</p>
      <a v-if="consentUrl" :href="consentUrl" target="_blank" rel="noopener noreferrer">{{ translateUi('uiMessages.m5cdf0fa278f2') }}</a>
    </div>

    <div class="digital-human-list">
      <div v-if="humans.length === 0" class="digital-human-empty">{{ translateUi('uiMessages.m0e591b7e70a4') }}</div>
      <article v-for="asset in humans" :key="asset.id" class="digital-human-card">
        <img v-if="metadata(asset).previewUrl || asset.thumbnail_url || asset.url" :src="metadata(asset).previewUrl || asset.thumbnail_url || asset.url" :alt="asset.name" />
        <div class="digital-human-card-content">
          <strong>{{ asset.name }}</strong>
          <span>{{ metadata(asset).kind === 'digital_twin' ? translateUi('uiMessages.m1635553f7a1a') : translateUi('uiMessages.m46165474cec0') }}</span>
          <span :class="['digital-human-status', `status-${metadata(asset).status || 'processing'}`]">{{ trainingStatusLabel(metadata(asset).status) }}</span>
          <small>{{ metadata(asset).channelId }}</small>
          <p v-if="metadata(asset).error" class="digital-human-error">{{ metadata(asset).error }}</p>
          <div class="digital-human-actions">
            <button v-if="metadata(asset).status === 'completed' && digitalHumanPreviewUrl(asset)" type="button" @click="emit('insert-image', asset)">{{ translateUi('uiMessages.mf78ef6d84d59') }}</button>
            <button v-if="metadata(asset).status === 'pending_consent'" type="button" @click="openConsent(asset)">{{ translateUi('uiMessages.mf92f8a7fc7a2') }}</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.digital-human-panel { display: grid; gap: 16px; padding: 8px 2px; color: var(--canvas-text, #e5e7eb); }
.digital-human-training { display: grid; gap: 12px; padding: 16px; border: 1px solid rgba(139, 92, 246, .35); border-radius: 12px; background: linear-gradient(135deg, rgba(76, 29, 149, .18), rgba(15, 23, 42, .54)); }
.digital-human-training-heading { display: flex; align-items: center; gap: 10px; }
.digital-human-training-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 8px; background: rgba(139, 92, 246, .2); color: #c4b5fd; }
.digital-human-training h3 { margin: 0; font-size: 14px; letter-spacing: .01em; }
.digital-human-training p { margin: 3px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.45; }
.digital-human-field { display: grid; gap: 6px; font-size: 12px; color: #cbd5e1; }
.digital-human-field > span { color: #dbe4f0; }
.digital-human-training input, .digital-human-training select { width: 100%; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, .32); border-radius: 7px; background: rgba(15, 23, 42, .72); color: inherit; padding: 9px 10px; outline: none; }
.digital-human-training input:focus, .digital-human-training select:focus { border-color: rgba(167, 139, 250, .9); box-shadow: 0 0 0 3px rgba(139, 92, 246, .14); }
.digital-human-file-input { display: none; }
.digital-human-dropzone { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 76px; width: 100%; box-sizing: border-box; padding: 12px; border: 1px dashed rgba(148, 163, 184, .48); border-radius: 9px; background: rgba(15, 23, 42, .34); color: #cbd5e1; cursor: pointer; text-align: left; transition: border-color .16s ease, background .16s ease; }
.digital-human-dropzone:hover, .digital-human-dropzone.is-dragging { border-color: #a78bfa; background: rgba(109, 40, 217, .14); }
.digital-human-dropzone > span:not(.digital-human-upload-icon):not(.digital-human-file-icon):not(.digital-human-file-change) { display: grid; gap: 3px; }
.digital-human-dropzone strong { font-size: 12px; font-weight: 600; color: #e2e8f0; }
.digital-human-dropzone small { color: #94a3b8; font-size: 11px; }
.digital-human-upload-icon, .digital-human-file-icon { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 7px; background: rgba(148, 163, 184, .14); color: #c4b5fd; font-size: 16px; }
.digital-human-file-details { min-width: 0; flex: 1; display: grid; gap: 3px; }
.digital-human-file-details strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.digital-human-file-change { color: #c4b5fd; font-size: 12px; }
.digital-human-training-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.digital-human-training-footer p { margin: 0; }
.digital-human-training-footer button, .digital-human-actions button { border: 0; border-radius: 7px; padding: 9px 13px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; }
.digital-human-training-footer button:disabled { opacity: .5; cursor: not-allowed; }
.digital-human-list { display: grid; gap: 9px; }
.digital-human-empty { color: #94a3b8; text-align: center; font-size: 12px; padding: 30px 12px; border: 1px dashed rgba(148, 163, 184, .2); border-radius: 10px; }
.digital-human-card { display: flex; gap: 10px; min-height: 82px; padding: 9px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 9px; background: rgba(15, 23, 42, .22); }
.digital-human-card img { width: 64px; height: 70px; flex: 0 0 64px; object-fit: cover; border-radius: 6px; background: #1e293b; }
.digital-human-card-content { min-width: 0; display: grid; align-content: start; gap: 3px; font-size: 12px; }
.digital-human-card-content span, .digital-human-card-content small { color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.digital-human-status.status-completed { color: #34d399; }.digital-human-status.status-failed { color: #f87171; }.digital-human-status.status-pending_consent { color: #fbbf24; }
.digital-human-actions { display: flex; gap: 6px; margin-top: 4px; }.digital-human-actions button { padding: 5px 8px; }
.digital-human-error { margin: 0; color: #f87171 !important; }.digital-human-training a { color: #c4b5fd; font-size: 12px; }
</style>
