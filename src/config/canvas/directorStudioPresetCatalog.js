import { DIRECTOR_STUDIO_MODEL_CATALOG } from './directorStudioModelCatalog.js'

export const DIRECTOR_STUDIO_BODY_STYLES = [
  { value: 'preset', labelKey: 'directorStudio.bodyStyles.preset' },
  { value: 'slim', labelKey: 'directorStudio.bodyStyles.slim' },
  { value: 'strong', labelKey: 'directorStudio.bodyStyles.strong' },
  { value: 'heavy', labelKey: 'directorStudio.bodyStyles.heavy' },
  { value: 'childlike', labelKey: 'directorStudio.bodyStyles.childlike' }
]

const DIRECTOR_STUDIO_BASE_PRESET_LABELS = {
  man: '男人',
  woman: '女人',
  child: '小孩',
  elder: '老人',
  tallMan: '高个男人',
  shortMan: '矮个男人',
  heavyMan: '偏胖男人',
  slimWoman: '偏瘦女人',
  tallWoman: '高个女人',
  box: '箱子',
  table: '桌子',
  chair: '椅子',
  plant: '植物',
  car: '车',
  sofa: '沙发',
  lamp: '灯',
  door: '门',
  window: '窗户',
  bed: '床',
  phone: '手机',
  cup: '杯子',
  'generic-object': '万能物体',
  'ground-scene': '地面场景',
  'aerial-scene': '空中场景'
}

export const DIRECTOR_STUDIO_PRESET_LABELS = {
  ...DIRECTOR_STUDIO_BASE_PRESET_LABELS,
  ...Object.fromEntries(DIRECTOR_STUDIO_MODEL_CATALOG.map(item => [item.presetId, item.displayName]))
}

const DEFAULT_BODY_CONTROLS = {
  style: 'preset',
  showControls: false,
  core: {
    height: 1,
    torsoWidth: 1,
    headScale: 1,
    torsoLeanDeg: 0
  },
  arms: {
    length: 1,
    thickness: 1,
    spreadDeg: 0
  },
  legs: {
    length: 1,
    thickness: 1,
    spreadDeg: 0
  }
}

const STYLE_DEFAULTS = {
  preset: {},
  slim: {
    core: { height: 1.04, torsoWidth: 0.82, headScale: 0.96 },
    arms: { thickness: 0.82 },
    legs: { thickness: 0.86 }
  },
  strong: {
    core: { height: 1.04, torsoWidth: 1.18 },
    arms: { thickness: 1.28, spreadDeg: 4 },
    legs: { thickness: 1.18, spreadDeg: 2 }
  },
  heavy: {
    core: { height: 0.98, torsoWidth: 1.42, headScale: 1.03 },
    arms: { thickness: 1.2 },
    legs: { thickness: 1.2 }
  },
  childlike: {
    core: { height: 0.72, torsoWidth: 0.92, headScale: 1.35 },
    arms: { length: 0.86, thickness: 0.9 },
    legs: { length: 0.82, thickness: 0.9 }
  }
}

export const DIRECTOR_STUDIO_BONE_CONTROL_GROUPS = [
  { key: 'head', labelKey: 'directorStudio.bones.head' },
  { key: 'torso', labelKey: 'directorStudio.bones.torso' },
  { key: 'leftShoulder', labelKey: 'directorStudio.bones.leftShoulder' },
  { key: 'leftElbow', labelKey: 'directorStudio.bones.leftElbow' },
  { key: 'rightShoulder', labelKey: 'directorStudio.bones.rightShoulder' },
  { key: 'rightElbow', labelKey: 'directorStudio.bones.rightElbow' },
  { key: 'leftHip', labelKey: 'directorStudio.bones.leftHip' },
  { key: 'leftKnee', labelKey: 'directorStudio.bones.leftKnee' },
  { key: 'rightHip', labelKey: 'directorStudio.bones.rightHip' },
  { key: 'rightKnee', labelKey: 'directorStudio.bones.rightKnee' }
]

