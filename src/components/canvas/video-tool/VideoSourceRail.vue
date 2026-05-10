<template>
  <aside class="video-source-rail">
    <div class="video-source-rail__tabs">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'canvas'" class="video-source-rail__list">
      <button v-for="source in normalizedCanvasVideos" :key="source.id" type="button" class="video-source-rail__item" draggable="true" @dragstart="handleDragStart($event, source)" @click="$emit('add-source', source)">
        <span class="video-source-rail__thumb">
          <img v-if="source.thumbnailUrl" :src="displayMediaUrl(source.thumbnailUrl)" alt="" loading="lazy" />
          <video v-else :src="displayMediaUrl(source.url) + '#t=0.1'" muted playsinline preload="metadata" />
        </span>
        <span class="video-source-rail__name">{{ source.name }}</span>
      </button>
      <p v-if="normalizedCanvasVideos.length === 0" class="video-source-rail__empty">暂无画布视频</p>
    </div>

    <div v-else-if="activeTab === 'upload'" class="video-source-rail__upload">
      <input type="file" accept="video/*" @change="handleUpload" />
      <p>{{ uploadStatus }}</p>
    </div>

    <div v-else class="video-source-rail__list">
      <button type="button" class="video-source-rail__refresh" :disabled="historyLoading" @click="loadHistoryVideos">
        {{ historyLoading ? '加载中' : '刷新历史' }}
      </button>
      <button v-for="source in historyVideos" :key="source.id" type="button" class="video-source-rail__item" draggable="true" @dragstart="handleDragStart($event, source)" @click="$emit('add-source', source)">
        <span class="video-source-rail__thumb">
          <img v-if="source.thumbnailUrl" :src="displayMediaUrl(source.thumbnailUrl)" alt="" loading="lazy" />
          <video v-else :src="displayMediaUrl(source.url) + '#t=0.1'" muted playsinline preload="metadata" />
        </span>
        <span class="video-source-rail__name">{{ source.name }}</span>
      </button>
      <p v-if="!historyLoading && historyVideos.length === 0" class="video-source-rail__empty">暂无历史视频</p>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch, reactive } from 'vue'
import { getHistory } from '@/api/canvas/history'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import { getMediaUrl } from '@/config/tenant'

const props = defineProps({
  canvasVideos: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-source'])

const tabs = [
  { key: 'canvas', label: '画布' },
  { key: 'upload', label: '上传' },
  { key: 'history', label: '历史' }
]

const activeTab = ref('canvas')
const historyVideos = ref([])
const historyLoading = ref(false)
const uploadStatus = ref('选择本地视频上传')

const canvasVideosList = ref([])

watch(() => props.canvasVideos, async (videos) => {
  const sources = videos.map((item, index) => normalizeSource(item, `canvas-${index}`)).filter(Boolean)
  canvasVideosList.value = sources
  for (const s of sources) {
    if (s._needsProbe) {
      await probeAndUpdateDuration(s)
    }
  }
}, { immediate: true })

const normalizedCanvasVideos = computed(() => canvasVideosList.value)

function displayMediaUrl(url) {
  return getMediaUrl(url)
}

function handleDragStart(event, source) {
  event.dataTransfer.setData('application/video-source', JSON.stringify(source))
  event.dataTransfer.effectAllowed = 'copy'
}

function probeVideoDuration(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }
    video.onloadedmetadata = () => {
      const dur = video.duration
      cleanup()
      resolve(Number.isFinite(dur) && dur > 0 ? dur : 0)
    }
    video.onerror = () => {
      cleanup()
      resolve(0)
    }
    video.src = getMediaUrl(url)
    setTimeout(() => { cleanup(); resolve(0) }, 8000)
  })
}

function normalizeSource(item, fallbackId) {
  const url = item?.url || item?.output?.url || item?.data?.output?.url || item?.video_url
  if (!url) return null
  const metaDuration = Number(item.duration || item.output?.duration || item.data?.output?.duration) || 0
  return {
    id: item.id || fallbackId,
    name: item.name || item.title || item.prompt || `视频 ${fallbackId}`,
    url,
    thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || item.cover_url || item.output?.thumbnailUrl || item.output?.thumbnail_url || item.data?.output?.thumbnailUrl || item.data?.output?.thumbnail_url,
    duration: metaDuration || 10,
    _needsProbe: !metaDuration
  }
}

async function probeAndUpdateDuration(source) {
  if (!source?._needsProbe && source?.duration > 0) return
  const dur = await probeVideoDuration(source.url)
  if (dur > 0) source.duration = dur
}

async function handleUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  uploadStatus.value = '上传中'
  try {
    const result = await uploadCanvasMedia(file, 'video')
    const url = result.url
    const dur = await probeVideoDuration(url)
    const source = {
      id: `upload-${Date.now()}`,
      name: file.name,
      url,
      thumbnailUrl: result.thumbnailUrl || result.thumbnail_url || result.cover_url,
      duration: dur || 10
    }
    uploadStatus.value = '上传完成'
    event.target.value = ''
    emit('add-source', source)
  } catch (error) {
    uploadStatus.value = error.message || '上传失败'
  }
}

async function loadHistoryVideos() {
  historyLoading.value = true
  try {
    const result = await getHistory({ type: 'video', limit: 50 })
    const sources = (result.history || []).map((item, index) => normalizeSource(item, `history-${index}`)).filter(Boolean)
    historyVideos.value = sources
    for (const s of sources) {
      if (s._needsProbe) {
        await probeAndUpdateDuration(s)
      }
    }
  } finally {
    historyLoading.value = false
  }
}

watch(activeTab, tab => {
  if (tab === 'history' && historyVideos.value.length === 0) {
    loadHistoryVideos()
  }
})
</script>

<style scoped>
.video-source-rail {
  width: 176px;
  border-right: 1px solid #27272a;
  background: #0a0a0a;
  color: #f5f5f5;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.video-source-rail__tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid #27272a;
}

.video-source-rail__tabs button,
.video-source-rail__refresh,
.video-source-rail__item {
  border: 0;
  color: #d4d4d4;
  background: transparent;
  cursor: pointer;
}

.video-source-rail__tabs button {
  height: 42px;
  font-size: 13px;
}

.video-source-rail__tabs button.active {
  color: #fff;
  background: #18181b;
}

.video-source-rail__list {
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: grid;
  gap: 8px;
  align-content: start;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.video-source-rail__list::-webkit-scrollbar {
  display: none;
}

.video-source-rail__item,
.video-source-rail__refresh {
  width: 100%;
  text-align: left;
  border: 1px solid #2f2f33;
  border-radius: 6px;
  padding: 10px;
  background: #111113;
  font-size: 13px;
}

.video-source-rail__item {
  display: grid;
  gap: 8px;
  cursor: grab;
}

.video-source-rail__item:active {
  cursor: grabbing;
}

.video-source-rail__thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 4px;
  overflow: hidden;
  background: #050505;
}

.video-source-rail__thumb img,
.video-source-rail__thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-source-rail__name {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.video-source-rail__upload {
  padding: 12px;
  display: grid;
  gap: 12px;
  color: #a1a1aa;
  font-size: 13px;
}

.video-source-rail__upload input {
  width: 100%;
  color: #d4d4d4;
}

.video-source-rail__empty {
  color: #71717a;
  font-size: 13px;
  margin: 8px 0;
}
</style>
