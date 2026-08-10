<template>
  <div v-if="items.length" class="agent-queue-bar" role="status" aria-live="polite">
    <div class="agent-queue-bar__header">
      <span>已排队 {{ items.length }} 条跟进消息</span>
      <span v-if="activeTurnRunning" class="agent-queue-bar__hint">当前回合结束后自动发送</span>
    </div>
    <ul class="agent-queue-bar__list">
      <li v-for="item in items" :key="item.turn_id || item.id" class="agent-queue-bar__item">
        <span class="agent-queue-bar__position">#{{ item.queue_position || item.position || '—' }}</span>
        <span class="agent-queue-bar__preview">{{ item.text || item.content }}</span>
        <button
          type="button"
          class="agent-queue-bar__action"
          aria-label="立即插入这条消息"
          @click="$emit('insert', item)"
        >
          立即插入
        </button>
        <button
          type="button"
          class="agent-queue-bar__action agent-queue-bar__action--danger"
          aria-label="删除这条排队消息"
          @click="$emit('remove', item)"
        >
          删除
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  activeTurnRunning: { type: Boolean, default: false },
})
defineEmits(['insert', 'remove'])
</script>

<style scoped>
.agent-queue-bar {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(129, 140, 248, 0.08);
  border: 1px solid rgba(129, 140, 248, 0.25);
  font-size: 12px;
}
.agent-queue-bar__header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #6366f1;
  margin-bottom: 6px;
}
.agent-queue-bar__hint {
  opacity: 0.7;
}
.agent-queue-bar__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.agent-queue-bar__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}
.agent-queue-bar__position {
  color: #6366f1;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.agent-queue-bar__preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}
.agent-queue-bar__action {
  flex: none;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  font-size: 11px;
  cursor: pointer;
}
.agent-queue-bar__action--danger {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
}
.agent-queue-bar__action:focus-visible {
  outline: 2px solid rgba(99, 102, 241, 0.6);
  outline-offset: 1px;
}
</style>
