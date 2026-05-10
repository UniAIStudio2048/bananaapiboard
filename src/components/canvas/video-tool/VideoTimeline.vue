<template>
  <section class="video-timeline">
    <div class="video-timeline__header">
      <span>单轨时间线</span>
      <strong>总时长 {{ totalDurationLabel }}</strong>
    </div>
    <div class="video-timeline__track">
      <article
        v-for="(clip, index) in clips"
        :key="clip.id || `${clip.url}-${index}`"
        class="video-timeline__clip"
        draggable="true"
        :class="{ active: index === selectedIndex }"
        @click="$emit('select', index)"
        @dragstart="handleDragStart(index)"
        @dragover.prevent
        @drop="handleDrop(index)"
      >
        <div class="video-timeline__clip-title">{{ clip.name || `片段 ${index + 1}` }}</div>
        <div class="video-timeline__fields">
          <label>
            <span>开始</span>
            <input type="number" min="0" step="0.1" :value="clip.startTime" @change="updateClip(index, 'startTime', $event.target.value)" />
          </label>
          <label>
            <span>结束</span>
            <input type="number" min="0.1" step="0.1" :value="clip.endTime" @change="updateClip(index, 'endTime', $event.target.value)" />
          </label>
        </div>
        <button type="button" class="video-timeline__remove" title="移除" @click.stop="removeClip(index)">×</button>
      </article>
      <div v-if="clips.length === 0" class="video-timeline__empty">从左侧添加视频</div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  clips: {
    type: Array,
    default: () => []
  },
  selectedIndex: {
    type: Number,
    default: 0
  },
  totalSeconds: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['update:clips', 'select'])
const draggingIndex = ref(-1)

const totalDurationLabel = computed(() => {
  const seconds = Math.max(0, Number(props.totalSeconds) || 0)
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round((seconds % 60) * 10) / 10
  return `${minutes}:${String(rest.toFixed(1)).padStart(4, '0')}`
})

function updateClip(index, field, value) {
  const next = props.clips.map((clip, clipIndex) => (
    clipIndex === index ? { ...clip, [field]: Number(value) || 0 } : clip
  ))
  emit('update:clips', next)
}

function removeClip(index) {
  emit('update:clips', props.clips.filter((_, clipIndex) => clipIndex !== index))
}

function handleDragStart(index) {
  draggingIndex.value = index
}

function handleDrop(index) {
  const from = draggingIndex.value
  draggingIndex.value = -1
  if (from < 0 || from === index) return
  const next = [...props.clips]
  const [clip] = next.splice(from, 1)
  next.splice(index, 0, clip)
  emit('update:clips', next)
}
</script>

<style scoped>
.video-timeline {
  border-top: 1px solid #27272a;
  background: #0a0a0a;
  padding: 14px 18px 16px;
}

.video-timeline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #d4d4d4;
  font-size: 13px;
  margin-bottom: 10px;
}

.video-timeline__track {
  min-height: 96px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  align-items: stretch;
}

.video-timeline__clip,
.video-timeline__empty {
  min-width: 212px;
  border: 1px solid #3f3f46;
  background: #111113;
  color: #f4f4f5;
  border-radius: 6px;
}

.video-timeline__clip {
  position: relative;
  padding: 12px;
  cursor: grab;
}

.video-timeline__clip.active {
  border-color: #fafafa;
}

.video-timeline__clip-title {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  margin-bottom: 10px;
}

.video-timeline__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.video-timeline__fields label {
  display: grid;
  gap: 4px;
  color: #a1a1aa;
  font-size: 12px;
}

.video-timeline__fields input {
  width: 100%;
  border: 1px solid #3f3f46;
  border-radius: 4px;
  background: #050505;
  color: #f5f5f5;
  padding: 6px;
}

.video-timeline__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border: 1px solid #3f3f46;
  border-radius: 50%;
  color: #f5f5f5;
  background: #18181b;
}

.video-timeline__empty {
  display: grid;
  place-items: center;
  color: #71717a;
  font-size: 13px;
}
</style>
