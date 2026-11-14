<script setup>
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

import { computed, ref } from 'vue'

const props = defineProps({
  groupName: {
    type: String,
    get default() { return translateUi('canvas.nodeTypes.group') }
  },
  mode: {
    type: String,
    default: 'create'
  },
  submitting: {
    type: Boolean,
    default: false
  },
  schedules: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  cancellingId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'submit', 'cancel-schedule', 'refresh'])

const scheduledAtInput = ref('')
const batchCount = ref(1)
const error = ref('')

const normalizedBatchCount = computed(() => Math.min(100, Math.max(1, Number.parseInt(batchCount.value || 1, 10) || 1)))
const isRecordsMode = computed(() => props.mode === 'records')
const dialogTitle = computed(() => isRecordsMode.value ? translateUi('uiMessages.me32fd85dcee9') : translateUi('uiMessages.m978cb333292d'))

const statusLabel = {
  get scheduled() { return translateUi('uiMessages.m637da5612300') },
  get running() { return translateUi('uiMessages.m5026a63b58cd') },
  get completed() { return translateUi('canvas.assetPanel.tagCompleted') },
  get failed() { return translateUi('uiMessages.m28384d7afd2e') },
  get cancelled() { return translateUi('uiMessages.ma37778f17c5f') },
  get partial() { return translateUi('uiMessages.m1bd16b45b478') }
}

function normalizeBatchInput() {
  batchCount.value = normalizedBatchCount.value
}

