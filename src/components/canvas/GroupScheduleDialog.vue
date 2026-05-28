<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  groupName: {
    type: String,
    default: '编组'
  },
  submitting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'submit'])

const scheduledAtInput = ref('')
const batchCount = ref(1)
const error = ref('')

const normalizedBatchCount = computed(() => Math.min(100, Math.max(1, Number.parseInt(batchCount.value || 1, 10) || 1)))

function normalizeBatchInput() {
  batchCount.value = normalizedBatchCount.value
}

function submitSchedule() {
  error.value = ''
  if (!scheduledAtInput.value) {
    error.value = '请选择执行时间'
    return
  }

  const scheduledAt = new Date(scheduledAtInput.value).getTime()
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now() - 60000) {
    error.value = '执行时间不能早于当前时间'
    return
  }

  emit('submit', {
    scheduledAt,
    batchCount: normalizedBatchCount.value
  })
}
</script>

<template>
  <div class="group-schedule-backdrop" @click.self="emit('close')">
    <div class="group-schedule-dialog" role="dialog" aria-modal="true">
      <div class="dialog-header">
        <div>
          <h3>定时执行</h3>
          <p>{{ props.groupName }}</p>
        </div>
        <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </div>

      <label class="field">
        <span>执行时间</span>
        <input v-model="scheduledAtInput" type="datetime-local" :disabled="submitting" />
      </label>

      <label class="field">
        <span>批次数</span>
        <input
          v-model.number="batchCount"
          type="number"
          min="1"
          max="100"
          step="1"
          :disabled="submitting"
          @blur="normalizeBatchInput"
        />
      </label>

      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="dialog-actions">
        <button class="secondary-btn" type="button" :disabled="submitting" @click="emit('close')">取消</button>
        <button class="primary-btn" type="button" :disabled="submitting" @click="submitSchedule">
          {{ submitting ? '提交中' : '确认定时' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-schedule-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
}

.group-schedule-dialog {
  width: min(360px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  background: var(--canvas-panel-bg, #fff);
  color: var(--canvas-text-primary, #111827);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.dialog-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--canvas-text-muted, #64748b);
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.field {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  font-size: 13px;
}

.field input {
  height: 36px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 6px;
  padding: 0 10px;
  background: var(--canvas-input-bg, #fff);
  color: inherit;
}

.error-text {
  margin: 10px 0 0;
  color: #dc2626;
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.secondary-btn,
.primary-btn {
  min-width: 76px;
  height: 34px;
  border-radius: 6px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 13px;
}

.secondary-btn {
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: transparent;
  color: inherit;
}

.primary-btn {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}
</style>
