<template>
  <div
    v-if="visible"
    class="agent-turn-status-bar"
    role="status"
    aria-live="polite"
    :class="`agent-turn-status-bar--${statusClass}`"
  >
    <span class="agent-turn-status-bar__dot" aria-hidden="true"></span>
    <span class="agent-turn-status-bar__phase">{{ phaseLabel }}</span>
    <span v-if="elapsedText" class="agent-turn-status-bar__elapsed">{{ elapsedText }}</span>
    <button
      v-if="cancellable && !cancelRequested"
      type="button"
      class="agent-turn-status-bar__stop"
      aria-label="停止当前回合"
      @click="$emit('stop')"
    >
      停止
    </button>
    <span v-else-if="cancelRequested" class="agent-turn-status-bar__cancelling">正在停止…</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  turn: { type: Object, default: null },
})
defineEmits(['stop'])

const PHASE_LABELS = {
  idle: '空闲',
  accepted: '已接受',
  preparing: '正在准备任务',
  thinking: '正在理解需求',
  tool_calling: '正在准备任务',
  waiting_media: '生成任务正在后台执行',
  waiting_external_task: '生成任务正在后台执行',
  stopping: '正在停止 AI 回复',
  finalizing: '整理回复',
  reconnecting: '连接中断，正在恢复',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已停止',
  retrying: '重试中',
}

const statusClass = computed(() => {
  const status = props.turn?.status || 'idle'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed') return 'completed'
  if (props.turn?.cancelRequested || status === 'stopping') return 'cancelling'
  if (status === 'retrying') return 'retrying'
  if (['running', 'accepted', 'preparing', 'thinking', 'tool_calling', 'waiting_media', 'waiting_external_task', 'finalizing', 'reconnecting'].includes(status)) return 'running'
  return 'waiting'
})

const visible = computed(() => {
  if (!props.turn) return false
  return ['running', 'accepted', 'preparing', 'thinking', 'tool_calling', 'waiting_media', 'waiting_external_task', 'finalizing', 'retrying', 'stopping', 'reconnecting'].includes(props.turn.status) || props.turn.cancelRequested
})

const phaseLabel = computed(() => {
  if (props.turn?.cancelRequested || props.turn?.status === 'stopping') return '正在停止 AI 回复'
  const label = PHASE_LABELS[props.turn?.phase] || PHASE_LABELS[props.turn?.status] || '处理中'
  return props.turn?.tool ? `${label} · ${props.turn.tool}` : label
})

const elapsedText = computed(() => {
  const startedAt = props.turn?.startedAt || props.turn?.ts
  if (!startedAt) return ''
  const ms = Date.now() - startedAt
  if (ms < 0) return ''
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

const cancellable = computed(() => Boolean(props.turn?.cancellable && ['running', 'accepted', 'preparing', 'thinking', 'tool_calling', 'waiting_media', 'waiting_external_task', 'finalizing'].includes(props.turn?.status)))
const cancelRequested = computed(() => Boolean(props.turn?.cancelRequested))
</script>

<style scoped>
.agent-turn-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1;
  background: rgba(6, 182, 212, 0.08);
  color: #0e7490;
  border: 1px solid rgba(6, 182, 212, 0.25);
}
.agent-turn-status-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
  animation: agent-status-pulse 1.4s ease-in-out infinite;
}
.agent-turn-status-bar--waiting {
  background: rgba(129, 140, 248, 0.08);
  color: #6366f1;
  border-color: rgba(129, 140, 248, 0.25);
}
.agent-turn-status-bar--retrying {
  background: rgba(234, 179, 8, 0.08);
  color: #a16207;
  border-color: rgba(234, 179, 8, 0.3);
}
.agent-turn-status-bar--completed {
  background: rgba(34, 197, 94, 0.08);
  color: #15803d;
  border-color: rgba(34, 197, 94, 0.25);
}
.agent-turn-status-bar--completed .agent-turn-status-bar__dot {
  animation: none;
}
.agent-turn-status-bar--failed {
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.3);
}
.agent-turn-status-bar--failed .agent-turn-status-bar__dot {
  animation: none;
}
.agent-turn-status-bar--cancelled {
  background: rgba(107, 114, 128, 0.08);
  color: #6b7280;
  border-color: rgba(107, 114, 128, 0.25);
}
.agent-turn-status-bar--cancelled .agent-turn-status-bar__dot,
.agent-turn-status-bar--cancelling .agent-turn-status-bar__dot {
  animation: none;
}
.agent-turn-status-bar__elapsed {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
.agent-turn-status-bar__stop {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
  font-size: 12px;
  cursor: pointer;
}
.agent-turn-status-bar__stop:focus-visible {
  outline: 2px solid rgba(239, 68, 68, 0.6);
  outline-offset: 2px;
}
.agent-turn-status-bar__cancelling {
  margin-left: auto;
  opacity: 0.7;
}
@keyframes agent-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-turn-status-bar__dot {
    animation: none;
  }
}
</style>