function normalizeTimestamp(value) {
  const n = Number(value)
  if (Number.isFinite(n)) return n
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatScheduleTime(value) {
  const timestamp = normalizeTimestamp(value)
  if (!timestamp) return translateUi('uiMessages.m664939a1fa2e')
  return new Date(timestamp).toLocaleString(uiLanguage.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function canCancelSchedule(schedule) {
  return schedule?.status === 'scheduled'
}

function submitSchedule() {
  error.value = ''
  if (!scheduledAtInput.value) {
    error.value = translateUi('uiMessages.m434c7efecbad')
    return
  }

  const scheduledAt = new Date(scheduledAtInput.value).getTime()
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now() - 60000) {
    error.value = translateUi('uiMessages.mb37e1ebbb8fe')
    return
  }

  emit('submit', {
    scheduledAt,
    batchCount: normalizedBatchCount.value
  })
}
</script>

<template>
  <Teleport to="body">
    <div class="group-schedule-backdrop" @click.self="emit('close')">
      <div class="group-schedule-dialog" role="dialog" aria-modal="true">
        <div class="dialog-header">
          <div>
            <h3>{{ dialogTitle }}</h3>
            <p>{{ props.groupName }}</p>
          </div>
          <button class="icon-btn" type="button" :aria-label="translateUi('common.close')" @click="emit('close')">×</button>
        </div>

        <template v-if="isRecordsMode">
          <div class="records-toolbar">
            <span>{{ translateUi('uiMessages.mc542f21d8c90') }}</span>
            <button class="text-btn" type="button" :disabled="loading" @click="emit('refresh')">
              {{ loading ? translateUi('uiMessages.m3af7e5489e61') : translateUi('common.refresh') }}
            </button>
          </div>

          <div v-if="loading" class="empty-records">{{ translateUi('uiMessages.m85f144919920') }}</div>
          <div v-else-if="schedules.length === 0" class="empty-records">{{ translateUi('uiMessages.me393f849bfa1') }}</div>
          <div v-else class="schedule-record-list">
            <div v-for="schedule in schedules" :key="schedule.id" class="schedule-record">
              <div class="record-main">
                <span class="status-pill" :class="`status-${schedule.status || 'unknown'}`">
                  {{ statusLabel[schedule.status] || schedule.status || translateUi('uiMessages.m4d8c1c5b4283') }}
                </span>
                <strong>{{ formatScheduleTime(schedule.scheduled_at || schedule.scheduledAt) }}</strong>
              </div>
              <div class="record-meta">
                <span>{{ translateUi('uiMessages.m4a9466197e7f', { value1: (schedule.batch_count || schedule.batchCount || 1) }) }}</span>
                <span>{{ translateUi('uiMessages.m449019136aae', { value1: (formatScheduleTime(schedule.created_at || schedule.createdAt)) }) }}</span>
              </div>
              <p v-if="schedule.error" class="record-error">{{ schedule.error }}</p>
              <div v-if="canCancelSchedule(schedule)" class="record-actions">
                <button
                  class="danger-btn"
                  type="button"
                  :disabled="cancellingId === schedule.id"
                  @click="emit('cancel-schedule', schedule)"
                >
                  {{ cancellingId === schedule.id ? translateUi('uiMessages.m75dfaf262f47') : translateUi('uiMessages.m537d17f1c531') }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <label class="field">
            <span>{{ translateUi('uiMessages.m45e03e436ed0') }}</span>
            <input v-model="scheduledAtInput" type="datetime-local" :disabled="submitting" />
          </label>

          <label class="field">
            <span>{{ translateUi('uiMessages.m2f69582f9147') }}</span>
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
            <button class="secondary-btn" type="button" :disabled="submitting" @click="emit('close')">{{ translateUi('common.cancel') }}</button>
            <button class="primary-btn" type="button" :disabled="submitting" @click="submitSchedule">
              {{ submitting ? translateUi('uiMessages.mdcc1a22d9e72') : translateUi('uiMessages.m0ffd61afe283') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.group-schedule-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.58);
  color-scheme: dark;
}

.group-schedule-dialog {
  width: min(360px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
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
  color: var(--canvas-text-secondary, #a0a0a0);
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
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 6px;
  padding: 0 10px;
  background: var(--canvas-bg-secondary, #141414);
  color: inherit;
  color-scheme: dark;
}

.field input:focus {
  outline: none;
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.22);
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
.primary-btn,
.danger-btn,
.text-btn {
  min-width: 76px;
  height: 34px;
  border-radius: 6px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 13px;
}

.secondary-btn:disabled,
.primary-btn:disabled,
.danger-btn:disabled,
.text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.secondary-btn {
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  background: transparent;
  color: inherit;
}

.primary-btn {
  border: 1px solid var(--canvas-accent-primary, #3b82f6);
  background: var(--canvas-accent-primary, #3b82f6);
  color: #fff;
}

.records-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--canvas-text-secondary, #a0a0a0);
}

.text-btn {
  min-width: 52px;
  height: 28px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  background: transparent;
  color: inherit;
}

.empty-records {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 96px;
  border: 1px dashed var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
}

.schedule-record-list {
  display: grid;
  gap: 8px;
  max-height: min(420px, calc(100vh - 190px));
  overflow: auto;
  padding-right: 2px;
}

.schedule-record {
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  background: var(--canvas-bg-secondary, #141414);
}

.record-main,
.record-meta,
.record-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.record-main strong {
  font-size: 13px;
  font-weight: 650;
}

.record-meta {
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
}

.record-error {
  margin: 0;
  color: #f87171;
  font-size: 12px;
  line-height: 1.4;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 22px;
  border-radius: 6px;
  padding: 0 8px;
  background: rgba(100, 116, 139, 0.22);
  color: #cbd5e1;
  font-size: 12px;
}

.status-scheduled {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
}

.status-running {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.status-completed,
.status-partial {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}

.status-failed {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}

.status-cancelled {
  background: rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
}

.danger-btn {
  min-width: 72px;
  height: 30px;
  margin-left: auto;
  border: 1px solid rgba(239, 68, 68, 0.42);
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

.danger-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.24);
  color: #fff;
}

:root.canvas-theme-light .group-schedule-backdrop {
  background: rgba(28, 25, 23, 0.32);
  color-scheme: light;
}

:root.canvas-theme-light .group-schedule-dialog {
  box-shadow: 0 20px 50px rgba(28, 25, 23, 0.18);
}

:root.canvas-theme-light .field input {
  color-scheme: light;
}
</style>
