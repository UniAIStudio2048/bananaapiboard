<template>
  <teleport to="body">
    <div class="video-tool-modal" role="dialog" aria-modal="true">
      <VideoSourceRail :canvas-videos="canvasVideos" @add-source="addSourceToTimeline" />

      <main class="video-tool-modal__workspace">
        <!-- 标题栏 -->
        <header class="video-tool-modal__titlebar">
          <span class="video-tool-modal__title">视频工具</span>
          <div class="video-tool-modal__title-actions">
            <div v-if="activeMode === 'edit'" class="video-tool-modal__export">
              <button type="button" :disabled="submitting || !selectedClip || !draftReady" @click="showExportMenu = !showExportMenu">{{ submitting ? '处理中...' : '导出 ▾' }}</button>
              <div v-if="showExportMenu" class="video-tool-modal__export-menu">
                <span>导出选中片段</span>
                <button type="button" @click="exportSelected('local')">导出到本地</button>
                <button type="button" @click="exportSelected('canvas')">导出到画布</button>
              </div>
            </div>
          <button type="button" class="video-tool-modal__close" title="关闭" :disabled="submitting" @click="requestClose">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          </div>
        </header>

        <!-- 模式切换标签栏（视频上方） -->
        <nav class="video-tool-modal__mode-tabs">
          <button
            type="button"
            class="video-tool-modal__mode-tab"
            :class="{ 'video-tool-modal__mode-tab--active': activeMode === 'edit' }"
            @click="activeMode = 'edit'; showEraseDropdown = false"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
            </svg>
            <span>剪辑</span>
          </button>
          <div class="video-tool-modal__mode-tab-wrapper">
            <button
              type="button"
              class="video-tool-modal__mode-tab"
              :class="{ 'video-tool-modal__mode-tab--active': activeMode === 'subtitle' }"
              @click="handleSubtitleTabClick"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M7 15h4M13 15h4" />
              </svg>
              <span>字幕擦除</span>
              <span class="video-tool-modal__erase-label">· {{ activeEraseOption.label }}</span>
              <svg class="video-tool-modal__dropdown-arrow" :class="{ 'video-tool-modal__dropdown-arrow--open': showEraseDropdown }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div v-if="showEraseDropdown" class="video-tool-modal__erase-dropdown">
              <div class="video-tool-modal__erase-group-label">字幕擦除</div>
              <button
                v-for="option in subtitleEraseOptions"
                :key="option.value"
                type="button"
                :class="{ active: eraseMode === option.value }"
                @click="eraseMode = option.value; showEraseDropdown = false"
              >{{ option.label }}</button>
              <div class="video-tool-modal__erase-group-label">高级水印/字幕擦除</div>
              <button
                v-for="option in watermarkEraseOptions"
                :key="option.value"
                type="button"
                :class="{ active: eraseMode === option.value }"
                @click="eraseMode = option.value; showEraseDropdown = false"
              >{{ option.label }}</button>
            </div>
          </div>
        </nav>

        <!-- 视频预览区 -->
        <div class="video-tool-modal__stage">
        <VideoPreview
          ref="previewRef"
          class="video-tool-modal__preview"
          :clip="selectedClip"
          :show-controls="activeMode !== 'edit'"
          :mode="activeMode === 'subtitle' && isSelectionEraseMode ? 'fine' : 'standard'"
          @update:detect-rect="detectRect = $event"
          @timeupdate="handlePreviewTimeUpdate"
          @play="isPreviewPlaying = true"
          @pause="isPreviewPlaying = false"
          @ended="handleClipEnded"
          @preview-error="statusText = $event"
          @metadata="confirmSourceMetadata"
        />
        <aside v-if="activeMode === 'edit'" class="video-tool-modal__properties">
          <h3>视频</h3>
          <template v-if="selectedClip">
            <h4>变速</h4>
            <label>变速倍数 <input aria-label="变速倍数" type="number" min="0.25" max="4" step="0.01" :value="Number(selectedClip.playbackRate ?? 1).toFixed(2)" :disabled="!draftReady || submitting" @change="updateClipProperty('playbackRate', $event)" /><span>x</span></label>
            <div class="video-tool-modal__duration">时长 <output>{{ getClipDuration(selectedClip).toFixed(2) }}s</output></div>
            <h4>音量</h4>
            <label>音量增益 <input aria-label="音量增益" type="number" min="-60" max="12" step="0.1" :value="Number(selectedClip.volumeDb ?? 0).toFixed(1)" :disabled="!draftReady || submitting" @change="updateClipProperty('volumeDb', $event)" /><span>dB</span></label>
          </template>
          <p v-else>请选择时间线上的片段</p>
        </aside>
        </div>

        <!-- 工具栏 -->
        <div class="video-tool-modal__toolbar">
          <div class="video-tool-modal__toolbar-left">
            <template v-if="activeMode === 'edit'">
              <button v-for="action in splitActions" :key="action.value" type="button" :title="splitReason(action.value) || action.label" :disabled="!!splitReason(action.value) || submitting || !draftReady" @click="splitSelected(action.value)">{{ action.label }}</button>
            </template>
          </div>

          <!-- 中间：播放控制 -->
          <div class="video-tool-modal__toolbar-center">
            <span class="video-tool-modal__time">{{ formatTimeDisplay(currentPlayTime) }}</span>
            <button type="button" class="video-tool-modal__play-btn" @click="togglePreviewPlay" :title="isPreviewPlaying ? '暂停' : '播放'">
              <svg v-if="!isPreviewPlaying" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
            <span class="video-tool-modal__time video-tool-modal__time--total">{{ formatTimeDisplay(totalSeconds) }}</span>
            <button
              v-if="activeMode === 'subtitle'"
              type="button"
              class="video-tool-modal__submit-btn"
              :disabled="submitting || normalizedClips.length === 0"
              @click="submit"
            >
              {{ submitting ? '处理中...' : '开始擦除' }}
            </button>
          </div>

          <!-- 右侧：缩放 -->
          <div class="video-tool-modal__toolbar-right">
            <div class="video-tool-modal__zoom-group">
              <button type="button" title="缩小" @click="zoomLevel = Math.max(0.1, zoomLevel - 0.25)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35M8 11h6" />
                </svg>
              </button>
              <input
                type="range"
                class="video-tool-modal__zoom-slider"
                min="0.1"
                max="5"
                step="0.1"
                v-model.number="zoomLevel"
              />
              <button type="button" title="放大" @click="zoomLevel = Math.min(5, zoomLevel + 0.25)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 状态信息条 -->
        <div v-if="estimate || statusText !== '添加视频后开始处理'" class="video-tool-modal__status-bar">
          <span>{{ statusText }}</span>
          <span v-if="activeMode === 'edit'" role="status">{{ saveStatusLabel }}</span>
          <button v-if="saveState === 'error'" type="button" @click="retrySave">{{ saveError?.code === 'VERSION_CONFLICT' ? '重新加载' : '重试保存' }}</button>
          <button v-if="localExportResult" type="button" :disabled="submitting" @click="retryDownload">重新下载上次成片</button>
          <template v-if="closeBlocked">
            <span>修改尚未保存，是否放弃未保存修改并关闭？</span>
            <button type="button" @click="$emit('close')">放弃并关闭</button>
            <button type="button" @click="closeBlocked = false">继续编辑</button>
          </template>
          <strong v-if="estimate">
            预计 {{ estimate.pointsCost }} 积分
            <template v-if="estimate.channel"> · {{ estimate.channel === 'volcengine' ? '火山' : '无痕' }}</template>
            <template v-if="estimate.billingUnit === 'second'">
              · {{ estimate.billedSeconds }} 秒（{{ estimate.pointsPerSecond }} 积分/秒）
            </template>
            <template v-else>
              · {{ estimate.billedMinutes }} 分钟
            </template>
          </strong>
        </div>

        <!-- 时间轴 -->
        <VideoTimeline
          :clips="clips"
          :selected-index="selectedIndex"
          :total-seconds="totalSeconds"
          :current-time="currentPlayTime"
          :zoom="zoomLevel"
          @update:clips="replaceClips"
          @select="selectClip"
          @seek="handleSeek"
          @add-source="addSourceToTimeline"
          @update:zoom="zoomLevel = Math.min(5, Math.max(0.1, $event))"
        />
      </main>
    </div>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import VideoSourceRail from './video-tool/VideoSourceRail.vue'
