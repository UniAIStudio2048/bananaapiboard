<script setup>
/**
 * 编辑租约只读提示条：工作流正在其他会话编辑时显示持有者，并提供抢占入口。
 */
import { computed } from 'vue'
import { Lock, LoaderCircle } from '@lucide/vue'

const props = defineProps({
  // canvasEditLease 的状态：{ mode, reason, holder }
  state: { type: Object, default: null },
  isTeam: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['takeover'])

const visible = computed(() => props.state?.mode === 'readonly')

const holderLabel = computed(() => {
  const holder = props.state?.holder
  if (!holder) return ''
  const device = holder.device || '另一台设备'
  return props.isTeam && holder.userName ? `${holder.userName} · ${device}` : device
})

const message = computed(() => {
  const reason = props.state?.reason
  if (reason === 'free') return '编辑者已离开，当前为只读'
  if (reason === 'taken') return `已在 ${holderLabel.value || '另一台设备'} 继续编辑，当前为只读`
  return `${holderLabel.value || '另一台设备'} 正在编辑，当前为只读`
})

const actionLabel = computed(() => {
  const reason = props.state?.reason
  if (reason === 'free') return '开始编辑'
  if (reason === 'taken') return '收回编辑权'
  return '在此设备编辑'
})
</script>

<template>
  <Transition name="canvas-edit-lease-banner">
    <div v-if="visible" class="canvas-edit-lease-banner" role="status" aria-live="polite">
      <Lock class="canvas-edit-lease-icon" :size="14" :stroke-width="1.75" aria-hidden="true" />
      <span class="canvas-edit-lease-text">{{ message }}</span>
      <button type="button" class="canvas-edit-lease-action" :disabled="busy" @click="emit('takeover')">
        <LoaderCircle v-if="busy" class="canvas-edit-lease-spin" :size="13" :stroke-width="1.75" aria-hidden="true" />
        {{ actionLabel }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.canvas-edit-lease-banner {
  position: fixed;
  top: 62px;
  left: 50%;
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(640px, calc(100vw - 32px));
  padding: 7px 8px 7px 12px;
  color: var(--canvas-text-primary);
  background: var(--canvas-bg-elevated);
  border: 1px solid var(--canvas-border-default);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  transform: translateX(-50%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  line-height: 1.4;
}

.canvas-edit-lease-icon {
  flex: 0 0 auto;
  color: var(--canvas-text-secondary);
}

.canvas-edit-lease-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-edit-lease-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  color: var(--canvas-text-primary);
  background: var(--canvas-bg-tertiary);
  border: 1px solid var(--canvas-border-default);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.canvas-edit-lease-action:hover:not(:disabled) {
  background: var(--canvas-bg-secondary);
  border-color: var(--canvas-border-active);
}

.canvas-edit-lease-action:focus-visible {
  outline: 2px solid var(--canvas-border-active);
  outline-offset: 2px;
}

.canvas-edit-lease-action:disabled {
  color: var(--canvas-text-tertiary);
  cursor: not-allowed;
}

.canvas-edit-lease-spin {
  animation: canvas-edit-lease-spin 0.9s linear infinite;
}

@keyframes canvas-edit-lease-spin {
  to { transform: rotate(360deg); }
}

.canvas-edit-lease-banner-enter-active,
.canvas-edit-lease-banner-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.canvas-edit-lease-banner-enter-from,
.canvas-edit-lease-banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}
</style>
