<template>
  <teleport to="body">
    <div class="video-tool-modal" role="dialog" aria-modal="true">
      <VideoSourceRail :canvas-videos="canvasVideos" @add-source="addSourceToTimeline" />

      <main class="video-tool-modal__workspace">
        <header class="video-tool-modal__header">
          <div class="video-tool-modal__top-actions" role="group" aria-label="视频工具">
            <button type="button" :class="{ active: activeMode === 'edit' }" title="剪辑" @click="activeMode = 'edit'">
              <span aria-hidden="true">✂</span>
              剪辑
            </button>
            <button type="button" :class="{ active: activeMode === 'subtitle' }" title="字幕擦除" @click="activeMode = 'subtitle'">
              <span aria-hidden="true">▭</span>
              字幕擦除
            </button>
          </div>
          <button type="button" class="video-tool-modal__close" title="关闭" @click="$emit('close')">×</button>
        </header>

        <div class="video-tool-modal__controls">
          <SubtitleEraseControls v-if="activeMode === 'subtitle'" v-model:mode="eraseMode" />
          <div v-if="activeMode === 'subtitle' && detectRect" class="video-tool-modal__rect">
            x {{ detectRect.x }} · y {{ detectRect.y }} · w {{ detectRect.width }} · h {{ detectRect.height }}
          </div>
        </div>

        <VideoPreview
          class="video-tool-modal__preview"
          :clip="selectedClip"
          :mode="activeMode === 'subtitle' ? eraseMode : 'standard'"
          @update:detect-rect="detectRect = $event"
        />

        <div class="video-tool-modal__submit-bar">
          <div class="video-tool-modal__estimate">
            <span>{{ statusText }}</span>
            <strong v-if="estimate">预计 {{ estimate.pointsCost }} 积分 · {{ estimate.billedMinutes }} 分钟</strong>
          </div>
          <button type="button" :disabled="submitting || normalizedClips.length === 0" @click="submit">
            {{ submitting ? '处理中' : '提交处理' }}
          </button>
          <button type="button" class="secondary" @click="$emit('cancel')">取消</button>
        </div>

        <VideoTimeline
          :clips="clips"
          :selected-index="selectedIndex"
          :total-seconds="totalSeconds"
          @update:clips="clips = $event"
          @select="selectedIndex = $event"
        />
      </main>
    </div>
  </teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import VideoSourceRail from './video-tool/VideoSourceRail.vue'
import VideoTimeline from './video-tool/VideoTimeline.vue'
import VideoPreview from './video-tool/VideoPreview.vue'
import SubtitleEraseControls from './video-tool/SubtitleEraseControls.vue'
import { estimateSubtitleEraseBilling } from '@/utils/videoToolBilling'
import { getTimelineTotalSeconds, normalizeTimelineClips } from '@/utils/videoToolTimeline'
import {
  createSubtitleEraseTask,
  estimateSubtitleErase,
  exportVideoTimeline,
  getSubtitleEraseConfig,
  getSubtitleEraseTask
} from '@/api/canvas/video-tools'

