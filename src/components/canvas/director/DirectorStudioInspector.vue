<script setup>
import { computed, ref } from 'vue'
import { Copy, Move3D, RotateCcw, Scale3D, Trash2 } from '@lucide/vue'
import {
  ensureDirectorPos3d,
  pos3dToDirectorLegacy,
  readDirectorUiAxis,
  writeDirectorUiAxis
} from '@/utils/directorStudioCoordinates.js'
import {
  DIRECTOR_STUDIO_BODY_STYLES,
  normalizeDirectorStudioBodyControls
} from '@/config/canvas/directorStudioPresetCatalog.js'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

const props = defineProps({
  selectedItem: { type: Object, default: null },
  referenceAssets: { type: Array, default: () => [] },
  camera: { type: Object, default: () => ({}) },
  lighting: { type: Object, default: () => ({}) },
  grid: { type: Object, default: () => ({}) },
  viewSettings: { type: Object, default: () => ({}) },
  aspectFrame: { type: String, default: '16:9' },
  aspectFrames: { type: Array, default: () => [] },
  screenshotResolution: { type: String, default: '1080p' },
  screenshotResolutions: { type: Array, default: () => [] },
  basePrompt: { type: String, default: '' },
  transformMode: { type: String, default: 'move' },
  customActionPoses: { type: Object, default: () => ({}) },
  activeSection: { type: String, default: null },
  canPaste: { type: Boolean, default: false }
})

const emit = defineEmits([
  'item-patch',
  'duplicate-item',
  'delete-item',
  'copy-item',
  'paste-item',
  'patch-node-data',
  'save-custom-pose',
  'apply-custom-pose',
  'focus-selected',
  'update:transformMode',
  'open-shortcuts'
])

const poseName = ref('')

const itemLabel = computed(() => {
  const item = props.selectedItem
  return item?.label || item?.title || item?.name || item?.id || 'No selection'
})

const itemPosition = computed(() => props.selectedItem ? ensureDirectorPos3d(props.selectedItem) : { x: 0, y: 0, z: 0 })
const itemRotation = computed(() => ({
  x: numberOr(props.selectedItem?.rotation3d?.x, 0),
  y: numberOr(props.selectedItem?.rotation3d?.y, 0),
  z: numberOr(props.selectedItem?.rotation3d?.z, 0)
}))
const itemScale = computed(() => ({
  x: numberOr(props.selectedItem?.scale3d?.x, 1),
  y: numberOr(props.selectedItem?.scale3d?.y, 1),
  z: numberOr(props.selectedItem?.scale3d?.z, 1)
}))
const bodyControls = computed(() => normalizeDirectorStudioBodyControls(props.selectedItem?.bodyControls))
const customPoseEntries = computed(() => Object.entries(props.customActionPoses || {}))
const currentReferenceUrl = computed(() => props.selectedItem?.refImageUrl || '')

function numberOr(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function patchSelected(patch) {
  if (!props.selectedItem?.id) return
  emit('item-patch', patch)
}

function patchNodeData(patch) {
  emit('patch-node-data', patch)
}

function updateStringField(key, event) {
  patchSelected({ [key]: event.target.value })
}

function updateBooleanField(key, event) {
  patchSelected({ [key]: event.target.checked })
}

function updatePosition(axis, event) {
  const nextValue = clampNumber(event.target.value, readDirectorUiAxis(itemPosition.value, axis), -999, 999)
  const pos3d = writeDirectorUiAxis(itemPosition.value, axis, nextValue)
  const legacy = pos3dToDirectorLegacy(pos3d)
  patchSelected({ pos3d, x: legacy.x, y: legacy.y })
}

function updateRotation(axis, event) {
  const degrees = clampNumber(event.target.value, itemRotation.value[axis] * RAD_TO_DEG, -360, 360)
  patchSelected({
    rotation3d: {
      ...itemRotation.value,
      [axis]: degrees * DEG_TO_RAD
    }
  })
}

function updateScale(axis, event) {
  patchSelected({
    scale3d: {
      ...itemScale.value,
      [axis]: clampNumber(event.target.value, itemScale.value[axis], 0.05, 10)
    }
  })
}

function updateReference(event) {
  const url = event.target.value
  if (!url) {
    patchSelected({ refImageUrl: null, refImageName: null, refImageId: null })
    return
  }
  const asset = props.referenceAssets.find(item => item.url === url) || {}
  patchSelected({
    refImageUrl: url,
    refImageName: asset.label || '',
    refImageId: asset.id || null
  })
}

function updateBodyStyle(event) {
  patchSelected({
    bodyControls: {
      ...bodyControls.value,
      style: event.target.value
    }
  })
}

function updateBodyValue(section, key, event) {
  patchSelected({
    bodyControls: {
      ...bodyControls.value,
      [section]: {
        ...bodyControls.value[section],
        [key]: clampNumber(event.target.value, bodyControls.value[section]?.[key], -360, 360)
      }
    }
  })
}

function updateBodyShowControls(event) {
  patchSelected({
    bodyControls: {
      ...bodyControls.value,
      showControls: event.target.checked
    }
  })
}

function savePose() {
  if (!props.selectedItem?.id) return
  const rawName = poseName.value.trim() || `${itemLabel.value} pose`
  const key = rawName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-|-$/g, '') || `pose-${Date.now()}`
  emit('save-custom-pose', {
    key,
    name: rawName,
    action: props.selectedItem.action || '',
    bodyControls: props.selectedItem.bodyControls || {},
    note: props.selectedItem.note || ''
  })
  poseName.value = ''
}

