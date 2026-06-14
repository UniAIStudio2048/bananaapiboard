import {
  describeDirectorStudioBodyControls,
  resolveDirectorStudioPresetLabel
} from '../config/canvas/directorStudioPresetCatalog.js'

const RAD_TO_DEG = 180 / Math.PI

function getString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasMeaningfulScale(item) {
  const scale = item?.scale3d
  if (!scale) return false
  return Math.abs(Number(scale.x) - 1) > 0.01 ||
    Math.abs(Number(scale.y) - 1) > 0.01 ||
    Math.abs(Number(scale.z) - 1) > 0.01
}

function hasMeaningfulRotation(item) {
  const rotation = item?.rotation3d
  if (!rotation) return false
  return Math.abs(Number(rotation.x)) > 0.01 ||
    Math.abs(Number(rotation.y)) > 0.01 ||
    Math.abs(Number(rotation.z)) > 0.01
}

function formatNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function describeTransform(item) {
  const parts = []
  if (hasMeaningfulRotation(item)) {
    parts.push(
      `rotation xyz (${Math.round(formatNumber(item.rotation3d.x) * RAD_TO_DEG)} deg, ${Math.round(formatNumber(item.rotation3d.y) * RAD_TO_DEG)} deg, ${Math.round(formatNumber(item.rotation3d.z) * RAD_TO_DEG)} deg)`
    )
  }
  if (hasMeaningfulScale(item)) {
    parts.push(
      `scale xyz (${formatNumber(item.scale3d.x, 1).toFixed(2)}, ${formatNumber(item.scale3d.y, 1).toFixed(2)}, ${formatNumber(item.scale3d.z, 1).toFixed(2)})`
    )
  }
  return parts.length > 0 ? `, transform: ${parts.join(', ')}` : ''
}