export const DIRECTOR_STUDIO_BONE_AXES = [
  { key: 'xDeg', labelKey: 'directorStudio.boneAxes.x' },
  { key: 'yDeg', labelKey: 'directorStudio.boneAxes.y' },
  { key: 'zDeg', labelKey: 'directorStudio.boneAxes.z' }
]

const DEFAULT_BONE_AXIS = { xDeg: 0, yDeg: 0, zDeg: 0 }
const BONE_CONTROL_RANGES = {
  head: { xDeg: [-45, 45], yDeg: [-90, 90], zDeg: [-35, 35] },
  torso: { xDeg: [-55, 55], yDeg: [-90, 90], zDeg: [-55, 55] },
  leftShoulder: { xDeg: [-160, 120], yDeg: [-100, 100], zDeg: [-130, 130] },
  rightShoulder: { xDeg: [-160, 120], yDeg: [-100, 100], zDeg: [-130, 130] },
  leftElbow: { xDeg: [-150, 20], yDeg: [-80, 80], zDeg: [-100, 100] },
  rightElbow: { xDeg: [-150, 20], yDeg: [-80, 80], zDeg: [-100, 100] },
  leftHip: { xDeg: [-130, 100], yDeg: [-70, 70], zDeg: [-80, 80] },
  rightHip: { xDeg: [-130, 100], yDeg: [-70, 70], zDeg: [-80, 80] },
  leftKnee: { xDeg: [-20, 150], yDeg: [-30, 30], zDeg: [-30, 30] },
  rightKnee: { xDeg: [-20, 150], yDeg: [-30, 30], zDeg: [-30, 30] }
}

function defaultBoneControls() {
  return Object.fromEntries(DIRECTOR_STUDIO_BONE_CONTROL_GROUPS.map(group => [group.key, { ...DEFAULT_BONE_AXIS }]))
}

export const DEFAULT_DIRECTOR_STUDIO_BONE_CONTROLS = defaultBoneControls()

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback
}

export function resolveDirectorStudioPresetLabel(presetId) {
  if (!presetId) return ''
  return DIRECTOR_STUDIO_PRESET_LABELS[presetId] ?? ''
}

export function normalizeDirectorStudioBodyControls(controls) {
  const style = controls?.style && STYLE_DEFAULTS[controls.style] ? controls.style : DEFAULT_BODY_CONTROLS.style
  const styleDefaults = STYLE_DEFAULTS[style] ?? STYLE_DEFAULTS.preset
  const core = { ...DEFAULT_BODY_CONTROLS.core, ...styleDefaults.core, ...controls?.core }
  const arms = { ...DEFAULT_BODY_CONTROLS.arms, ...styleDefaults.arms, ...controls?.arms }
  const legs = { ...DEFAULT_BODY_CONTROLS.legs, ...styleDefaults.legs, ...controls?.legs }

  return {
    style,
    showControls: Boolean(controls?.showControls),
    core: {
      height: clampNumber(core.height, DEFAULT_BODY_CONTROLS.core.height, 0.45, 1.8),
      torsoWidth: clampNumber(core.torsoWidth, DEFAULT_BODY_CONTROLS.core.torsoWidth, 0.45, 2.2),
      headScale: clampNumber(core.headScale, DEFAULT_BODY_CONTROLS.core.headScale, 0.55, 1.8),
      torsoLeanDeg: clampNumber(core.torsoLeanDeg, DEFAULT_BODY_CONTROLS.core.torsoLeanDeg, -45, 45)
    },
    arms: {
      length: clampNumber(arms.length, DEFAULT_BODY_CONTROLS.arms.length, 0.45, 1.8),
      thickness: clampNumber(arms.thickness, DEFAULT_BODY_CONTROLS.arms.thickness, 0.45, 2),
      spreadDeg: clampNumber(arms.spreadDeg, DEFAULT_BODY_CONTROLS.arms.spreadDeg, -35, 35)
    },
    legs: {
      length: clampNumber(legs.length, DEFAULT_BODY_CONTROLS.legs.length, 0.45, 1.8),
      thickness: clampNumber(legs.thickness, DEFAULT_BODY_CONTROLS.legs.thickness, 0.45, 2),
      spreadDeg: clampNumber(legs.spreadDeg, DEFAULT_BODY_CONTROLS.legs.spreadDeg, -25, 35)
    }
  }
}

