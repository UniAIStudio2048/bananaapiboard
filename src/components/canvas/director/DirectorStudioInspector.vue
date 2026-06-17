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
  DIRECTOR_STUDIO_ACTION_POSE_PRESETS,
  DIRECTOR_STUDIO_BONE_AXES,
  DIRECTOR_STUDIO_BONE_CONTROL_GROUPS,
  DIRECTOR_STUDIO_BODY_STYLES,
  DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS,
  normalizeDirectorStudioBoneControls,
  normalizeDirectorStudioBodyControls
} from '@/config/canvas/directorStudioPresetCatalog.js'
import { useDirectorStudioI18n } from './useDirectorStudioI18n.js'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const BODY_CONTROL_RANGES = {
  core: {
    height: [0.45, 1.8],
    torsoWidth: [0.45, 2.2],
    headScale: [0.55, 1.8],
    torsoLeanDeg: [-45, 45]
  },
  arms: {
    length: [0.45, 1.8],
    thickness: [0.45, 2],
    spreadDeg: [-35, 35]
  },
  legs: {
    length: [0.45, 1.8],
    thickness: [0.45, 2],
    spreadDeg: [-25, 35]
  }
}

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
  'apply-action-preset',
  'apply-interaction-preset',
  'focus-selected',
  'update:transformMode',
  'open-shortcuts'
])

const poseName = ref('')
const { dt } = useDirectorStudioI18n()

