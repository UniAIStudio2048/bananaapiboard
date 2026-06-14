<script setup>
import { FolderPlus, Image, Pencil, RotateCcw, Save, Trash2 } from '@lucide/vue'

defineProps({
  projects: { type: Array, default: () => [] },
  activeProjectId: { type: String, default: null },
  title: { type: String, default: 'Director Studio' }
})

const emit = defineEmits([
  'save-project',
  'select-project',
  'save-new-project',
  'save-active-project',
  'rename-project',
  'restore-project',
  'delete-project',
  'update-project-cover'
])

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
      <div class="director-project-actions">
        <button type="button" class="director-mini-button" title="Save active project" @click="emit('save-active-project')">
          <Save :size="14" stroke-width="2" />
        </button>
        <button type="button" class="director-mini-button" title="Save as new project" @click="emit('save-new-project')">
          <FolderPlus :size="14" stroke-width="2" />
        </button>
      </div>
    </div>

    <div class="director-project-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="director-project-row"
        :class="{ active: project.id === activeProjectId }"
      >
        <button type="button" class="director-project-main" @click="emit('select-project', project.id)">
          <img v-if="project.coverUrl" :src="project.coverUrl" alt="">
          <span>{{ project.name || project.id }}</span>
          <small>{{ formatTime(project.updatedAt) }}</small>
        </button>
        <div class="director-project-row-actions">
          <button type="button" title="Restore project" @click="emit('restore-project', project.id)">
            <RotateCcw :size="13" stroke-width="2" />
          </button>
          <button type="button" title="Rename project" @click="emit('rename-project', project.id)">
            <Pencil :size="13" stroke-width="2" />
          </button>
          <button type="button" title="Use current snapshot as cover" @click="emit('update-project-cover', project.id)">
            <Image :size="13" stroke-width="2" />
          </button>
          <button type="button" title="Delete project" @click="emit('delete-project', project.id)">
            <Trash2 :size="13" stroke-width="2" />
          </button>
        </div>
      </div>
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

.director-project-actions {
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
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  width: 100%;
  gap: 6px;
  min-height: 44px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #111418;
  color: #e5e7eb;
}

.director-project-row:hover {
  border-color: rgba(34, 211, 238, 0.26);
  background: #171b20;
}

.director-project-row.active {
  border-color: rgba(34, 211, 238, 0.42);
  background: rgba(8, 145, 178, 0.18);
}

.director-project-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 2px 7px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.director-project-main img {
  grid-row: 1 / span 2;
  width: 36px;
  height: 28px;
  border-radius: 5px;
  object-fit: cover;
}

.director-project-main span {
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-project-main small,
.director-empty-row {
  color: #8b949e;
  font-size: 11px;
  line-height: 1.2;
}

.director-project-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.director-project-row-actions button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  background: #1d2127;
  color: #cbd5e1;
  cursor: pointer;
}

.director-project-row-actions button:hover {
  background: #30343b;
  color: #f8fafc;
}

.director-empty-row {
  padding: 8px;
}

@media (max-width: 520px) {
  .director-project-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .director-project-row-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