export function normalizeDirectorStudioBoneControls(controls) {
  const source = controls && typeof controls === 'object' && !Array.isArray(controls) ? controls : {}
  const normalized = {}

  for (const group of DIRECTOR_STUDIO_BONE_CONTROL_GROUPS) {
    const key = group.key
    const input = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {}
    const ranges = BONE_CONTROL_RANGES[key] || {}
    normalized[key] = {
      xDeg: clampNumber(input.xDeg, DEFAULT_BONE_AXIS.xDeg, ranges.xDeg?.[0] ?? -180, ranges.xDeg?.[1] ?? 180),
      yDeg: clampNumber(input.yDeg, DEFAULT_BONE_AXIS.yDeg, ranges.yDeg?.[0] ?? -180, ranges.yDeg?.[1] ?? 180),
      zDeg: clampNumber(input.zDeg, DEFAULT_BONE_AXIS.zDeg, ranges.zDeg?.[0] ?? -180, ranges.zDeg?.[1] ?? 180)
    }
  }

  return normalized
}

export function hasMeaningfulDirectorStudioBoneControls(controls) {
  const normalized = normalizeDirectorStudioBoneControls(controls)
  return Object.values(normalized).some(group =>
    Math.abs(group.xDeg) > 0.5 ||
    Math.abs(group.yDeg) > 0.5 ||
    Math.abs(group.zDeg) > 0.5
  )
}

function posePreset(id, name, action, boneControls, bodyControls = {}, relation = '') {
  return {
    id,
    name,
    labelKey: `directorStudio.actionPoses.${id}`,
    action,
    relation,
    bodyControls,
    boneControls: normalizeDirectorStudioBoneControls(boneControls)
  }
}

export const DIRECTOR_STUDIO_ACTION_POSE_PRESETS = [
  posePreset('stand', '站立', '站立', {}),
  posePreset('sit', '坐姿', '坐姿', {
    leftHip: { xDeg: -88 },
    rightHip: { xDeg: -88 },
    leftKnee: { xDeg: 92 },
    rightKnee: { xDeg: 92 },
    torso: { xDeg: -4 }
  }),
  posePreset('walk', '走路', '走路', {
    leftHip: { xDeg: -28 },
    rightHip: { xDeg: 18 },
    leftKnee: { xDeg: 24 },
    leftShoulder: { xDeg: 18 },
    rightShoulder: { xDeg: -24 }
  }),
  posePreset('run', '奔跑', '奔跑', {
    leftHip: { xDeg: -56 },
    rightHip: { xDeg: 32 },
    leftKnee: { xDeg: 75 },
    rightShoulder: { xDeg: -52 },
    rightElbow: { xDeg: -58 },
    leftShoulder: { xDeg: 42 },
    torso: { xDeg: -12 }
  }),
  posePreset('wave', '挥手', '挥手', {
    rightShoulder: { xDeg: -118, yDeg: 12, zDeg: -18 },
    rightElbow: { xDeg: -42 },
    head: { yDeg: 10 }
  }),
  posePreset('point', '指向', '指向', {
    rightShoulder: { xDeg: -92, yDeg: 8, zDeg: -8 },
    rightElbow: { xDeg: -8 },
    head: { yDeg: 12 }
  }),
  posePreset('look-back', '回头', '回头', {
    head: { yDeg: 70 },
    torso: { yDeg: 22 }
  }),
  posePreset('bend', '弯腰', '弯腰', {
    torso: { xDeg: -34 },
    leftShoulder: { xDeg: -18 },
    rightShoulder: { xDeg: -18 }
  }),
  posePreset('squat', '蹲下', '蹲下', {
    leftHip: { xDeg: -92 },
    rightHip: { xDeg: -92 },
    leftKnee: { xDeg: 112 },
    rightKnee: { xDeg: 112 },
    torso: { xDeg: -18 }
  }),
  posePreset('lie', '躺下', '躺下', {
    torso: { xDeg: -90 }
  }),
  posePreset('fold-arms', '抱臂', '抱臂', {
    leftShoulder: { xDeg: -62, yDeg: 32, zDeg: 18 },
    rightShoulder: { xDeg: -62, yDeg: -32, zDeg: -18 },
    leftElbow: { xDeg: -92, zDeg: -28 },
    rightElbow: { xDeg: -92, zDeg: 28 }
  })
]