const itemLabel = computed(() => {
  const item = props.selectedItem
  return item?.label || item?.title || item?.name || item?.id || dt('status.noSelection', '未选择')
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
const boneControls = computed(() => normalizeDirectorStudioBoneControls(props.selectedItem?.boneControls))
const customPoseEntries = computed(() => Object.entries(props.customActionPoses || {}))
const currentReferenceUrl = computed(() => props.selectedItem?.refImageUrl || '')
const activeActionPresetId = computed(() => resolveActiveActionPresetId(props.selectedItem))
const activeInteractionPresetId = computed(() => resolveActiveInteractionPresetId(props.selectedItem))

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveActiveActionPresetId(item) {
  const action = trimmedString(item?.action)
  if (!action) return ''
  return DIRECTOR_STUDIO_ACTION_POSE_PRESETS.find(preset => preset.action === action)?.id || ''
}

function resolveActiveInteractionPresetId(item) {
  const relation = trimmedString(item?.relation)
  const action = trimmedString(item?.action)
  if (!relation && !action) return ''

  return DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS.find(preset =>
    (relation && preset.relation === relation) ||
    (action && (preset.primary?.action === action || preset.secondary?.action === action))
  )?.id || ''
}

function numberOr(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function getBodyControlRange(section, key) {
  return BODY_CONTROL_RANGES[section]?.[key] || [-360, 360]
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
  const [min, max] = getBodyControlRange(section, key)
  patchSelected({
    bodyControls: normalizeDirectorStudioBodyControls({
      ...bodyControls.value,
      [section]: {
        ...bodyControls.value[section],
        [key]: clampNumber(event.target.value, bodyControls.value[section]?.[key], min, max)
      }
    })
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

function updateBoneValue(boneKey, axisKey, event) {
  patchSelected({
    boneControls: normalizeDirectorStudioBoneControls({
      ...boneControls.value,
      [boneKey]: {
        ...boneControls.value[boneKey],
        [axisKey]: clampNumber(event.target.value, boneControls.value[boneKey]?.[axisKey], -180, 180)
      }
    })
  })
}

function handleActionPresetChange(event) {
  const value = event.target.value
  if (value) emit('apply-action-preset', value)
}

function handleInteractionPresetChange(event) {
  const value = event.target.value
  if (value) emit('apply-interaction-preset', value)
}

function savePose() {
  if (!props.selectedItem?.id) return
  const rawName = poseName.value.trim() || dt('inspector.defaultPoseName', '{name} 姿势', { name: itemLabel.value })
  const key = rawName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-|-$/g, '') || `pose-${Date.now()}`
  emit('save-custom-pose', {
    key,
    name: rawName,
    action: props.selectedItem.action || '',
    bodyControls: props.selectedItem.bodyControls || {},
    boneControls: props.selectedItem.boneControls || {},
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
        <span>{{ dt('inspector.title', '检查器') }}</span>
        <strong>{{ itemLabel }}</strong>
      </div>

      <div class="director-transform-tabs">
        <button type="button" :class="{ active: transformMode === 'move' }" :title="dt('toolbar.move', '移动')" @click="emit('update:transformMode', 'move')">
          <Move3D :size="15" stroke-width="2" />
        </button>
        <button type="button" :class="{ active: transformMode === 'rotate' }" :title="dt('toolbar.rotate', '旋转')" @click="emit('update:transformMode', 'rotate')">
          <RotateCcw :size="15" stroke-width="2" />
        </button>
        <button type="button" :class="{ active: transformMode === 'scale' }" :title="dt('toolbar.scale', '缩放')" @click="emit('update:transformMode', 'scale')">
          <Scale3D :size="15" stroke-width="2" />
        </button>
      </div>
    </section>

    <section class="director-inspector-section">
      <template v-if="selectedItem">
        <div class="director-action-row">
          <button type="button" @click="emit('focus-selected')">{{ dt('inspector.focus', '聚焦') }}</button>
          <button type="button" :title="dt('toolbar.copySelected', '复制选中')" @click="emit('copy-item')">
            <Copy :size="14" stroke-width="2" />
          </button>
          <button type="button" :disabled="!canPaste" @click="emit('paste-item')">{{ dt('inspector.paste', '粘贴') }}</button>
          <button type="button" @click="emit('duplicate-item')">{{ dt('inspector.duplicate', '复制副本') }}</button>
          <button type="button" class="danger" :title="dt('toolbar.deleteSelected', '删除选中')" @click="emit('delete-item')">
            <Trash2 :size="14" stroke-width="2" />
          </button>
        </div>

        <label class="director-field">
          <span>{{ dt('inspector.name', '名称') }}</span>
          <input :value="selectedItem.label || ''" type="text" @change="updateStringField('label', $event)">
        </label>

        <div class="director-field-grid three">
          <label>
            <span>{{ dt('inspector.category', '分类') }}</span>
            <select :value="selectedItem.category || 'object'" @change="updateStringField('category', $event)">
              <option value="person">{{ dt('categories.person', '人物') }}</option>
              <option value="object">{{ dt('categories.object', '物体') }}</option>
              <option value="scene">{{ dt('categories.scene', '场景') }}</option>
            </select>
          </label>
          <label>
            <span>{{ dt('inspector.color', '颜色') }}</span>
            <input :value="selectedItem.color || '#38bdf8'" type="color" @input="updateStringField('color', $event)">
          </label>
          <label class="director-checkbox-field">
            <input :checked="selectedItem.showLabel !== false" type="checkbox" @change="updateBooleanField('showLabel', $event)">
            <span>{{ dt('inspector.label', '标签') }}</span>
          </label>
        </div>

        <label class="director-field">
          <span>{{ dt('inspector.action', '动作') }}</span>
          <input :value="selectedItem.action || ''" type="text" @change="updateStringField('action', $event)">
        </label>

        <div v-if="selectedItem.category === 'person'" class="director-pose-controls">
          <div class="director-section-subtitle">{{ dt('inspector.posePresets', '姿势预设') }}</div>
          <div class="director-field-row">
            <label>{{ dt('inspector.actionPreset', '单人') }}</label>
            <select :value="activeActionPresetId" @change="handleActionPresetChange">
              <option value="">{{ dt('inspector.none', '无') }}</option>
              <option v-for="preset in DIRECTOR_STUDIO_ACTION_POSE_PRESETS" :key="preset.id" :value="preset.id">
                {{ dt(preset.labelKey, preset.name) }}
              </option>
            </select>
          </div>
          <div class="director-field-row">
            <label>{{ dt('inspector.interactionPreset', '双人') }}</label>
            <select :value="activeInteractionPresetId" @change="handleInteractionPresetChange">
              <option value="">{{ dt('inspector.none', '无') }}</option>
              <option v-for="preset in DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS" :key="preset.id" :value="preset.id">
                {{ dt(preset.labelKey, preset.name) }}
              </option>
            </select>
          </div>
        </div>

        <label class="director-field">
          <span>{{ dt('inspector.relation', '关系') }}</span>
          <input :value="selectedItem.relation || ''" type="text" @change="updateStringField('relation', $event)">
        </label>

        <label class="director-field">
          <span>{{ dt('inspector.note', '备注') }}</span>
          <textarea :value="selectedItem.note || ''" rows="2" @change="updateStringField('note', $event)" />
        </label>

        <div class="director-field-grid three">
          <label v-for="axis in ['x', 'y', 'z']" :key="`pos-${axis}`">
            <span>{{ dt('inspector.position', '位置') }} {{ axis.toUpperCase() }}</span>
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
            <span>{{ dt('inspector.rotation', '旋转') }} {{ axis.toUpperCase() }}</span>
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
            <span>{{ dt('inspector.scale', '缩放') }} {{ axis.toUpperCase() }}</span>
            <input :value="itemScale[axis].toFixed(2)" type="number" min="0.05" max="10" step="0.05" @change="updateScale(axis, $event)">
          </label>
        </div>

        <div class="director-field-row">
          <label>{{ dt('inspector.reference', '参考图') }}</label>
          <select :value="currentReferenceUrl" @change="updateReference">
            <option value="">{{ dt('inspector.unlinked', '未关联') }}</option>
            <option v-for="asset in referenceAssets" :key="asset.id || asset.url" :value="asset.url">
              {{ asset.label || asset.url }}
            </option>
          </select>
        </div>

        <div v-if="selectedItem.category === 'person'" class="director-body-controls">
          <div class="director-section-subtitle">{{ dt('inspector.body', '身体') }}</div>
          <div class="director-field-row">
            <label>{{ dt('inspector.style', '风格') }}</label>
            <select :value="bodyControls.style" @change="updateBodyStyle">
              <option v-for="style in DIRECTOR_STUDIO_BODY_STYLES" :key="style.value" :value="style.value">
                {{ dt(style.labelKey, style.value) }}
              </option>
            </select>
          </div>
          <label class="director-checkbox-field inline">
            <input :checked="bodyControls.showControls" type="checkbox" @change="updateBodyShowControls">
            <span>{{ dt('inspector.controls', '控制点') }}</span>
          </label>
          <div class="director-field-grid two">
            <label>
              <span>{{ dt('inspector.height', '身高') }}</span>
              <input :value="bodyControls.core.height" type="number" min="0.45" max="1.8" step="0.01" @change="updateBodyValue('core', 'height', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.torso', '躯干') }}</span>
              <input :value="bodyControls.core.torsoWidth" type="number" min="0.45" max="2.2" step="0.01" @change="updateBodyValue('core', 'torsoWidth', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.head', '头部') }}</span>
              <input :value="bodyControls.core.headScale" type="number" min="0.55" max="1.8" step="0.01" @change="updateBodyValue('core', 'headScale', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.lean', '倾斜') }}</span>
              <input :value="bodyControls.core.torsoLeanDeg" type="number" min="-45" max="45" step="1" @change="updateBodyValue('core', 'torsoLeanDeg', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.armLength', '手臂长度') }}</span>
              <input :value="bodyControls.arms.length" type="number" min="0.45" max="1.8" step="0.01" @change="updateBodyValue('arms', 'length', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.armThickness', '手臂粗细') }}</span>
              <input :value="bodyControls.arms.thickness" type="number" min="0.45" max="2" step="0.01" @change="updateBodyValue('arms', 'thickness', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.legLength', '腿部长度') }}</span>
              <input :value="bodyControls.legs.length" type="number" min="0.45" max="1.8" step="0.01" @change="updateBodyValue('legs', 'length', $event)">
            </label>
            <label>
              <span>{{ dt('inspector.legThickness', '腿部粗细') }}</span>
              <input :value="bodyControls.legs.thickness" type="number" min="0.45" max="2" step="0.01" @change="updateBodyValue('legs', 'thickness', $event)">
            </label>
          </div>

          <div v-if="selectedItem.category === 'person' && bodyControls.showControls" class="director-bone-controls">
            <div class="director-section-subtitle">{{ dt('inspector.boneControls', '骨骼动作') }}</div>
            <div v-for="bone in DIRECTOR_STUDIO_BONE_CONTROL_GROUPS" :key="bone.key" class="director-bone-row">
              <span>{{ dt(bone.labelKey, bone.key) }}</span>
              <label v-for="axis in DIRECTOR_STUDIO_BONE_AXES" :key="`${bone.key}-${axis.key}`">
                <small>{{ dt(axis.labelKey, axis.key.replace('Deg', '').toUpperCase()) }}</small>
                <input
                  :value="Math.round(boneControls[bone.key][axis.key])"
                  type="number"
                  min="-180"
                  max="180"
                  step="1"
                  @input="updateBoneValue(bone.key, axis.key, $event)"
                >
              </label>
            </div>
          </div>
        </div>

        <div class="director-custom-pose">
          <div class="director-section-subtitle">{{ dt('inspector.customPoses', '自定义姿势') }}</div>
          <div class="director-field-row">
            <label>{{ dt('inspector.apply', '应用') }}</label>
            <select value="" @change="$event.target.value && emit('apply-custom-pose', $event.target.value)">
              <option value="">{{ dt('inspector.none', '无') }}</option>
              <option v-for="[key, pose] in customPoseEntries" :key="key" :value="key">
                {{ pose.name || key }}
              </option>
            </select>
          </div>
          <div class="director-field-row">
            <label>{{ dt('inspector.name', '名称') }}</label>
            <input v-model="poseName" type="text">
          </div>
          <button type="button" class="director-wide-button" @click="savePose">{{ dt('inspector.savePose', '保存姿势') }}</button>
        </div>
      </template>
      <div v-else class="director-empty-selection">{{ dt('inspector.noItemSelected', '未选择元素') }}</div>
    </section>

    <details class="director-inspector-section" :open="activeSection === 'camera'">
      <summary>{{ dt('inspector.camera', '镜头') }}</summary>
      <div class="director-slider-field">
        <span>{{ dt('inspector.fov', '视角') }} {{ Math.round(camera.fov || 40) }}</span>
        <input :value="camera.fov || 40" type="range" min="10" max="150" step="1" @input="patchCamera('fov', $event)">
      </div>
      <div class="director-slider-field">
        <span>{{ dt('inspector.lens', '镜头距离') }} {{ Number(camera.lensDistance || 8).toFixed(1) }}</span>
        <input :value="camera.lensDistance || 8" type="range" min="2" max="80" step="0.5" @input="patchCamera('lensDistance', $event)">
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'lighting'">
      <summary>{{ dt('inspector.lighting', '灯光') }}</summary>
      <label class="director-checkbox-field inline">
        <input :checked="lighting.enabled !== false" type="checkbox" @change="patchLighting('enabled', $event, 'boolean')">
        <span>{{ dt('inspector.enabled', '启用') }}</span>
      </label>
      <div class="director-slider-field">
        <span>{{ dt('inspector.mainLight', '主光') }} {{ Number(lighting.mainIntensity || 0).toFixed(2) }}</span>
        <input :value="lighting.mainIntensity || 0" type="range" min="0" max="4" step="0.05" @input="patchLighting('mainIntensity', $event)">
      </div>
      <div class="director-field-grid two">
        <label>
          <span>{{ dt('inspector.yaw', '水平角') }}</span>
          <input :value="lighting.mainYaw || 0" type="number" min="-180" max="180" step="1" @change="patchLighting('mainYaw', $event)">
        </label>
        <label>
          <span>{{ dt('inspector.pitch', '俯仰角') }}</span>
          <input :value="lighting.mainPitch || 0" type="number" min="-20" max="89" step="1" @change="patchLighting('mainPitch', $event)">
        </label>
        <label>
          <span>{{ dt('inspector.mainColor', '主光颜色') }}</span>
          <input :value="lighting.mainColor || '#ffffff'" type="color" @input="patchLighting('mainColor', $event, 'color')">
        </label>
        <label>
          <span>{{ dt('inspector.ambientColor', '环境光颜色') }}</span>
          <input :value="lighting.ambientColor || '#ffffff'" type="color" @input="patchLighting('ambientColor', $event, 'color')">
        </label>
      </div>
      <div class="director-slider-field">
        <span>{{ dt('inspector.ambientLight', '环境光') }} {{ Number(lighting.ambientIntensity || 0).toFixed(2) }}</span>
        <input :value="lighting.ambientIntensity || 0" type="range" min="0" max="3" step="0.05" @input="patchLighting('ambientIntensity', $event)">
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'grid'">
      <summary>{{ dt('inspector.grid', '网格') }}</summary>
      <label class="director-checkbox-field inline">
        <input :checked="grid.visible !== false" type="checkbox" @change="patchGrid('visible', $event, 'boolean')">
        <span>{{ dt('inspector.visible', '显示') }}</span>
      </label>
      <div class="director-slider-field">
        <span>{{ dt('inspector.gridHeight', '网格高度') }} {{ Number(grid.height || 0).toFixed(1) }}</span>
        <input :value="grid.height || 0" type="range" min="-5" max="10" step="0.1" @input="patchGrid('height', $event)">
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'view'">
      <summary>{{ dt('inspector.view', '视图') }}</summary>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.wheelZoomEnabled !== false" type="checkbox" @change="patchView('wheelZoomEnabled', $event)">
        <span>{{ dt('inspector.wheelZoom', '滚轮缩放') }}</span>
      </label>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.reverseWheelZoom === true" type="checkbox" @change="patchView('reverseWheelZoom', $event)">
        <span>{{ dt('inspector.reverseWheel', '反向滚轮') }}</span>
      </label>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.reverseVerticalOrbit === true" type="checkbox" @change="patchView('reverseVerticalOrbit', $event)">
        <span>{{ dt('inspector.reverseVerticalOrbit', '反向上下拖拽') }}</span>
      </label>
      <label class="director-checkbox-field inline">
        <input :checked="viewSettings.showAdvancedPedestrianTags === true" type="checkbox" @change="patchView('showAdvancedPedestrianTags', $event)">
        <span>{{ dt('inspector.pedestrianTags', '行人标签') }}</span>
      </label>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'aspect'">
      <summary>{{ dt('inspector.frame', '画幅') }}</summary>
      <div class="director-field-row">
        <label>{{ dt('inspector.aspect', '比例') }}</label>
        <select :value="aspectFrame" @change="patchNodeData({ aspectFrame: $event.target.value, aspectRatio: $event.target.value })">
          <option v-for="frame in aspectFrames" :key="frame.value" :value="frame.value">
            {{ dt(frame.labelKey, frame.value) }}
          </option>
        </select>
      </div>
      <div class="director-field-row">
        <label>{{ dt('inspector.resolution', '分辨率') }}</label>
        <select :value="screenshotResolution" @change="patchNodeData({ screenshotResolution: $event.target.value })">
          <option v-for="resolution in screenshotResolutions" :key="resolution.value" :value="resolution.value">
            {{ dt(resolution.labelKey, resolution.value) }}
          </option>
        </select>
      </div>
    </details>

    <details class="director-inspector-section" :open="activeSection === 'prompt'">
      <summary>{{ dt('inspector.prompt', '提示词') }}</summary>
      <label class="director-field">
        <span>{{ dt('inspector.basePrompt', '基础提示词') }}</span>
        <textarea :value="basePrompt" rows="4" @change="patchNodeData({ basePrompt: $event.target.value })" />
      </label>
    </details>

    <section class="director-inspector-section">
      <button type="button" class="director-wide-button" @click="emit('open-shortcuts')">{{ dt('shortcuts.title', '快捷键') }}</button>
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
  min-height: var(--director-control-height, 34px);
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #23262b;
  color: #d4d4d8;
  font-size: 12px;
  font-weight: 700;
  line-height: var(--director-control-line-height, 1.35);
  cursor: pointer;
}

.director-transform-tabs button {
  width: var(--director-control-height, 34px);
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
  line-height: var(--director-control-line-height, 1.35);
}

input,
select {
  min-height: var(--director-control-height, 34px);
  padding: 0 8px;
  line-height: var(--director-control-line-height, 1.35);
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
  min-height: 14px;
  height: 14px;
  flex: none;
  padding: 0;
}

.director-body-controls,
.director-pose-controls,
.director-custom-pose {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.director-bone-controls {
  display: grid;
  gap: 7px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.director-bone-row {
  display: grid;
  grid-template-columns: 92px repeat(3, minmax(0, 1fr));
  gap: 5px;
  align-items: end;
}

.director-bone-row > span {
  align-self: center;
  color: #d4d4d8;
  font-size: 11px;
}

.director-bone-row label {
  display: grid;
  gap: 2px;
}

.director-bone-row small {
  color: #8b949e;
  font-size: 10px;
  line-height: 1;
}

.director-slider-field {
  display: grid;
  gap: 5px;
}

.director-slider-field input {
  min-height: 20px;
  height: 20px;
  padding: 0;
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

@media (max-width: 520px) {
  .director-field-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .director-field-grid.three {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .director-inspector-band {
    grid-template-columns: minmax(0, 1fr);
  }

  .director-field-grid.two,
  .director-field-grid.three {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
