<script setup>
import {
  Box,
  Camera,
  Copy,
  Download,
  Grid3X3,
  Lamp,
  Maximize2,
  Move3D,
  RotateCcw,
  Save,
  Scale3D,
  Trash2,
  X
} from '@lucide/vue'

const props = defineProps({
  projectName: { type: String, default: 'Director Studio' },
  transformMode: { type: String, default: 'move' },
  camera: { type: Object, default: () => ({}) },
  lighting: { type: Object, default: () => ({}) },
  grid: { type: Object, default: () => ({}) },
  cameraPresets: { type: Array, default: () => [] },
  hasSelection: { type: Boolean, default: false },
  canPaste: { type: Boolean, default: false },
  hasSnapshot: { type: Boolean, default: false }
})

const emit = defineEmits([
  'close',
  'save-project',
  'capture-screenshot',
  'add-to-canvas',
  'update:transformMode',
  'camera-preset-change',
  'lighting-patch',
  'grid-patch',
  'focus-selected',
  'fit-scene',
  'reset-camera',
  'copy-selected',
  'paste-item',
  'delete-selected'
])

function selectTransform(mode) {
  emit('update:transformMode', mode)
}

function selectCameraPreset(event) {
  const preset = props.cameraPresets.find(item => item.id === event.target.value)
  if (!preset) return
  emit('camera-preset-change', {
    activePreset: preset.id,
    fov: preset.fov
  })
}
</script>

<template>
  <header class="director-toolbar">
    <div class="director-toolbar-project">
      <button type="button" class="director-icon-button" title="Close" @click="emit('close')">
        <X :size="17" stroke-width="2.1" />
      </button>
      <Box :size="18" stroke-width="2" class="director-toolbar-mark" />
      <div class="director-toolbar-title">
        <span>Director Studio</span>
        <strong>{{ projectName }}</strong>
      </div>
    </div>

    <div class="director-toolbar-group">
      <button type="button" class="director-command" title="Save project" @click="emit('save-project')">
        <Save :size="15" stroke-width="2" />
        <span>Save</span>
      </button>
      <button type="button" class="director-command" title="Capture screenshot" @click="emit('capture-screenshot')">
        <Camera :size="15" stroke-width="2" />
        <span>Capture</span>
      </button>
      <button
        type="button"
        class="director-command"
        title="Add snapshot to canvas"
        @click="emit('add-to-canvas')"
      >
        <Download :size="15" stroke-width="2" />
        <span>Canvas</span>
      </button>
    </div>

    <div class="director-toolbar-segment" aria-label="Transform mode">
      <button
        type="button"
        class="director-tool-button"
        :class="{ active: transformMode === 'move' }"
        title="Move"
        @click="selectTransform('move')"
      >
        <Move3D :size="16" stroke-width="2" />
      </button>
      <button
        type="button"
        class="director-tool-button"
        :class="{ active: transformMode === 'rotate' }"
        title="Rotate"
        @click="selectTransform('rotate')"
      >
        <RotateCcw :size="16" stroke-width="2" />
      </button>
      <button
        type="button"
        class="director-tool-button"
        :class="{ active: transformMode === 'scale' }"
        title="Scale"
        @click="selectTransform('scale')"
      >
        <Scale3D :size="16" stroke-width="2" />
      </button>
    </div>

    <div class="director-toolbar-group compact">
      <select
        class="director-toolbar-select"
        title="Camera preset"
        :value="camera.activePreset || 'standard'"
        @change="selectCameraPreset"
      >
        <option v-for="preset in cameraPresets" :key="preset.id" :value="preset.id">
          {{ preset.id }}
        </option>
      </select>
      <button type="button" class="director-icon-button" title="Focus selected" :disabled="!hasSelection" @click="emit('focus-selected')">
        <Maximize2 :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" title="Fit scene" @click="emit('fit-scene')">
        <Maximize2 :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" title="Reset camera" @click="emit('reset-camera')">
        <RotateCcw :size="16" stroke-width="2" />
      </button>
    </div>

    <div class="director-toolbar-group compact">
      <button
        type="button"
        class="director-icon-button"
        :class="{ active: lighting.enabled !== false }"
        title="Toggle lighting"
        @click="emit('lighting-patch', { enabled: lighting.enabled === false })"
      >
        <Lamp :size="16" stroke-width="2" />
      </button>
      <button
        type="button"
        class="director-icon-button"
        :class="{ active: grid.visible !== false }"
        title="Toggle grid"
        @click="emit('grid-patch', { visible: grid.visible === false })"
      >
        <Grid3X3 :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" title="Copy selected" :disabled="!hasSelection" @click="emit('copy-selected')">
        <Copy :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" title="Paste item" :disabled="!canPaste" @click="emit('paste-item')">
        <Download :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button danger" title="Delete selected" :disabled="!hasSelection" @click="emit('delete-selected')">
        <Trash2 :size="16" stroke-width="2" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.director-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto auto auto;
  gap: 8px;
  align-items: center;
  min-height: 46px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #17191c;
  color: #f4f4f5;
}

.director-toolbar-project,
.director-toolbar-group,
.director-toolbar-segment {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.director-toolbar-project {
  overflow: hidden;
}

.director-toolbar-mark {
  flex: none;
  color: #67e8f9;
}

.director-toolbar-title {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.director-toolbar-title span {
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  text-transform: uppercase;
}

.director-toolbar-title strong {
  overflow: hidden;
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-toolbar-group {
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.director-toolbar-group.compact {
  gap: 4px;
}

.director-toolbar-segment {
  height: 32px;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: #0f1114;
}

.director-icon-button,
.director-tool-button,
.director-command {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: #23262b;
  color: #d4d4d8;
  cursor: pointer;
}

.director-tool-button {
  border-color: transparent;
  background: transparent;
}

.director-icon-button:hover:not(:disabled),
.director-tool-button:hover:not(:disabled),
.director-command:hover:not(:disabled) {
  background: #2d3137;
  color: #f8fafc;
}

.director-icon-button.active,
.director-tool-button.active {
  border-color: rgba(34, 211, 238, 0.34);
  background: rgba(8, 145, 178, 0.24);
  color: #a5f3fc;
}

.director-icon-button.danger:hover:not(:disabled) {
  border-color: rgba(248, 113, 113, 0.38);
  background: rgba(127, 29, 29, 0.42);
  color: #fecaca;
}

.director-command {
  min-width: 82px;
  gap: 6px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
}

.director-icon-button:disabled,
.director-tool-button:disabled,
.director-command:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.director-toolbar-select {
  width: 112px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: #0f1114;
  color: #e5e7eb;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .director-toolbar {
    grid-template-columns: minmax(180px, 1fr) auto auto;
    grid-auto-flow: row;
  }
}

@media (max-width: 860px) {
  .director-toolbar {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    max-height: 38vh;
    overflow-y: auto;
  }

  .director-toolbar-project {
    width: 100%;
  }

  .director-toolbar-group,
  .director-toolbar-segment {
    width: 100%;
    padding-left: 0;
    border-left: 0;
    overflow-x: auto;
  }

  .director-toolbar-group {
    flex-wrap: nowrap;
  }

  .director-command {
    flex: 1 1 0;
    min-width: 0;
  }

  .director-toolbar-select {
    flex: 1 1 120px;
    min-width: 96px;
  }
}

@media (max-width: 640px) {
  .director-toolbar {
    max-height: 42vh;
  }

  .director-command {
    flex: none;
    width: 32px;
    min-width: 32px;
    padding: 0;
  }

  .director-command span {
    display: none;
  }

  .director-toolbar-title strong {
    font-size: 12px;
  }
}
</style>
