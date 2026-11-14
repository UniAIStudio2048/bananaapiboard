<template>
  <div v-if="items.length" class="agent-queue-bar" role="status" aria-live="polite">
    <ul class="agent-queue-bar__list">
      <li v-for="item in items" :key="item.turn_id || item.id" class="agent-queue-bar__item">
        <span class="agent-queue-bar__preview">{{ item.text || item.content }}</span>
        <button
          type="button"
          class="agent-queue-bar__action"
          :aria-label="translateUi('uiMessages.ma601de4d5de3')"
          @click="$emit('insert', item)"
        >
          {{ translateUi('uiMessages.m289c47c1dea3') }}
        </button>
        <button
          type="button"
          class="agent-queue-bar__action"
          :aria-label="translateUi('uiMessages.m1a7461dfd349')"
          @click="$emit('remove', item)"
        >
          {{ translateUi('uiMessages.m8d3ba65b9421') }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

defineProps({
  items: { type: Array, default: () => [] },
  activeTurnRunning: { type: Boolean, default: false },
})
defineEmits(['insert', 'remove'])
</script>

<style scoped>
.agent-queue-bar {
  margin: 4px 0 0;
  padding: 0 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
}
.agent-queue-bar__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.agent-queue-bar__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--canvas-text-secondary);
}
.agent-queue-bar__preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--canvas-text-tertiary);
}
.agent-queue-bar__action {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--canvas-text-tertiary);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.agent-queue-bar__action:hover,
.agent-queue-bar__action:focus-visible {
  color: var(--canvas-text-primary);
}
.agent-queue-bar__action:focus-visible {
  outline: 1px solid var(--canvas-text-tertiary);
  outline-offset: 2px;
}
</style>