function patchCamera(key, event) {
  const ranges = {
    fov: [10, 150],
    lensDistance: [2, 80]
  }
  const [min, max] = ranges[key]
  patchNodeData({
    camera: {
      ...props.camera,
      [key]: clampNumber(event.target.value, props.camera[key], min, max)
    }
  })
}

function patchLighting(key, event, type = 'number') {
  const ranges = {
    mainIntensity: [0, 4],
    mainYaw: [-180, 180],
    mainPitch: [-20, 89],
    ambientIntensity: [0, 3]
  }
  const value = type === 'boolean'
    ? event.target.checked
    : type === 'color'
      ? event.target.value
      : clampNumber(event.target.value, props.lighting[key], ranges[key][0], ranges[key][1])
  patchNodeData({ lighting: { ...props.lighting, [key]: value } })
}

function patchGrid(key, event, type = 'number') {
  const value = type === 'boolean'
    ? event.target.checked
    : clampNumber(event.target.value, props.grid[key], -5, 10)
  patchNodeData({ grid: { ...props.grid, [key]: value } })
}

function patchView(key, event) {
  patchNodeData({
    viewSettings: {
      ...props.viewSettings,
      [key]: event.target.checked
    }
  })
}
</script>

<template>
  <aside class="director-inspector">
    <section class="director-inspector-band">
      <div class="director-inspector-title">
        <span>Inspector</span>
        <strong>{{ itemLabel }}</strong>
      </div>

      <div class="director-transform-tabs">
        <button type="button" :class="{ active: transformMode === 'move' }" title="Move" @click="emit('update:transformMode', 'move')">
          <Move3D :size="15" stroke-width="2" />
        </button>
        <button type="button" :class="{ active: transformMode === 'rotate' }" title="Rotate" @click="emit('update:transformMode', 'rotate')">
          <RotateCcw :size="15" stroke-width="2" />
        </button>
        <button type="button" :class="{ active: transformMode === 'scale' }" title="Scale" @click="emit('update:transformMode', 'scale')">
          <Scale3D :size="15" stroke-width="2" />
        </button>
      </div>
    </section>

    <section class="director-inspector-section">
      <template v-if="selectedItem">
        <div class="director-action-row">
          <button type="button" @click="emit('focus-selected')">Focus</button>
          <button type="button" title="Copy selected" @click="emit('copy-item')">
            <Copy :size="14" stroke-width="2" />
          </button>
          <button type="button" :disabled="!canPaste" @click="emit('paste-item')">Paste</button>
          <button type="button" @click="emit('duplicate-item')">Duplicate</button>
          <button type="button" class="danger" title="Delete selected" @click="emit('delete-item')">
            <Trash2 :size="14" stroke-width="2" />
          </button>
        </div>

        <label class="director-field">
          <span>Name</span>
          <input :value="selectedItem.label || ''" type="text" @change="updateStringField('label', $event)">
        </label>

        <div class="director-field-grid three">
          <label>
            <span>Category</span>
            <select :value="selectedItem.category || 'object'" @change="updateStringField('category', $event)">
              <option value="person">person</option>
              <option value="object">object</option>
              <option value="scene">scene</option>
            </select>
          </label>
          <label>
            <span>Color</span>
            <input :value="selectedItem.color || '#38bdf8'" type="color" @input="updateStringField('color', $event)">
          </label>
          <label class="director-checkbox-field">
            <input :checked="selectedItem.showLabel !== false" type="checkbox" @change="updateBooleanField('showLabel', $event)">
            <span>Label</span>
          </label>
        </div>

        <label class="director-field">
          <span>Action</span>
          <input :value="selectedItem.action || ''" type="text" @change="updateStringField('action', $event)">
        </label>

        <label class="director-field">
          <span>Relation</span>
          <input :value="selectedItem.relation || ''" type="text" @change="updateStringField('relation', $event)">
        </label>

        <label class="director-field">
          <span>Note</span>
          <textarea :value="selectedItem.note || ''" rows="2" @change="updateStringField('note', $event)" />
        </label>

        <div class="director-field-grid three">
          <label v-for="axis in ['x', 'y', 'z']" :key="`pos-${axis}`">
            <span>Pos {{ axis.toUpperCase() }}</span>
            <input
              :value="readDirectorUiAxis(itemPosition, axis).toFixed(2)"
              type="number"
              step="0.1"
              @change="updatePosition(axis, $event)"
            >
          </label>
        </div>

        <div class="director-field-grid three">
          <label v-for="axis in ['x', 'y', 'z']" :key="`rot-${axis}`">
            <span>Rot {{ axis.toUpperCase() }}</span>
            <input
              :value="Math.round(itemRotation[axis] * RAD_TO_DEG)"
              type="number"
              step="1"
              @change="updateRotation(axis, $event)"
            >
          </label>
        </div>

        <div class="director-field-grid three">
          <label v-for="axis in ['x', 'y', 'z']" :key="`scale-${axis}`">
            <span>Scale {{ axis.toUpperCase() }}</span>
            <input :value="itemScale[axis].toFixed(2)" type="number" min="0.05" max="10" step="0.05" @change="updateScale(axis, $event)">
          </label>
        </div>

        <div class="director-field-row">
          <label>Reference</label>
          <select :value="currentReferenceUrl" @change="updateReference">
            <option value="">unlinked</option>
            <option v-for="asset in referenceAssets" :key="asset.id || asset.url" :value="asset.url">
              {{ asset.label || asset.url }}
            </option>
          </select>
        </div>

        <div v-if="selectedItem.category === 'person'" class="director-body-controls">
          <div class="director-section-subtitle">Body</div>
          <div class="director-field-row">
            <label>Style</label>
            <select :value="bodyControls.style" @change="updateBodyStyle">
              <option v-for="style in DIRECTOR_STUDIO_BODY_STYLES" :key="style.value" :value="style.value">
                {{ style.value }}
              </option>
            </select>
          </div>
          <label class="director-checkbox-field inline">
            <input :checked="bodyControls.showControls" type="checkbox" @change="updateBodyShowControls">
            <span>Controls</span>
          </label>
          <div class="director-field-grid two">
            <label>
              <span>Height</span>
              <input :value="bodyControls.core.height" type="number" min="0.45" max="1.8" step="0.01" @change="updateBodyValue('core', 'height', $event)">
            </label>
            <label>
              <span>Torso</span>
              <input :value="bodyControls.core.torsoWidth" type="number" min="0.45" max="2.2" step="0.01" @change="updateBodyValue('core', 'torsoWidth', $event)">
            </label>
            <label>
              <span>Head</span>
              <input :value="bodyControls.core.headScale" type="number" min="0.55" max="1.8" step="0.01" @change="updateBodyValue('core', 'headScale', $event)">
            </label>
            <label>
              <span>Lean</span>
              <input :value="bodyControls.core.torsoLeanDeg" type="number" min="-45" max="45" step="1" @change="updateBodyValue('core', 'torsoLeanDeg', $event)">
            </label>
            <label>
              <span>Arm len</span>
              <input :value="bodyControls.arms.length" type="number" min="0.45" max="1.8" step="0.01" @change="updateBodyValue('arms', 'length', $event)">
            </label>
            <label>
              <span>Arm thick</span>
              <input :value="bodyControls.arms.thickness" type="number" min="0.45" max="2" step="0.01" @change="updateBodyValue('arms', 'thickness', $event)">
            </label>
            <label>
              <span>Leg len</span>
              <input :value="bodyControls.legs.length" type="number" min="0.45" max="1.8" step="0.01" @change="updateBodyValue('legs', 'length', $event)">
            </label>
            <label>
              <span>Leg thick</span>
              <input :value="bodyControls.legs.thickness" type="number" min="0.45" max="2" step="0.01" @change="updateBodyValue('legs', 'thickness', $event)">
            </label>
          </div>
        </div>

        <div class="director-custom-pose">
          <div class="director-section-subtitle">Custom poses</div>
          <div class="director-field-row">
            <label>Apply</label>
            <select value="" @change="$event.target.value && emit('apply-custom-pose', $event.target.value)">
              <option value="">none</option>
              <option v-for="[key, pose] in customPoseEntries" :key="key" :value="key">
                {{ pose.name || key }}
              </option>
            </select>
          </div>
          <div class="director-field-row">
            <label>Name</label>
            <input v-model="poseName" type="text">
          </div>
          <button type="button" class="director-wide-button" @click="savePose">Save pose</button>
        </div>
      </template>
      <div v-else class="director-empty-selection">No item selected</div>
    </section>

    <details class="director-inspector-section" :open="activeSection === 'camera'">
      <summary>Camera</summary>
      <div class="director-slider-field">
        <span>FOV {{ Math.round(camera.fov || 40) }}</span>
        <input :value="camera.fov || 40" type="range" min="10" max="150" step="1" @input="patchCamera('fov', $event)">
      </div>
      <div class="director-slider-field">
        <span>Lens {{ Number(camera.lensDistance || 8).toFixed(1) }}</span>
        <input :value="camera.lensDistance || 8" type="range" min="2" max="80" step="0.5" @input="patchCamera('lensDistance', $event)">
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'lighting'">
      <summary>Lighting</summary>
      <label class="director-checkbox-field inline">
        <input :checked="lighting.enabled !== false" type="checkbox" @change="patchLighting('enabled', $event, 'boolean')">
        <span>Enabled</span>
      </label>
      <div class="director-slider-field">
        <span>Main {{ Number(lighting.mainIntensity || 0).toFixed(2) }}</span>
        <input :value="lighting.mainIntensity || 0" type="range" min="0" max="4" step="0.05" @input="patchLighting('mainIntensity', $event)">
      </div>
      <div class="director-field-grid two">
        <label>
          <span>Yaw</span>
          <input :value="lighting.mainYaw || 0" type="number" min="-180" max="180" step="1" @change="patchLighting('mainYaw', $event)">
        </label>
        <label>
          <span>Pitch</span>
          <input :value="lighting.mainPitch || 0" type="number" min="-20" max="89" step="1" @change="patchLighting('mainPitch', $event)">
        </label>
        <label>
          <span>Main color</span>
          <input :value="lighting.mainColor || '#ffffff'" type="color" @input="patchLighting('mainColor', $event, 'color')">
        </label>
        <label>
          <span>Ambient color</span>
          <input :value="lighting.ambientColor || '#ffffff'" type="color" @input="patchLighting('ambientColor', $event, 'color')">
        </label>
      </div>
      <div class="director-slider-field">
        <span>Ambient {{ Number(lighting.ambientIntensity || 0).toFixed(2) }}</span>
        <input :value="lighting.ambientIntensity || 0" type="range" min="0" max="3" step="0.05" @input="patchLighting('ambientIntensity', $event)">
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'grid'">
      <summary>Grid</summary>
      <label class="director-checkbox-field inline">
        <input :checked="grid.visible !== false" type="checkbox" @change="patchGrid('visible', $event, 'boolean')">
        <span>Visible</span>
      </label>
      <div class="director-slider-field">
        <span>Height {{ Number(grid.height || 0).toFixed(1) }}</span>
        <input :value="grid.height || 0" type="range" min="-5" max="10" step="0.1" @input="patchGrid('height', $event)">
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'view'">
      <summary>View</summary>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.wheelZoomEnabled !== false" type="checkbox" @change="patchView('wheelZoomEnabled', $event)">
        <span>Wheel zoom</span>
      </label>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.reverseWheelZoom === true" type="checkbox" @change="patchView('reverseWheelZoom', $event)">
        <span>Reverse wheel</span>
      </label>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.showAdvancedPedestrianTags === true" type="checkbox" @change="patchView('showAdvancedPedestrianTags', $event)">
        <span>Pedestrian tags</span>
      </label>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'aspect'">
      <summary>Frame</summary>
      <div class="director-field-row">
        <label>Aspect</label>
        <select :value="aspectFrame" @change="patchNodeData({ aspectFrame: $event.target.value, aspectRatio: $event.target.value })">
          <option v-for="frame in aspectFrames" :key="frame.value" :value="frame.value">
            {{ frame.value }}
          </option>
        </select>
      </div>
      <div class="director-field-row">
        <label>Resolution</label>
        <select :value="screenshotResolution" @change="patchNodeData({ screenshotResolution: $event.target.value })">
          <option v-for="resolution in screenshotResolutions" :key="resolution.value" :value="resolution.value">
            {{ resolution.value }}
          </option>
        </select>
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'prompt'">
      <summary>Prompt</summary>
      <label class="director-field">
        <span>Base prompt</span>
        <textarea :value="basePrompt" rows="4" @change="patchNodeData({ basePrompt: $event.target.value })" />
      </label>
    </details>

    <section class="director-inspector-section">
      <button type="button" class="director-wide-button" @click="emit('open-shortcuts')">Shortcuts</button>
    </section>
  </aside>