const props = defineProps({
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

const emit = defineEmits(['completed', 'close', 'cancel'])

const activeMode = ref(props.initialMode === 'edit' ? 'edit' : 'subtitle')
const eraseMode = ref('standard')
const clips = ref([])
const selectedIndex = ref(0)
const detectRect = ref(null)
const estimate = ref(null)
const subtitleConfig = ref(null)
const submitting = ref(false)
const statusText = ref('添加视频后开始处理')

const normalizedClips = computed(() => {
  try {
    return normalizeTimelineClips(clips.value)
  } catch {
    return []
  }
})

const totalSeconds = computed(() => getTimelineTotalSeconds(normalizedClips.value))
const selectedClip = computed(() => clips.value[selectedIndex.value] || clips.value[0] || null)

function sourceToClip(source) {
  const duration = Math.max(0.1, Number(source.duration) || 10)
  return {
    id: `${source.id || 'source'}-${Date.now()}`,
    name: source.name || '视频片段',
    url: source.url,
    startTime: 0,
    endTime: duration,
    duration
  }
}

function addSourceToTimeline(source) {
  if (!source?.url) return
  clips.value = [...clips.value, sourceToClip(source)]
  selectedIndex.value = clips.value.length - 1
}

function getResultUrl(payload) {
  return payload?.resultUrl || payload?.url || payload?.videoUrl || payload?.video_url || payload?.outputUrl || payload?.output?.url
}

function getTaskId(payload) {
  return payload?.taskId || payload?.task_id || payload?.id
}

function isTaskComplete(payload) {
  const status = String(payload?.status || '').toLowerCase()
  return ['completed', 'success', 'succeeded', 'done'].includes(status)
}

async function pollSubtitleTask(taskId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const task = await getSubtitleEraseTask(taskId)
    const resultUrl = getResultUrl(task)
    if (resultUrl || isTaskComplete(task)) return resultUrl
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error('字幕擦除任务超时')
}

async function refreshEstimate() {
  if (activeMode.value !== 'subtitle' || normalizedClips.value.length === 0) {
    estimate.value = null
    statusText.value = normalizedClips.value.length === 0 ? '添加视频后开始处理' : '剪辑导出'
    return
  }

  try {
    estimate.value = await estimateSubtitleErase({
      clips: normalizedClips.value,
      mode: eraseMode.value,
      detectRect: eraseMode.value === 'fine' ? detectRect.value : undefined
    })
    statusText.value = eraseMode.value === 'fine' ? '精细擦除' : '标准擦除'
  } catch {
    estimate.value = estimateSubtitleEraseBilling({
      totalSeconds: totalSeconds.value,
      config: subtitleConfig.value,
      mode: eraseMode.value
    })
    statusText.value = '本地预估'
  }
}

async function submit() {
  if (normalizedClips.value.length === 0) return
  submitting.value = true
  statusText.value = '提交中'
  try {
    if (activeMode.value === 'edit') {
      const result = await exportVideoTimeline({ clips: normalizedClips.value })
      const resultUrl = getResultUrl(result)
      if (!resultUrl) throw new Error('导出未返回视频地址')
      emit('completed', { url: resultUrl, resultUrl, mode: 'edit', result })
      return
    }

    const task = await createSubtitleEraseTask({
      clips: normalizedClips.value,
      mode: eraseMode.value,
      detectRect: eraseMode.value === 'fine' ? detectRect.value : undefined
    })
    const immediateUrl = getResultUrl(task)
    const resultUrl = immediateUrl || await pollSubtitleTask(getTaskId(task))
    if (!resultUrl) throw new Error('字幕擦除未返回视频地址')
    emit('completed', { url: resultUrl, resultUrl, mode: 'subtitle', eraseMode: eraseMode.value, result: task })
  } catch (error) {
    statusText.value = error.message || '处理失败'
  } finally {
    submitting.value = false
  }
}

watch([activeMode, eraseMode, normalizedClips, detectRect], refreshEstimate, { deep: true })

onMounted(async () => {
  if (props.initialSource) addSourceToTimeline(props.initialSource)
  try {
    subtitleConfig.value = await getSubtitleEraseConfig()
  } catch {
    subtitleConfig.value = null
  }
  refreshEstimate()
})
</script>

<style scoped>
.video-tool-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  background: #050505;
  color: #f5f5f5;
}

.video-tool-modal__workspace {
  min-width: 0;
  flex: 1;
  display: grid;
  grid-template-rows: 64px 44px minmax(260px, 1fr) auto 142px;
  background: #050505;
}

.video-tool-modal__header {
  position: relative;
  display: grid;
  place-items: center;
  border-bottom: 1px solid #27272a;
}

.video-tool-modal__top-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border: 1px solid #27272a;
  border-radius: 8px;
  background: #0f0f10;
}

.video-tool-modal__top-actions button,
.video-tool-modal__submit-bar button,
.video-tool-modal__close {
  border: 1px solid #3f3f46;
  border-radius: 6px;
  background: #18181b;
  color: #f5f5f5;
  cursor: pointer;
}

.video-tool-modal__top-actions button {
  height: 34px;
  min-width: 92px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
}

.video-tool-modal__top-actions button.active {
  background: #fafafa;
  color: #050505;
  border-color: #fafafa;
}

.video-tool-modal__close {
  position: absolute;
  top: 16px;
  right: 18px;
  width: 32px;
  height: 32px;
  font-size: 20px;
}

.video-tool-modal__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border-bottom: 1px solid #18181b;
}

.video-tool-modal__rect {
  color: #a1a1aa;
  font-size: 12px;
}

.video-tool-modal__preview {
  padding: 18px;
}

.video-tool-modal__submit-bar {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-top: 1px solid #18181b;
}

.video-tool-modal__estimate {
  min-width: 190px;
  display: grid;
  gap: 3px;
  color: #a1a1aa;
  font-size: 12px;
}

.video-tool-modal__estimate strong {
  color: #f5f5f5;
  font-size: 13px;
}

.video-tool-modal__submit-bar button {
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
}

.video-tool-modal__submit-bar button:not(.secondary) {
  background: #fafafa;
  color: #050505;
  border-color: #fafafa;
}

.video-tool-modal__submit-bar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .video-tool-modal {
    flex-direction: column;
  }

  .video-tool-modal__workspace {
    grid-template-rows: 58px 44px minmax(220px, 1fr) auto 154px;
  }
}
</style>
