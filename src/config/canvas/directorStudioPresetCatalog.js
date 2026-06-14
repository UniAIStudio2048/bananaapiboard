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

export function hasMeaningfulDirectorStudioBodyControls(controls) {
  if (!controls) return false
  const normalized = normalizeDirectorStudioBodyControls(controls)
  return normalized.style !== 'preset' ||
    normalized.showControls ||
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