</template>

<style scoped>
.director-inspector {
  display: grid;
  align-content: start;
  width: 360px;
  min-width: 320px;
  max-width: 380px;
  height: 100%;
  overflow: auto;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  background: #121417;
  color: #e5e7eb;
}

.director-inspector-band,
.director-inspector-section {
  display: grid;
  gap: 9px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-inspector-band {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.director-inspector-title {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.director-inspector-title span,
.director-section-subtitle {
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  text-transform: uppercase;
}

.director-inspector-title strong {
  overflow: hidden;
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-transform-tabs,
.director-action-row {
  display: inline-flex;
  gap: 4px;
}

.director-transform-tabs button,
.director-action-row button,
.director-wide-button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #23262b;
  color: #d4d4d8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.director-transform-tabs button {
  width: 30px;
}

.director-action-row button {
  min-width: 30px;
  padding: 0 8px;
}

.director-action-row {
  flex-wrap: wrap;
}

.director-transform-tabs button.active {
  border-color: rgba(34, 211, 238, 0.42);
  background: rgba(8, 145, 178, 0.2);
  color: #a5f3fc;
}

.director-action-row button:hover:not(:disabled),
.director-transform-tabs button:hover,
.director-wide-button:hover {
  background: #30343b;
  color: #f8fafc;
}

.director-action-row button.danger:hover {
  border-color: rgba(248, 113, 113, 0.38);
  background: rgba(127, 29, 29, 0.42);
  color: #fecaca;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.director-field,
.director-field-grid label,
.director-field-row {
  display: grid;
  gap: 4px;
}

.director-field-row {
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
}

.director-field span,
.director-field-grid span,
.director-field-row label,
.director-checkbox-field span,
.director-slider-field span {
  color: #a1a1aa;
  font-size: 11px;
  line-height: 1.2;
}

input,
select,
textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #0f1114;
  color: #e5e7eb;
  font-size: 12px;
}

input,
select {
  height: 30px;
}

input[type="color"] {
  padding: 2px;
}

textarea {
  padding: 7px 8px;
  resize: vertical;
}

.director-field-grid {
  display: grid;
  gap: 6px;
}

.director-field-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.director-field-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.director-checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
}

.director-checkbox-field.inline {
  justify-content: flex-start;
}

.director-checkbox-field input {
  width: 14px;
  height: 14px;
  flex: none;
}

.director-body-controls,
.director-custom-pose {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.director-slider-field {
  display: grid;
  gap: 5px;
}

.director-slider-field input {
  height: 20px;
}

summary {
  cursor: pointer;
  color: #f4f4f5;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.director-wide-button {
  width: 100%;
}

.director-empty-selection {
  min-height: 54px;
  display: flex;
  align-items: center;
  color: #8b949e;
  font-size: 12px;
}
</style>