import VideoTimeline from './video-tool/VideoTimeline.vue'
import VideoPreview from './video-tool/VideoPreview.vue'
import { estimateSubtitleEraseBilling } from '@/utils/videoToolBilling'
import { getTimelineTotalSeconds, normalizeTimelineClips, getClipDuration, timelineTimeToSource, sourceTimeToTimeline, splitTimelineClip, getSplitDisabledReason, selectedExportClips, buildVideoEditDraft, restoreVideoEditDraft } from '@/utils/videoToolTimeline'
import { createVideoEditDraftWriter } from '@/utils/videoEditDraftWriter'
import { buildVideoDownloadUrl, downloadWithAuth } from '@/api/client'
import {
  estimateSubtitleErase,
  exportVideoTimeline,
  getSubtitleEraseConfig
} from '@/api/canvas/video-tools'

const props = defineProps({
  loadDraft: { type: Function, default: null },
  saveDraft: { type: Function, default: null },
  exportClipToCanvas: { type: Function, default: null },
  initialMode: {
    type: String,
    default: 'subtitle'
  },
  canvasVideos: {
    type: Array,
    default: () => []
  },
  initialSource: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['completed', 'close', 'cancel', 'export-started'])

const activeMode = ref(props.initialMode === 'edit' ? 'edit' : 'subtitle')
const eraseMode = ref('subtitle_all_area')
const showEraseDropdown = ref(false)
const clips = ref([])
const selectedIndex = ref(0)
const detectRect = ref(null)
const estimate = ref(null)
const subtitleConfig = ref(null)
const submitting = ref(false)
const statusText = ref('添加视频后开始处理')
const zoomLevel = ref(1)
const currentPlayTime = ref(0)
const isPreviewPlaying = ref(false)
const previewRef = ref(null)
const showExportMenu = ref(false)
const draftReady = ref(false)
const saveState = ref('loading')
const saveError = ref(null)
const closeBlocked = ref(false)
const localExportResult = ref(null)
const splitActions = [
  { value: 'split', label: '分割' },
  { value: 'left', label: '向左分割' },
  { value: 'right', label: '向右分割' }
]
const saveStatusLabel = computed(() => ({ loading: '加载草稿中', saving: '保存中', saved: '已保存', error: `保存失败：${saveError.value?.message || '请重试'}` })[saveState.value])
let draftWriter = makeDraftWriter()

function makeDraftWriter() {
  return createVideoEditDraftWriter(async draft => {
    if (!props.saveDraft) throw new Error('草稿保存接口不可用')
    await props.saveDraft(draft)
  }, (state, error) => { saveState.value = state; saveError.value = error || null })
}

function splitReason(action) {
  return getSplitDisabledReason(clips.value, selectedClip.value?.id, currentPlayTime.value, action)
}

function confirmSourceMetadata({ clipId, duration }) {
  if (!(duration > 0) || !Number.isFinite(duration)) return
  clips.value = clips.value.map(clip => {
    if (clip.id !== clipId || clip.sourceDuration > 0) return clip
    return { ...clip, sourceDuration: duration, endTime: duration, duration: (duration - clip.startTime) / (clip.playbackRate || 1) }
  })
}

function splitSelected(action) {
  if (submitting.value || !draftReady.value) return
  try {
    previewRef.value?.pause?.()
    const result = splitTimelineClip(clips.value, selectedClip.value?.id, currentPlayTime.value, action)
    clips.value = result.clips
    selectedIndex.value = result.clips.findIndex(clip => clip.id === result.selectedClipId)
    selectClip(selectedIndex.value)
  } catch (error) { statusText.value = error.message }
}

function replaceClips(nextClips) {
  if (submitting.value || !draftReady.value) return
  const selectedId = selectedClip.value?.id
  previewRef.value?.pause?.()
  clips.value = nextClips
  const retainedIndex = nextClips.findIndex(clip => clip.id === selectedId)
  selectedIndex.value = retainedIndex >= 0 ? retainedIndex : Math.min(selectedIndex.value, nextClips.length - 1)
  selectClip(selectedIndex.value)
}

function selectClip(index) {
  selectedIndex.value = index
  const clip = clips.value[index]
  currentPlayTime.value = clip ? sourceTimeToTimeline(clips.value, index, clip.startTime) : 0
  nextTick(() => previewRef.value?.seekTo?.(clip?.startTime || 0))
}

function updateClipProperty(property, event) {
  const clip = selectedClip.value
  if (!clip || submitting.value || !draftReady.value) return
  try {
    if (!event.target.validity.valid) throw new Error('invalid property')
    const localTime = timelineTimeToSource(clips.value, currentPlayTime.value).localTime
    const [updated] = normalizeTimelineClips([{ ...clip, [property]: event.target.value }])
    clips.value = clips.value.map(entry => entry.id === clip.id ? updated : entry)
    currentPlayTime.value = sourceTimeToTimeline(clips.value, selectedIndex.value, localTime)
    statusText.value = '片段属性已更新'
  } catch {
    event.target.value = clip[property] ?? (property === 'playbackRate' ? 1 : 0)
    statusText.value = property === 'playbackRate' ? '变速倍数须为 0.25–4.00' : '音量增益须为 -60–12 dB'
  }
}

async function initializeDraft() {
  draftReady.value = false
  saveState.value = 'loading'
  try {
    const stored = props.loadDraft ? await props.loadDraft() : null
    const restored = restoreVideoEditDraft(stored, props.initialSource?.url)
    draftWriter = makeDraftWriter()
    clips.value = restored?.clips || []
    selectedIndex.value = restored ? clips.value.findIndex(clip => clip.id === restored.selectedClipId) : -1
    await nextTick()
    draftReady.value = true
    saveState.value = 'saved'
    if (!restored && props.initialSource) await addSourceToTimeline(props.initialSource)
    if (stored && !restored) statusText.value = '源视频已变化或草稿无效，已重新初始化'
    selectClip(selectedIndex.value)
  } catch (error) {
    saveState.value = 'error'
    saveError.value = error
    statusText.value = '无法加载剪辑草稿，请重试'
  }
}

async function retrySave() {
  try {
    if (!draftReady.value || saveError.value?.code === 'VERSION_CONFLICT') {
      if (draftReady.value && !window.confirm('远端片段已更新。重新加载会放弃本次未保存修改，是否继续？')) return
      await initializeDraft()
    } else await draftWriter.retry()
    closeBlocked.value = false
  } catch (error) { statusText.value = error.message }
}

async function requestClose() {
  if (submitting.value) return
  try {
    await nextTick()
    await draftWriter.flush()
    emit('close')
  } catch { closeBlocked.value = true }
}

async function retryDownload() {
  if (!localExportResult.value || submitting.value) return
  submitting.value = true
  try {
    const { url, filename } = localExportResult.value
    await downloadWithAuth(buildVideoDownloadUrl(url, filename), filename)
    statusText.value = '下载已开始'
  } catch (error) { statusText.value = `下载失败：${error.message}，可重新下载成片` }
  finally { submitting.value = false }
}

async function exportSelected(destination) {
  if (submitting.value || !draftReady.value) return
  showExportMenu.value = false
  submitting.value = true
  statusText.value = '正在导出选中片段'
  try {
    const snapshot = selectedExportClips(clips.value, selectedClip.value?.id)
    if (!(snapshot[0].sourceDuration > 0)) throw new Error('请等待素材时长确认后再导出')
    await nextTick()
    await draftWriter.flush()
    if (destination === 'canvas') {
      if (!props.exportClipToCanvas) throw new Error('画布导出接口不可用')
      await props.exportClipToCanvas({ clips: snapshot, mode: 'edit' })
      statusText.value = '选中片段已导出到画布'
    } else {
      const result = await exportVideoTimeline({ clips: snapshot })
      const url = result?.url || result?.video_url || result?.videoUrl || result?.resultUrl
      if (!url) throw new Error('导出未返回视频地址')
      const filename = `视频剪辑-${Date.now()}.mp4`
      localExportResult.value = { url, filename }
      await downloadWithAuth(buildVideoDownloadUrl(url, filename), filename)
      statusText.value = '下载已开始'
    }
  } catch (error) { statusText.value = error.message || '导出失败' }
  finally { submitting.value = false }
}

function guardUnsavedDraft(event) {
  if (saveState.value === 'saving' || saveState.value === 'error' || submitting.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

const subtitleEraseOptions = [
  { value: 'subtitle_all_area', label: '全域智能擦除' },
  { value: 'subtitle_sel_area', label: '选区擦除' }
]
const watermarkEraseOptions = [
  { value: 'watermark_all_area', label: '全域水印/字幕擦除' },
  { value: 'watermark_sel_area', label: '选区水印/字幕擦除' }
]
const eraseOptions = [...subtitleEraseOptions, ...watermarkEraseOptions]

const activeEraseOption = computed(() => eraseOptions.find(option => option.value === eraseMode.value) || eraseOptions[0])
const isSelectionEraseMode = computed(() => eraseMode.value.endsWith('_sel_area'))

function handleSubtitleTabClick() {
  if (activeMode.value === 'subtitle') {
    showEraseDropdown.value = !showEraseDropdown.value
  } else {
    activeMode.value = 'subtitle'
    showEraseDropdown.value = false
  }
}

const normalizedClips = computed(() => {
  try {
    return normalizeTimelineClips(clips.value)
  } catch {
    return []
  }
})

const totalSeconds = computed(() => getTimelineTotalSeconds(normalizedClips.value))
const selectedClip = computed(() => clips.value[selectedIndex.value] || null)

function globalTimeToClipInfo(globalTime) {
  return timelineTimeToSource(clips.value, globalTime)
}

function clipLocalTimeToGlobal(clipIndex, localTime) {
  return sourceTimeToTimeline(clips.value, clipIndex, localTime)
}

function formatTimeDisplay(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function togglePreviewPlay() {
  const videoEl = previewRef.value?.$el?.querySelector('video')
  if (!videoEl) return
  if (videoEl.paused) {
    videoEl.play()
  } else {
    videoEl.pause()
  }
}

let seekGuardUntil = 0

function handleSeek(time) {
  const { clipIndex, localTime } = globalTimeToClipInfo(time)
  if (clipIndex !== selectedIndex.value) {
    selectedIndex.value = clipIndex
    nextTick(() => {
      previewRef.value?.seekTo?.(localTime)
    })
  } else {
    previewRef.value?.seekTo?.(localTime)
  }
  currentPlayTime.value = time
  seekGuardUntil = Date.now() + 150
}

function handlePreviewTimeUpdate(localTime) {
  if (Date.now() < seekGuardUntil) return
  currentPlayTime.value = clipLocalTimeToGlobal(selectedIndex.value, localTime)
}

function handleClipEnded() {
  const nextIdx = selectedIndex.value + 1
  if (nextIdx < clips.value.length) {
    selectedIndex.value = nextIdx
    nextTick(() => {
      const clip = clips.value[nextIdx]
      previewRef.value?.seekTo?.(clip.startTime || 0)
      const videoEl = previewRef.value?.$el?.querySelector('video')
      if (videoEl) videoEl.play()
    })
  } else {
    isPreviewPlaying.value = false
  }
}

function sourceToClip(source, probedDuration) {
  const duration = Math.max(0.1, probedDuration || Number(source.duration) || 10)
  return {
    id: globalThis.crypto.randomUUID(),
    name: source.name || '视频片段',
    url: source.url,
    startTime: 0,
    endTime: duration,
    duration,
    sourceDuration: probedDuration || null,
    playbackRate: 1,
    volumeDb: 0
  }
}

async function addSourceToTimeline(source) {
  if (!source?.url || submitting.value || !draftReady.value) return
  const clip = sourceToClip(source)
  clips.value = [...clips.value, clip]
  selectedIndex.value = clips.value.length - 1

  let probedDuration = 0
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    probedDuration = await new Promise((resolve) => {
      const cleanup = () => { video.removeAttribute('src'); video.load() }
      video.onloadedmetadata = () => {
        const dur = video.duration
        cleanup()
        resolve(Number.isFinite(dur) && dur > 0 ? dur : 0)
      }
      video.onerror = () => { cleanup(); resolve(0) }
      video.src = source.url
      setTimeout(() => { cleanup(); resolve(0) }, 8000)
    })
  } catch { /* use fallback */ }

  if (probedDuration > 0) {
    clips.value = clips.value.map(existing => {
      if (existing.id !== clip.id) return existing
      const nextDuration = Math.max(0.1, probedDuration)
      const startTime = Math.min(existing.startTime || 0, nextDuration)
      const defaultRangeUnchanged = (existing.startTime || 0) === 0 && (existing.endTime || 0) === clip.endTime
      return {
        ...existing,
        startTime,
        endTime: defaultRangeUnchanged ? nextDuration : Math.min(existing.endTime || nextDuration, nextDuration),
        sourceDuration: nextDuration,
        duration: (Math.min(existing.endTime || nextDuration, nextDuration) - startTime) / (existing.playbackRate || 1)
      }
    })
  }
}

function computeLocalEstimate() {
  if (activeMode.value !== 'subtitle' || normalizedClips.value.length === 0 || !subtitleConfig.value) {
    return null
  }
  return estimateSubtitleEraseBilling({
    totalSeconds: totalSeconds.value,
    config: subtitleConfig.value,
    mode: eraseMode.value
  })
}

async function ensureSubtitleConfigLoaded() {
  if (subtitleConfig.value) return subtitleConfig.value
  try {
    subtitleConfig.value = await getSubtitleEraseConfig()
  } catch {
    subtitleConfig.value = null
  }
  return subtitleConfig.value
}

async function refreshEstimate() {
  if (activeMode.value !== 'subtitle' || normalizedClips.value.length === 0) {
    estimate.value = null
    statusText.value = normalizedClips.value.length === 0 ? '添加视频后开始处理' : '剪辑导出'
    return
  }

  await ensureSubtitleConfigLoaded()
  const localEstimate = computeLocalEstimate()

  try {
    estimate.value = await estimateSubtitleErase({
      clips: normalizedClips.value,
      mode: eraseMode.value,
      detectRect: isSelectionEraseMode.value ? detectRect.value : undefined
    })
    statusText.value = activeEraseOption.value.label
    return
  } catch (error) {
    if (localEstimate?.pointsCost > 0) {
      estimate.value = localEstimate
      statusText.value = '本地预估'
      return
    }
    estimate.value = localEstimate || {
      totalSeconds: totalSeconds.value,
      billedMinutes: Math.max(1, Math.ceil(totalSeconds.value / 60)),
      billingUnit: 'minute',
      pointsPerSecond: 0,
      pointsCost: 0
    }
    statusText.value = error?.message || '无法预估积分，请检查字幕擦除配置'
  }
}

async function submit() {
  if (activeMode.value === 'edit') return exportSelected('canvas')
  if (normalizedClips.value.length === 0) return
  if (activeMode.value === 'subtitle' && isSelectionEraseMode.value && !detectRect.value) {
    statusText.value = '请先在视频上框选需要擦除的区域'
    return
  }
  submitting.value = true
  statusText.value = '提交中'
  try {
    const clipsSnapshot = JSON.parse(JSON.stringify(normalizedClips.value))
    const detectRectSnapshot = isSelectionEraseMode.value
      ? JSON.parse(JSON.stringify(detectRect.value))
      : undefined
    emit('export-started', {
      mode: 'subtitle',
      eraseMode: eraseMode.value,
      clips: clipsSnapshot,
      detectRect: detectRectSnapshot
    })
  } catch (error) {
    statusText.value = error.message || '处理失败'
  } finally {
    submitting.value = false
  }
}

watch([activeMode, eraseMode, normalizedClips, detectRect], refreshEstimate, { deep: true })

function handleKeydown(e) {
  if (e.code === 'Space' && !e.target.closest('input, textarea, select, [contenteditable]')) {
    e.preventDefault()
    e.stopPropagation()
    togglePreviewPlay()
  }
  if (e.code === 'Escape') {
    e.stopPropagation()
    showEraseDropdown.value = false
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
    e.stopPropagation()
    if (clips.value.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < clips.value.length) {
      const newClips = clips.value.filter((_, i) => i !== selectedIndex.value)
      replaceClips(newClips)
    }
  }
}

function handleGlobalClick(e) {
  if (!e.target.closest('.video-tool-modal__export')) showExportMenu.value = false
  if (showEraseDropdown.value && !e.target.closest('.video-tool-modal__mode-tab-wrapper')) {
    showEraseDropdown.value = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('click', handleGlobalClick, true)
  window.addEventListener('beforeunload', guardUnsavedDraft)
  await initializeDraft()
  refreshEstimate()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', guardUnsavedDraft)
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('click', handleGlobalClick, true)
})

watch([clips, selectedIndex], () => {
  if (draftReady.value) draftWriter.save(buildVideoEditDraft(props.initialSource?.url, clips.value, selectedClip.value?.id || null))
}, { deep: true })
</script>

<style scoped>
.video-tool-modal__stage { display: flex; min-height: 0; min-width: 0; overflow: hidden; }
.video-tool-modal__stage > .video-tool-modal__preview { flex: 1; }
.video-tool-modal__properties { width: 270px; flex-shrink: 0; margin: 12px 12px 12px 0; padding: 16px; border: 1px solid #303034; border-radius: 10px; background: #202023; overflow-y: auto; }
.video-tool-modal__properties h3 { margin: 0; padding-bottom: 12px; border-bottom: 1px solid #3c3c40; }
.video-tool-modal__properties h4 { margin: 20px 0 12px; }
.video-tool-modal__properties label, .video-tool-modal__duration { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding: 10px; border-radius: 8px; background: #303034; color: #d4d4d8; font-size: 13px; }
.video-tool-modal__properties input { width: 76px; margin-left: auto; padding: 0; border: 0; box-shadow: none; background: transparent; text-align: right; color: #fff; }
.video-tool-modal__duration output { margin-left: auto; color: #fff; }
.video-tool-modal__title-actions { display: flex; align-items: center; gap: 12px; }
.video-tool-modal__export { position: relative; }
.video-tool-modal__export > button { padding: 6px 14px; border-radius: 8px; background: #fafafa; color: #18181b; }
.video-tool-modal__export-menu { position: absolute; right: 0; top: 36px; z-index: 20; width: 180px; padding: 8px; background: #27272a; border: 1px solid #3f3f46; border-radius: 10px; box-shadow: 0 6px 18px #0006; }
.video-tool-modal__export-menu span { display: block; padding: 6px; color: #a1a1aa; font-size: 12px; }
.video-tool-modal__export-menu button { display: block; width: 100%; text-align: left; padding: 10px; border-radius: 6px; }
.video-tool-modal__export-menu button:hover { background: #3f3f46; }
.video-tool-modal__toolbar-left button, .video-tool-modal__status-bar button { font-size: 12px; padding: 5px 8px; border: 1px solid #3f3f46; border-radius: 5px; color: #e4e4e7; }
.video-tool-modal button:disabled { opacity: 0.45; cursor: not-allowed; }
.video-tool-modal button:focus-visible, .video-tool-modal input:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
@media (max-width: 900px) { .video-tool-modal__properties { width: 220px; padding: 10px; } }
@media (max-width: 600px) { .video-tool-modal__properties { width: 170px; } .video-tool-modal__properties label { flex-wrap: wrap; } }
.video-tool-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: #0a0a0c;
  color: #f5f5f5;
}

.video-tool-modal__workspace {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: 40px auto minmax(0, 1fr) auto auto minmax(140px, 28vh);
  background: #0a0a0c;
}

/* 标题栏 */
.video-tool-modal__titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #111114;
  border-bottom: 1px solid #1e1e22;
}

.video-tool-modal__title {
  font-size: 13px;
  font-weight: 500;
  color: #d4d4d8;
}

.video-tool-modal__close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #71717a;
  cursor: pointer;
  transition: all 0.15s ease;
}

.video-tool-modal__close:hover {
  background: #27272a;
  color: #f5f5f5;
}

/* 模式切换标签栏 */
.video-tool-modal__mode-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 16px;
  background: #111114;
  border-bottom: 1px solid #1e1e22;
}

.video-tool-modal__mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: #71717a;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.video-tool-modal__mode-tab:hover {
  color: #d4d4d8;
}

.video-tool-modal__mode-tab--active {
  color: #f5f5f5;
  border-bottom-color: #0d9488;
}

.video-tool-modal__mode-tab--active svg:first-child {
  color: #0d9488;
}

/* 字幕擦除标签包裹器 */
.video-tool-modal__mode-tab-wrapper {
  position: relative;
}

.video-tool-modal__erase-label {
  font-size: 11px;
  color: #a1a1aa;
  margin-left: 2px;
}

.video-tool-modal__dropdown-arrow {
  transition: transform 0.2s ease;
  color: #71717a;
}

.video-tool-modal__dropdown-arrow--open {
  transform: rotate(180deg);
}

.video-tool-modal__erase-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  min-width: 120px;
  padding: 4px;
  background: #1e1e22;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.video-tool-modal__erase-dropdown button {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #d4d4d8;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;
}

.video-tool-modal__erase-dropdown button:hover {
  background: #27272a;
}

.video-tool-modal__erase-dropdown button.active {
  color: #0d9488;
  background: rgba(13, 148, 136, 0.1);
}

/* 视频预览 */
.video-tool-modal__preview {
  min-height: 0;
  min-width: 0;
  padding: 12px;
  overflow: hidden;
  background: #0a0a0c;
}

/* 工具栏 */
.video-tool-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #141418;
  border-top: 1px solid #1e1e22;
  border-bottom: 1px solid #1e1e22;
  gap: 12px;
}

.video-tool-modal__toolbar-left,
.video-tool-modal__toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.video-tool-modal__toolbar-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 时间显示 */
.video-tool-modal__time {
  font-size: 12px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  color: #d4d4d8;
  min-width: 42px;
  text-align: center;
}

.video-tool-modal__time--total {
  color: #71717a;
}

/* 播放按钮 */
.video-tool-modal__play-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #3f3f46;
  border-radius: 50%;
  background: #1e1e22;
  color: #f5f5f5;
  cursor: pointer;
  transition: all 0.15s ease;
}

.video-tool-modal__play-btn:hover {
  background: #27272a;
  border-color: #52525b;
}

/* 缩放控制 */
.video-tool-modal__zoom-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.video-tool-modal__zoom-group button {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #71717a;
  cursor: pointer;
  transition: color 0.15s ease;
}

.video-tool-modal__zoom-group button:hover {
  color: #d4d4d8;
}

.video-tool-modal__zoom-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #3f3f46;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.video-tool-modal__zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #d4d4d8;
  cursor: pointer;
}

.video-tool-modal__zoom-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #d4d4d8;
  border: none;
  cursor: pointer;
}

/* 提交按钮（合成视频 / 开始擦除） */
.video-tool-modal__submit-btn {
  height: 28px;
  padding: 0 14px;
  margin-left: 4px;
  border: 1px solid #0d9488;
  border-radius: 6px;
  background: #0d9488;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.video-tool-modal__submit-btn:hover:not(:disabled) {
  background: #14b8a6;
  border-color: #14b8a6;
}

.video-tool-modal__submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 状态信息条 */
.video-tool-modal__status-bar {
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 4px 12px;
  background: #111114;
  font-size: 11px;
  color: #71717a;
}

.video-tool-modal__status-bar strong {
  color: #a1a1aa;
  font-weight: 500;
}

/* 响应式 */
@media (max-width: 760px) {
  .video-tool-modal {
    flex-direction: column;
  }

  .video-tool-modal__toolbar {
    flex-wrap: wrap;
    height: auto;
    padding: 8px 12px;
    gap: 8px;
  }

  .video-tool-modal__zoom-slider {
    width: 60px;
  }
}
</style>
