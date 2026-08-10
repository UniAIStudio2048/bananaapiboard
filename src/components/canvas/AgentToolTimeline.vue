<template>
  <div v-if="latestTools.length" class="agent-tool-timeline" role="status" aria-label="工具调用状态">
    <div
      v-for="tool in latestTools"
      :key="tool.id || tool.key"
      class="agent-tool-timeline__item"
      :class="`agent-tool-timeline__item--${tool.status || 'queued'}`"
    >
      <span class="agent-tool-timeline__name">{{ tool.display_name || tool.tool }}</span>
      <span class="agent-tool-timeline__status">{{ statusLabel(tool) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tools: { type: Array, default: () => [] },
})

// 任务提示只显示最新（最后一个）工具状态，不把整轮工具列表全部展示；
// 任务已完成/已取消后自动消失，避免残留状态行影响后续对话
const latestTools = computed(() => {
  const tools = Array.isArray(props.tools) ? props.tools : []
  const active = tools.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  return active.length ? [active[active.length - 1]] : []
})

const STATUS_LABELS = {
  queued: '排队中',
  running: '执行中',
  waiting: '等待结果',
  retrying: '重试中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

function statusLabel(tool) {
  return STATUS_LABELS[tool.status] || tool.status || '排队中'
}
</script>

<style scoped>
/* 极简任务状态：无边框、无圆点，黑白灰 + 等宽文字；
   执行中/等待结果时文字带流线扫过动画（类似 IDE 里 Codex 插件生成中的状态） */
.agent-tool-timeline {
  margin-top: 6px;
  padding-left: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
}
.agent-tool-timeline__item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  color: var(--canvas-text-secondary);
}
.agent-tool-timeline__name {
  color: var(--canvas-text-primary);
  font-weight: 500;
}
.agent-tool-timeline__status {
  color: var(--canvas-text-tertiary);
  font-size: 11px;
}
.agent-tool-timeline__item--running .agent-tool-timeline__name,
.agent-tool-timeline__item--waiting .agent-tool-timeline__name {
  background: linear-gradient(100deg,
    var(--canvas-text-secondary) 40%,
    var(--canvas-text-primary) 50%,
    var(--canvas-text-secondary) 60%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: agent-tool-text-shimmer 1.6s linear infinite;
}
.agent-tool-timeline__item--retrying .agent-tool-timeline__name {
  text-decoration: underline dotted;
}
@keyframes agent-tool-text-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-tool-timeline__item--running .agent-tool-timeline__name,
  .agent-tool-timeline__item--waiting .agent-tool-timeline__name {
    animation: none;
    color: var(--canvas-text-primary);
    background: none;
    -webkit-background-clip: initial;
    background-clip: initial;
  }
}
</style>
