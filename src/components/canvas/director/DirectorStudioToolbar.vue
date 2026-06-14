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
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useDirectorStudioI18n } from './useDirectorStudioI18n.js'

const props = defineProps({
  projectName: { type: String, default: '3D导演台' },
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

const { dt } = useDirectorStudioI18n()

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
      <button type="button" class="director-icon-button" :title="dt('close', '关闭')" @click="emit('close')">
        <X :size="17" stroke-width="2.1" />
      </button>
      <Box :size="18" stroke-width="2" class="director-toolbar-mark" />
      <div class="director-toolbar-title">
        <span>{{ dt('title', '3D导演台') }}</span>
        <strong>{{ projectName }}</strong>
      </div>
    </div>

    <div class="director-toolbar-group">
      <button type="button" class="director-command" :title="dt('toolbar.saveProjectTitle', '保存项目')" @click="emit('save-project')">
        <Save :size="15" stroke-width="2" />
        <span>{{ dt('toolbar.save', '保存') }}</span>
      </button>
      <button type="button" class="director-command" :title="dt('toolbar.captureTitle', '截图')" @click="emit('capture-screenshot')">
        <Camera :size="15" stroke-width="2" />
        <span>{{ dt('toolbar.capture', '截图') }}</span>
      </button>
      <button
        type="button"
        class="director-command"
        :title="dt('toolbar.addToCanvasTitle', '添加截图到画布')"
        @click="emit('add-to-canvas')"
      >
        <Download :size="15" stroke-width="2" />
        <span>{{ dt('toolbar.canvas', '画布') }}</span>
      </button>
    </div>

    <div class="director-toolbar-segment" :aria-label="dt('toolbar.transformMode', '变换模式')">
      <button
        type="button"
        class="director-tool-button"
        :class="{ active: transformMode === 'move' }"
        :title="dt('toolbar.move', '移动')"
        @click="selectTransform('move')"
      >
        <Move3D :size="16" stroke-width="2" />
      </button>
      <button
        type="button"
        class="director-tool-button"
        :class="{ active: transformMode === 'rotate' }"
        :title="dt('toolbar.rotate', '旋转')"
        @click="selectTransform('rotate')"
      >
        <RotateCcw :size="16" stroke-width="2" />
      </button>
      <button
        type="button"
        class="director-tool-button"
        :class="{ active: transformMode === 'scale' }"
        :title="dt('toolbar.scale', '缩放')"
        @click="selectTransform('scale')"
      >
        <Scale3D :size="16" stroke-width="2" />
      </button>
    </div>

    <div class="director-toolbar-group compact">
      <select
        class="director-toolbar-select"
        :title="dt('toolbar.cameraPreset', '镜头预设')"
        :value="camera.activePreset || 'standard'"
        @change="selectCameraPreset"
      >
        <option v-for="preset in cameraPresets" :key="preset.id" :value="preset.id">
          {{ dt(preset.labelKey, preset.id) }}
        </option>
      </select>
      <button type="button" class="director-icon-button" :title="dt('toolbar.focusSelected', '聚焦选中')" :disabled="!hasSelection" @click="emit('focus-selected')">
        <Maximize2 :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" :title="dt('toolbar.fitScene', '适配场景')" @click="emit('fit-scene')">
        <Maximize2 :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" :title="dt('toolbar.resetCamera', '重置镜头')" @click="emit('reset-camera')">
        <RotateCcw :size="16" stroke-width="2" />
      </button>
    </div>

    <div class="director-toolbar-group compact">
      <button
        type="button"
        class="director-icon-button"
        :class="{ active: lighting.enabled !== false }"
        :title="dt('toolbar.toggleLighting', '切换灯光')"
        @click="emit('lighting-patch', { enabled: lighting.enabled === false })"
      >
        <Lamp :size="16" stroke-width="2" />
      </button>
      <button
        type="button"
        class="director-icon-button"
        :class="{ active: grid.visible !== false }"
        :title="dt('toolbar.toggleGrid', '切换网格')"
        @click="emit('grid-patch', { visible: grid.visible === false })"
      >
        <Grid3X3 :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" :title="dt('toolbar.copySelected', '复制选中')" :disabled="!hasSelection" @click="emit('copy-selected')">
        <Copy :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button" :title="dt('toolbar.pasteItem', '粘贴元素')" :disabled="!canPaste" @click="emit('paste-item')">
        <Download :size="16" stroke-width="2" />
      </button>
      <button type="button" class="director-icon-button danger" :title="dt('toolbar.deleteSelected', '删除选中')" :disabled="!hasSelection" @click="emit('delete-selected')">
        <Trash2 :size="16" stroke-width="2" />
      </button>
    </div>

    <div class="director-toolbar-language">
      <LanguageSwitcher compact :is-dark="true" direction="down" />
    </div>
  </header>
</template>

<style scoped>
.director-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto auto auto auto;
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
.director-toolbar-segment,
.director-toolbar-language {
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

.director-toolbar-language {
  justify-content: flex-end;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.director-toolbar-segment {
  min-height: calc(var(--director-control-height, 34px) + 4px);
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
  min-width: var(--director-control-height, 34px);
  min-height: var(--director-control-height, 34px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: #23262b;
  color: #d4d4d8;
  line-height: var(--director-control-line-height, 1.35);
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
  width: 118px;
  min-height: var(--director-control-height, 34px);
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: #0f1114;
  color: #e5e7eb;
  font-size: 12px;
  line-height: var(--director-control-line-height, 1.35);
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
  .director-toolbar-segment,
  .director-toolbar-language {
    width: 100%;
    padding-left: 0;
    border-left: 0;
    overflow-x: auto;
  }

  .director-toolbar-language {
    justify-content: flex-start;
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