function interactionPreset(id, name, relation, secondaryOffset, primary, secondary) {
  return {
    id,
    name,
    labelKey: `directorStudio.interactionPoses.${id}`,
    relation,
    secondaryOffset,
    primary,
    secondary
  }
}

export const DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS = [
  interactionPreset(
    'face-to-face-dialogue',
    '面对面对话',
    '面对面对话',
    { x: 0, z: -1.25 },
    { action: '对话', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -46, yDeg: 8 }, rightElbow: { xDeg: -70 }, head: { yDeg: 8 } }) },
    { action: '倾听回应', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -32, yDeg: -8 }, leftElbow: { xDeg: -52 }, head: { yDeg: -8 } }) }
  ),
  interactionPreset(
    'side-dialogue',
    '并肩对话',
    '并肩对话',
    { x: 0.95, z: 0 },
    { action: '侧身交谈', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -34, zDeg: -10 }, head: { yDeg: 18 } }) },
    { action: '侧身回应', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -34, zDeg: 10 }, head: { yDeg: -18 } }) }
  ),
  interactionPreset(
    'handshake',
    '握手',
    '握手互动',
    { x: 0, z: -1.05 },
    { action: '伸手握手', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -88, yDeg: 6 }, rightElbow: { xDeg: -18 } }) },
    { action: '伸手握手', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -88, yDeg: -6 }, rightElbow: { xDeg: -18 } }) }
  ),
  interactionPreset(
    'pass-object',
    '递物',
    '递接物品',
    { x: 0, z: -1.15 },
    { action: '递出物品', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -96 }, rightElbow: { xDeg: -8 }, torso: { xDeg: -6 } }) },
    { action: '接过物品', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -92 }, leftElbow: { xDeg: -18 }, torso: { xDeg: -4 } }) }
  ),
  interactionPreset(
    'hug',
    '拥抱',
    '拥抱互动',
    { x: 0, z: -0.72 },
    { action: '拥抱', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -82, zDeg: 22 }, rightShoulder: { xDeg: -82, zDeg: -22 }, leftElbow: { xDeg: -72 }, rightElbow: { xDeg: -72 } }) },
    { action: '拥抱回应', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -78, zDeg: 18 }, rightShoulder: { xDeg: -78, zDeg: -18 }, leftElbow: { xDeg: -70 }, rightElbow: { xDeg: -70 } }) }
  ),
  interactionPreset(
    'confrontation',
    '争执对峙',
    '争执对峙',
    { x: 0, z: -1.35 },
    { action: '争执指向', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -92, zDeg: -10 }, rightElbow: { xDeg: -8 }, torso: { xDeg: -6 } }) },
    { action: '防御后退', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -54, zDeg: 16 }, rightShoulder: { xDeg: -46, zDeg: -16 }, torso: { xDeg: 8 } }) }
  ),
  interactionPreset(
    'support',
    '搀扶',
    '一人搀扶另一人',
    { x: 0.68, z: -0.42 },
    { action: '搀扶', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -72, yDeg: 18 }, rightElbow: { xDeg: -48 }, torso: { zDeg: -8 } }) },
    { action: '被搀扶', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -42 }, torso: { xDeg: -10, zDeg: 8 } }) }
  ),
  interactionPreset(
    'shared-look',
    '共同看向',
    '两人看同一方向',
    { x: 0.9, z: 0 },
    { action: '看向同一方向', boneControls: normalizeDirectorStudioBoneControls({ head: { yDeg: 24 }, rightShoulder: { xDeg: -82 }, rightElbow: { xDeg: -10 } }) },
    { action: '看向同一方向', boneControls: normalizeDirectorStudioBoneControls({ head: { yDeg: 24 } }) }
  ),
  interactionPreset(
    'interview',
    '采访问答',
    '采访/问答',
    { x: 0, z: -1.25 },
    { action: '采访提问', boneControls: normalizeDirectorStudioBoneControls({ rightShoulder: { xDeg: -86 }, rightElbow: { xDeg: -26 }, head: { yDeg: 8 } }) },
    { action: '回答问题', boneControls: normalizeDirectorStudioBoneControls({ leftShoulder: { xDeg: -28 }, rightShoulder: { xDeg: -32 }, head: { yDeg: -8 } }) }
  )
]

