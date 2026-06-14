<script setup>
import { Camera, Check, Download, Trash2 } from '@lucide/vue'

defineProps({
  snapshotUrl: { type: String, default: null },
  snapshotHistory: { type: Array, default: () => [] },
  selectedSnapshotUrl: { type: String, default: null },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits([
  'capture-screenshot',
  'add-to-canvas',
  'select-snapshot',
  'select-current',
  'delete-snapshot',
  'download-snapshot'
])
</script>

<template>
  <section class="director-snapshot-panel">
    <div class="director-panel-heading">
      <div>
        <span>Snapshots</span>
        <strong>{{ snapshotHistory.length }}</strong>
      </div>
      <div class="director-snapshot-actions">
        <button
          type="button"
          class="director-mini-button"
          title="Capture screenshot"
          :disabled="busy"
          @click="emit('capture-screenshot')"
        >
          <Camera :size="14" stroke-width="2" />
        </button>
        <button
          type="button"
          class="director-mini-button"
          title="Add selected snapshot to canvas"
          :disabled="busy || !selectedSnapshotUrl"
          @click="emit('add-to-canvas')"
        >
          <Download :size="14" stroke-width="2" />
        </button>
        <button
          type="button"
          class="director-mini-button"
          title="Download active snapshot"
          :disabled="busy || !snapshotUrl"
          @click="emit('download-snapshot', snapshotUrl)"
        >
          <Download :size="14" stroke-width="2" />
        </button>
        <button
          type="button"
          class="director-mini-button"
          title="Delete selected snapshot"
          :disabled="busy || !selectedSnapshotUrl"
          @click="emit('delete-snapshot')"
        >
          <Trash2 :size="14" stroke-width="2" />
        </button>
      </div>
    </div>

    <div v-if="snapshotUrl" class="director-active-snapshot">
      <button
        type="button"
        title="Select current snapshot"
        :class="{ active: snapshotUrl === selectedSnapshotUrl }"
        @click="emit('select-current')"
      >
        <img :src="snapshotUrl" alt="">
        <span><Check :size="13" stroke-width="2" /></span>
      </button>
    </div>

    <div class="director-snapshot-strip">
      <button
        v-for="url in snapshotHistory"
        :key="url"
        type="button"
        class="director-snapshot-thumb"
        :class="{ active: url === selectedSnapshotUrl }"
        @click="emit('select-snapshot', url)"
      >
        <img :src="url" alt="">
      </button>
      <div v-if="snapshotHistory.length === 0" class="director-empty-row">No snapshots</div>
    </div>
  </section>
</template>

<style scoped>
.director-snapshot-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.director-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.director-panel-heading div:first-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.director-panel-heading span {
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  text-transform: uppercase;
}

.director-panel-heading strong {
  color: #f4f4f5;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.director-snapshot-actions {
  display: inline-flex;
  gap: 5px;
}

.director-mini-button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #24272d;
  color: #d4d4d8;
  cursor: pointer;
}

.director-mini-button:hover:not(:disabled) {
  background: #30343b;
  color: #f8fafc;
}

.director-mini-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.director-active-snapshot button {
  position: relative;
  display: block;
  width: 100%;
  height: 92px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #080a0d;
  overflow: hidden;
  cursor: pointer;
}

.director-active-snapshot button.active {
  border-color: rgba(34, 211, 238, 0.58);
}

.director-active-snapshot span {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.92);
  color: #ecfeff;
}

.director-active-snapshot img,
.director-snapshot-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.director-snapshot-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.director-snapshot-thumb {
  aspect-ratio: 16 / 9;
  min-width: 0;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: #080a0d;
  overflow: hidden;
  cursor: pointer;
}

.director-snapshot-thumb.active {
  border-color: rgba(34, 211, 238, 0.58);
}

.director-empty-row {
  grid-column: 1 / -1;
  padding: 8px;
  color: #8b949e;
  font-size: 11px;
}
</style>
