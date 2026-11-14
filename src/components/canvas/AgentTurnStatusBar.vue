<template>
  <div
    v-if="visible"
    class="agent-turn-status-bar"
    role="status"
    aria-live="polite"
    :class="`agent-turn-status-bar--${statusClass}`"
  >
    <span class="agent-turn-status-bar__phase">{{ phaseLabel }}</span>
    <span v-if="elapsedText" class="agent-turn-status-bar__elapsed">{{ elapsedText }}</span>
    <span v-if="cancelRequested" class="agent-turn-status-bar__cancelling">{{ translateUi('uiMessages.m8a99be840844') }}</span>
  </div>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  turn: { type: Object, default: null },
})
const now = ref(Date.now())
let elapsedTimer = null

onMounted(() => {
  elapsedTimer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (elapsedTimer) clearInterval(elapsedTimer)
})

const PHASE_LABELS = {
  get idle() { return translateUi('uiMessages.mdae661d17c2d') },
  get accepted() { return translateUi('uiMessages.mf0c489dc2296') },
  get preparing() { return translateUi('uiMessages.mb3d50dc76207') },
  get thinking() { return translateUi('uiMessages.m32b51d4d1a32') },
  get tool_calling() { return translateUi('uiMessages.mb3d50dc76207') },
  get waiting_media() { return translateUi('uiMessages.mdfaecbba9496') },
  get waiting_external_task() { return translateUi('uiMessages.mdfaecbba9496') },
  get stopping() { return translateUi('uiMessages.m67c27762329e') },
  get finalizing() { return translateUi('uiMessages.m0613db6c8b2c') },
  get reconnecting() { return translateUi('uiMessages.mc25eacdf7240') },
  get completed() { return translateUi('canvas.assetPanel.tagCompleted') },
  get failed() { return translateUi('uiMessages.m9344597efd49') },
  get cancelled() { return translateUi('uiMessages.mf006455e3baf') },
  get retrying() { return translateUi('uiMessages.ma3f9afd0aae3') },
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
  if (props.turn?.cancelRequested || props.turn?.status === 'stopping') return translateUi('uiMessages.m67c27762329e')
  const label = PHASE_LABELS[props.turn?.phase] || PHASE_LABELS[props.turn?.status] || translateUi('videoGen.processing')
  return props.turn?.tool ? `${label} · ${props.turn.tool}` : label
})

const elapsedText = computed(() => {
  const startedAt = props.turn?.startedAt || props.turn?.ts
  if (!startedAt) return ''
  const ms = now.value - startedAt
  if (ms < 0) return ''
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

const cancelRequested = computed(() => Boolean(props.turn?.cancelRequested))
</script>

<style scoped>
/* 对齐 AgentToolTimeline：无边框、无圆点、等宽黑白灰；运行中文字扫光 */
.agent-turn-status-bar {
  margin-top: 6px;
  padding-left: 2px;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--canvas-text-secondary);
}
.agent-turn-status-bar__phase {
  color: var(--canvas-text-primary);
  font-weight: 500;
}
.agent-turn-status-bar__elapsed,
.agent-turn-status-bar__cancelling {
  color: var(--canvas-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.agent-turn-status-bar--running .agent-turn-status-bar__phase,
.agent-turn-status-bar--waiting .agent-turn-status-bar__phase,
.agent-turn-status-bar--retrying .agent-turn-status-bar__phase,
.agent-turn-status-bar--cancelling .agent-turn-status-bar__phase {
  background: linear-gradient(100deg,
    var(--canvas-text-secondary) 40%,
    var(--canvas-text-primary) 50%,
    var(--canvas-text-secondary) 60%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: agent-status-text-shimmer 1.6s linear infinite;
}
@keyframes agent-status-text-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-turn-status-bar--running .agent-turn-status-bar__phase,
  .agent-turn-status-bar--waiting .agent-turn-status-bar__phase,
  .agent-turn-status-bar--retrying .agent-turn-status-bar__phase,
  .agent-turn-status-bar--cancelling .agent-turn-status-bar__phase {
    animation: none;
    color: var(--canvas-text-primary);
    background: none;
    -webkit-background-clip: initial;
    background-clip: initial;
  }
}
</style>