export function resolveDirectorStudioActionPosePreset(id) {
  return DIRECTOR_STUDIO_ACTION_POSE_PRESETS.find(preset => preset.id === id) || null
}

export function resolveDirectorStudioInteractionPosePreset(id) {
  return DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS.find(preset => preset.id === id) || null
}

export function hasMeaningfulDirectorStudioBodyControls(controls) {
  if (!controls) return false
  const normalized = normalizeDirectorStudioBodyControls(controls)
  return normalized.style !== 'preset' ||
    Math.abs(normalized.core.height - 1) > 0.01 ||
    Math.abs(normalized.core.torsoWidth - 1) > 0.01 ||
    Math.abs(normalized.core.headScale - 1) > 0.01 ||
    Math.abs(normalized.core.torsoLeanDeg) > 0.5 ||
    Math.abs(normalized.arms.length - 1) > 0.01 ||
    Math.abs(normalized.arms.thickness - 1) > 0.01 ||
    Math.abs(normalized.arms.spreadDeg) > 0.5 ||
    Math.abs(normalized.legs.length - 1) > 0.01 ||
    Math.abs(normalized.legs.thickness - 1) > 0.01 ||
    Math.abs(normalized.legs.spreadDeg) > 0.5
}

export function describeDirectorStudioBodyControls(controls) {
  if (!hasMeaningfulDirectorStudioBodyControls(controls)) return ''
  const normalized = normalizeDirectorStudioBodyControls(controls)
  return [
    `body style ${normalized.style}`,
    `core height ${normalized.core.height.toFixed(2)}x`,
    `torso width ${normalized.core.torsoWidth.toFixed(2)}x`,
    `head scale ${normalized.core.headScale.toFixed(2)}x`,
    `torso lean ${Math.round(normalized.core.torsoLeanDeg)} deg`,
    `arms length ${normalized.arms.length.toFixed(2)}x / thickness ${normalized.arms.thickness.toFixed(2)}x / spread ${Math.round(normalized.arms.spreadDeg)} deg`,
    `legs length ${normalized.legs.length.toFixed(2)}x / thickness ${normalized.legs.thickness.toFixed(2)}x / spread ${Math.round(normalized.legs.spreadDeg)} deg`
  ].join(', ')
}

export function describeDirectorStudioBoneControls(controls) {
  if (!hasMeaningfulDirectorStudioBoneControls(controls)) return ''
  const normalized = normalizeDirectorStudioBoneControls(controls)
  return Object.entries(normalized)
    .filter(([, value]) => Math.abs(value.xDeg) > 0.5 || Math.abs(value.yDeg) > 0.5 || Math.abs(value.zDeg) > 0.5)
    .map(([key, value]) => `${key} (${Math.round(value.xDeg)} deg x, ${Math.round(value.yDeg)} deg y, ${Math.round(value.zDeg)} deg z)`)
    .join(', ')
}
