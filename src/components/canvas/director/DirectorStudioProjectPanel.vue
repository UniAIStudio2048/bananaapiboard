<script setup>
import { Save } from '@lucide/vue'

defineProps({
  projects: { type: Array, default: () => [] },
  activeProjectId: { type: String, default: null },
  title: { type: String, default: 'Director Studio' }
})

const emit = defineEmits(['save-project', 'select-project'])

function formatTime(value) {
  const time = Number(value)
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleString()
}
</script>

<template>
  <section class="director-project-panel">
    <div class="director-panel-heading">
      <div>
        <span>Projects</span>
        <strong>{{ title }}</strong>
      </div>
      <button type="button" class="director-mini-button" title="Save project" @click="emit('save-project')">
        <Save :size="14" stroke-width="2" />
      </button>
    </div>

    <div class="director-project-list">
      <button
        v-for="project in projects"
        :key="project.id"
        type="button"
        class="director-project-row"
        :class="{ active: project.id === activeProjectId }"
        @click="emit('select-project', project.id)"
      >
        <span>{{ project.name || project.id }}</span>
        <small>{{ formatTime(project.updatedAt) }}</small>
      </button>
      <div v-if="projects.length === 0" class="director-empty-row">No saved projects</div>
    </div>
  </section>
</template>

<style scoped>
.director-project-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.director-panel-heading div {
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
  overflow: hidden;
  color: #f4f4f5;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.director-mini-button:hover {
  background: #30343b;
  color: #f8fafc;
}

.director-project-list {
  display: grid;
  gap: 5px;
}

.director-project-row {
  display: grid;
  width: 100%;
  gap: 2px;
  min-height: 44px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #111418;
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.director-project-row:hover {
  border-color: rgba(34, 211, 238, 0.26);
  background: #171b20;
}

.director-project-row.active {
  border-color: rgba(34, 211, 238, 0.42);
  background: rgba(8, 145, 178, 0.18);
}

.director-project-row span {
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-project-row small,
.director-empty-row {
  color: #8b949e;
  font-size: 11px;
  line-height: 1.2;
}

.director-empty-row {
  padding: 8px;
}
</style>
