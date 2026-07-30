<script setup>
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
    submitting: '正在提交',
    pending: '等待训练',
    processing: '训练中',
    pending_consent: '等待真人授权',
    completed: '训练完成',
    failed: '训练失败'
  }
  return labels[status] || '训练中'
}

function notifyTrainingStatus(asset, result) {
  const nextAsset = result?.asset || asset
  const nextStatus = metadata(nextAsset).status || result?.status || ''
  const previousStatus = metadata(asset).status || ''
  if (!nextStatus || nextStatus === previousStatus) return

  const assetName = nextAsset?.name || asset?.name || '数字人'
  if (nextStatus === 'completed') {
    showToast(`「${assetName}」训练完成，已保存到数字人资产`, 'success', 5000)
  } else if (nextStatus === 'failed') {
    showToast(`「${assetName}」训练失败：${result?.error || metadata(nextAsset).error || '请检查训练素材后重试'}`, 'error', 6000)
  } else if (nextStatus === 'pending_consent') {
    showToast(`「${assetName}」需要完成真人授权后才能继续训练`, 'warning', 5000)
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
    errorMessage.value = error.message || '加载 HeyGen 渠道失败'
  }
}

function handleFileChange(event) {
  const file = event.target.files?.[0] || null
  if (!file) return
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    errorMessage.value = '仅支持图片或视频素材'
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
    errorMessage.value = '仅支持图片或视频素材'
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
    const trainingLabel = kind === 'photo_avatar' ? '图片训练' : '视频训练'
    if (trainingPointsCost.value > 0) {
      const confirmed = await showConfirm(
        `本次${trainingLabel}将消耗 ${trainingPointsCost.value} 积分，确认后将立即提交训练。`,
        '确认提交训练',
        {
          detail: '训练提交后将立即扣除积分；若提交失败，积分会自动退回。',
          confirmText: '确认并提交'
        }
      )
      if (!confirmed) return
    }
    const upload = await uploadCanvasMedia(sourceFile.value, kind === 'photo_avatar' ? 'image' : 'video')
    if (upload.status !== 'completed' || !upload.url) throw new Error('训练素材上传失败')
    const result = await createDigitalHuman({
      name: name.value.trim(),
      kind,
      sourceUrl: upload.url,
      channelId: selectedChannelId.value
    })
    if (result.asset) emit('upsert', result.asset)
    if (result.status === 'failed') {
      const message = result.asset?.metadata?.error || 'HeyGen 未能开始训练'
      errorMessage.value = message
      showToast(`数字人训练失败：${message}`, 'error', 6000)
    } else if (result.status === 'completed') {
      showToast('数字人训练完成，结果已保存到资产库', 'success', 5000)
    } else if (result.status === 'pending_consent') {
      showToast('数字人已创建，请完成真人授权后继续训练', 'warning', 5000)
    } else {
      showToast('数字人训练已提交，可在下方查看实时状态', 'info', 4000)
    }
    name.value = ''
    sourceFile.value = null
  } catch (error) {
    const message = error.message || '创建数字人训练失败'
    errorMessage.value = message
    showToast(`数字人训练提交失败：${message}`, 'error', 6000)
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
    errorMessage.value = error.message || '获取授权链接失败'
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
          <h3>训练 HeyGen 数字人</h3>
          <p>图片训练 Photo Avatar，视频训练 Digital Twin。</p>
        </div>
      </div>
      <label class="digital-human-field">
        <span>数字人名称</span>
        <input v-model="name" maxlength="255" placeholder="例如：品牌主理人" />
      </label>
      <label class="digital-human-field">
        HeyGen 渠道
        <select v-model="selectedChannelId" :disabled="channels.length === 0">
          <option v-if="channels.length === 0" value="">暂无可用渠道</option>
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
            <small>{{ sourceFile.type.startsWith('video/') ? '视频 · Digital Twin' : '图片 · Photo Avatar' }}</small>
          </span>
          <span class="digital-human-file-change">更换</span>
        </template>
        <template v-else>
          <span class="digital-human-upload-icon">↑</span>
          <span><strong>拖拽图片或视频到这里</strong><small>也可点击选择文件</small></span>
        </template>
      </button>
      <div class="digital-human-training-footer">
        <p v-if="sourceFile && trainingPointsCost > 0">本次训练将消耗 {{ trainingPointsCost }} 积分</p>
        <p v-else>支持人物照片和人物视频</p>
        <button type="button" :disabled="training || !sourceFile || !name.trim() || !selectedChannelId" @click="submitTraining">
          {{ training ? '提交训练中…' : '开始训练' }}
        </button>
      </div>
      <p v-if="errorMessage" class="digital-human-error">{{ errorMessage }}</p>
      <a v-if="consentUrl" :href="consentUrl" target="_blank" rel="noopener noreferrer">重新打开真人授权链接</a>
    </div>

    <div class="digital-human-list">
      <div v-if="humans.length === 0" class="digital-human-empty">暂无数字人。训练完成后会保存在这里，并且只能用于其绑定的 HeyGen 渠道。</div>
      <article v-for="asset in humans" :key="asset.id" class="digital-human-card">
        <img v-if="metadata(asset).previewUrl || asset.thumbnail_url || asset.url" :src="metadata(asset).previewUrl || asset.thumbnail_url || asset.url" :alt="asset.name" />
        <div class="digital-human-card-content">
          <strong>{{ asset.name }}</strong>
          <span>{{ metadata(asset).kind === 'digital_twin' ? '视频训练 Digital Twin' : '图片训练 Photo Avatar' }}</span>
          <span :class="['digital-human-status', `status-${metadata(asset).status || 'processing'}`]">{{ trainingStatusLabel(metadata(asset).status) }}</span>
          <small>{{ metadata(asset).channelId }}</small>
          <p v-if="metadata(asset).error" class="digital-human-error">{{ metadata(asset).error }}</p>
          <div class="digital-human-actions">
            <button v-if="metadata(asset).status === 'completed' && digitalHumanPreviewUrl(asset)" type="button" @click="emit('insert-image', asset)">作为图像引用</button>
            <button v-if="metadata(asset).status === 'pending_consent'" type="button" @click="openConsent(asset)">完成真人授权</button>
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