function describeRelationAndNote(item, noteLabel = 'note') {
  const parts = []
  const relation = getString(item?.relation)
  const note = getString(item?.note)
  if (relation) parts.push(`relation / interaction: ${relation}`)
  if (note) parts.push(`${noteLabel}: ${note}`)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

function buildReferenceTokenMaps(config, referenceTokenForIndex) {
  const referenceTokenByUrl = new Map()
  const referenceTokenByLabel = new Map()

  for (const [index, reference] of (config.referenceImages || []).entries()) {
    const token = referenceTokenForIndex(index)
    const url = getString(reference?.url)
    const label = getString(reference?.label)
    if (url) referenceTokenByUrl.set(url, token)
    if (label) referenceTokenByLabel.set(label, token)
  }

  return { referenceTokenByUrl, referenceTokenByLabel }
}

function resolveItemReference(item, referenceTokenByUrl, referenceTokenByLabel, purpose) {
  const refImageUrl = getString(item?.refImageUrl)
  const refImageName = getString(item?.refImageName)
  const refToken = refImageUrl
    ? referenceTokenByUrl.get(refImageUrl)
    : refImageName
      ? referenceTokenByLabel.get(refImageName)
      : ''

  if (refToken) return `, use reference image ${refToken} for ${purpose}`
  if (refImageName) return `, use reference image named "${refImageName}" for ${purpose}`
  return ''
}

function describePosition(item, mode) {
  const p = item?.pos3d || { x: 0, y: 0, z: 0 }
  const x = formatNumber(p.x)
  const y = formatNumber(p.y)
  const z = formatNumber(p.z)

  if (mode === 'panorama') {
    const yaw = Math.round(Math.atan2(x, -z) * RAD_TO_DEG)
    const pitch = Math.round(Math.atan2(y, Math.hypot(x, z) || 1) * RAD_TO_DEG)
    return `at yaw ${yaw} deg, pitch ${pitch} deg`
  }

  return `at floor position (x ${x.toFixed(1)}m, depth-from-camera ${(-z).toFixed(1)}m${y > 0.05 ? `, elevated ${y.toFixed(1)}m` : ''})`
}

export function dedupeDirectorReferenceUrls(urls) {
  const seen = new Set()
  const result = []

  for (const value of urls || []) {
    const url = getString(value)
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }

  return result
}

export function buildDirectorStudioPrompt(config = {}) {
  const mode = config.mode === 'panorama' ? 'panorama' : 'flat'
  const referenceTokenPrefix = config.referenceTokenPrefix ?? '图'
  const referenceTokenStartIndex = Number.isFinite(Number(config.referenceTokenStartIndex))
    ? Number(config.referenceTokenStartIndex)
    : 1
  const referenceTokenForIndex = index => `@${referenceTokenPrefix}${referenceTokenStartIndex + index}`
  const { referenceTokenByUrl, referenceTokenByLabel } = buildReferenceTokenMaps(config, referenceTokenForIndex)

  const modeInstructions = mode === 'panorama'
    ? [
      'this is a Director Studio spatial-layout guided image generation on a 360-degree panorama environment',
      'use the panorama as the surrounding world and keep its overall style, lighting, and perspective',
      'place the subjects described below at the indicated spherical viewer positions'
    ].join(', ')
    : [
      'this is a Director Studio spatial-layout guided image generation driven by a 3D staging floor plan',
      'each colored marker represents the ground position (and optional height) of a subject relative to the viewer camera',
      'render a single final photo whose composition respects those relative positions (who is left / right / closer to camera / farther from camera / higher / lower)',
      'camera reference: x<0 is screen-left, x>0 is screen-right, positive depth-from-camera means farther away from the viewer, y is height above the floor'
    ].join(', ')

  const referenceImages = (config.referenceImages || []).length > 0
    ? `available identity references: ${(config.referenceImages || [])
      .map((reference, index) => {
        const label = getString(reference?.label) || `reference ${index + 1}`
        const color = getString(reference?.color)
        return `${referenceTokenForIndex(index)}: image reference named "${label}"${color ? `, director marker color ${color}` : ''}`
      })
      .join('; ')}`
    : ''

  const items = Array.isArray(config.items) ? config.items : []
  const sceneItems = items.filter(item => item?.category === 'scene')
  const placedItems = items.filter(item => item?.category !== 'scene')

  const placements = placedItems.length > 0
    ? `subjects to place: ${placedItems.map((item, index) => {
      const kind = item?.category === 'person' ? 'person' : item?.category === 'object' ? 'object' : 'subject'
      const label = getString(item?.label) || getString(item?.id) || `item ${index + 1}`
      const ref = resolveItemReference(item, referenceTokenByUrl, referenceTokenByLabel, 'identity / appearance / material consistency')
      const color = getString(item?.color) ? `, director marker color ${getString(item.color)}` : ''
      const presetLabel = resolveDirectorStudioPresetLabel(item?.presetId)
      const preset = presetLabel ? `, visual type / model preset: ${presetLabel}` : ''
      const action = item?.category === 'person' && getString(item?.action)
        ? `, action / pose: ${getString(item.action)}`
        : ''
      const body = item?.category === 'person' ? describeDirectorStudioBodyControls(item?.bodyControls) : ''
      const bodyDescription = body ? `, body controls: ${body}` : ''
      const transform = describeTransform(item)
      const rel = describeRelationAndNote(item)
      return `${index + 1}. ${kind} "${label}"${ref}${color}${preset}${action}${bodyDescription} - ${describePosition(item, mode)}${transform}${rel}`
    }).join('; ')}`
    : ''

  const sceneReferences = sceneItems.length > 0
    ? `scene / environment references: ${sceneItems.map(item => {
      const label = getString(item?.label) || getString(item?.id) || 'scene'
      const ref = resolveItemReference(item, referenceTokenByUrl, referenceTokenByLabel, 'scene / environment reference')
      const presetLabel = resolveDirectorStudioPresetLabel(item?.presetId)
      const preset = presetLabel ? `, scene type: ${presetLabel}` : ''
      const transform = describeTransform(item)
      const rel = describeRelationAndNote(item, 'scene note')
      return `"${label}"${ref}${preset}${transform}${rel}`
    }).join(', ')}`
    : ''

  return [
    modeInstructions,
    referenceImages,
    placements,
    sceneReferences,
    config.basePrompt?.trim() || '',
    'Use the Director Studio screenshot as the primary composition reference. Keep positions, camera framing, relative scale, and lighting intent consistent.'
  ].filter(Boolean).join('\n\n')
}
