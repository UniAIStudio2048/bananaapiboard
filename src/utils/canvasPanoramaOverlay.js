export const OVERLAY_TYPE_LABELS = {
  person: '人物',
  object: '物品'
}

export function getNextOverlayLabel(overlays = [], type = 'person') {
  const prefix = OVERLAY_TYPE_LABELS[type] || OVERLAY_TYPE_LABELS.person
  const usedNumbers = new Set(
    overlays
      .map(item => String(item.label || '').match(new RegExp(`^${prefix}(\\d+)$`))?.[1])
      .filter(Boolean)
      .map(Number)
  )
  let next = 1
  while (usedNumbers.has(next)) next += 1
  return `${prefix}${next}`
}

export function clampOverlayPosition(position) {
  return {
    x: Math.max(0, Math.min(1, Number(position?.x) || 0)),
    y: Math.max(0, Math.min(1, Number(position?.y) || 0))
  }
}

export function createDefaultOverlay({
  source,
  type = 'person',
  url,
  originalName = '',
  existingOverlays = [],
  naturalWidth = 512,
  naturalHeight = 512
}) {
  return {
    id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    type,
    label: getNextOverlayLabel(existingOverlays, type),
    url,
    originalName,
    x: 0.5,
    y: 0.5,
    scale: 1,
    flipped: false,
    visible: true,
    zIndex: existingOverlays.length + 1,
    naturalWidth,
    naturalHeight
  }
}

export function normalizeOverlayStack(overlays = []) {
  return overlays.map((item, index) => ({
    ...item,
    zIndex: index + 1
  }))
}

export function moveOverlayInStack(overlays = [], id, directionOrTargetIndex) {
  const next = overlays.slice()
  const currentIndex = next.findIndex(item => item.id === id)
  if (currentIndex < 0) return normalizeOverlayStack(next)

  let targetIndex
  if (directionOrTargetIndex === 'up') {
    targetIndex = Math.min(next.length - 1, currentIndex + 1)
  } else if (directionOrTargetIndex === 'down') {
    targetIndex = Math.max(0, currentIndex - 1)
  } else {
    targetIndex = Math.max(0, Math.min(next.length - 1, Number(directionOrTargetIndex)))
  }

  if (targetIndex === currentIndex) return normalizeOverlayStack(next)
  const [item] = next.splice(currentIndex, 1)
  next.splice(targetIndex, 0, item)
  return normalizeOverlayStack(next)
}

export function sortVisibleOverlays(overlays = []) {
  return overlays
    .filter(item => item.visible !== false && item.url)
    .slice()
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
}

export function getOverlayExportRect({
  overlay,
  outputWidth,
  outputHeight,
  baseHeightRatio = 0.42
}) {
  const naturalWidth = Math.max(1, Number(overlay.naturalWidth) || 1)
  const naturalHeight = Math.max(1, Number(overlay.naturalHeight) || 1)
  const scale = Math.max(0.05, Number(overlay.scale) || 1)
  const height = Math.round(outputHeight * baseHeightRatio * scale)
  const width = Math.round(height * (naturalWidth / naturalHeight))
  const left = Math.round(outputWidth * overlay.x - width / 2)
  const top = Math.round(outputHeight * overlay.y - height / 2)
  return { width, height, left, top }
}

export function mapHistoryToOverlaySources(historyResult) {
  const items = Array.isArray(historyResult)
    ? historyResult
    : (Array.isArray(historyResult?.history) ? historyResult.history : [])

  return items.map(item => ({
    id: item.id,
    name: item.name || item.prompt || '历史图片',
    url: item.url,
    thumbnailUrl: item.thumbnail_url || item.url,
    type: 'object',
    source: 'history'
  })).filter(item => item.url)
}

function createSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function personPreset(index, name, fill, stroke, bodyPath, head = '<circle cx="160" cy="72" r="44"/>') {
  return {
    id: `person-silhouette-${index}`,
    name,
    type: 'person',
    source: 'preset',
    url: createSvgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="720" viewBox="0 0 320 720"><g fill="${fill}" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${head}${bodyPath}</g></svg>`)
  }
}

function objectPreset(index, name, svgBody) {
  return {
    id: `object-preset-${index}`,
    name,
    type: 'object',
    source: 'preset',
    url: createSvgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="420" viewBox="0 0 520 420">${svgBody}</svg>`)
  }
}

export function createPanoramaOverlayPresets() {
  return {
    people: [
      personPreset(1, '人物假人1', '#ffffff', '#111827', '<path d="M116 142h88l32 196h-58v320h-36V338H84z"/>', '<circle cx="160" cy="76" r="48"/>'),
      personPreset(2, '人物假人2', '#dbeafe', '#1e3a8a', '<path d="M130 132h60l70 200-46 16-28-76v386h-38V272l-28 76-46-16z"/>'),
      personPreset(3, '人物假人3', '#fee2e2', '#991b1b', '<path d="M112 142h96l48 150-42 26-28-80-12 420h-28l-12-420-28 80-42-26z"/>'),
      personPreset(4, '人物假人4', '#dcfce7', '#166534', '<path d="M100 150h120l-22 214h42l-40 294h-34l-6-248-28 248H98l22-294H82z"/>'),
      personPreset(5, '人物假人5', '#fef3c7', '#92400e', '<path d="M126 132h68l34 146h-46l38 380h-36l-24-206-24 206h-36l38-380H92z"/>', '<ellipse cx="160" cy="76" rx="42" ry="52"/>'),
      personPreset(6, '人物假人6', '#ede9fe', '#5b21b6', '<path d="M118 138h84l28 108 52 88-42 28-44-72-18 368h-36l-18-368-44 72-42-28 52-88z"/>'),
      personPreset(7, '人物假人7', '#cffafe', '#155e75', '<path d="M104 140h112l-10 190h34l-22 328h-42l-16-238-16 238h-42L80 330h34z"/>', '<path d="M116 76c0-30 20-52 44-52s44 22 44 52-20 52-44 52-44-22-44-52z"/>'),
      personPreset(8, '人物假人8', '#fce7f3', '#9d174d', '<path d="M122 136h76l86 182-44 22-50-88 26 406h-42l-14-190-34 190H82l50-406-50 88-44-22z"/>')
    ],
    objects: [
      objectPreset(1, '方形物品', '<rect x="72" y="70" width="376" height="280" rx="28" fill="#f8fafc" stroke="#0f172a" stroke-width="12"/>'),
      objectPreset(2, '圆形物品', '<circle cx="260" cy="210" r="136" fill="#dbeafe" stroke="#1d4ed8" stroke-width="14"/>'),
      objectPreset(3, '三角物品', '<path d="M260 54l178 306H82z" fill="#fee2e2" stroke="#b91c1c" stroke-width="14" stroke-linejoin="round"/>'),
      objectPreset(4, '菱形物品', '<path d="M260 42l188 168-188 168L72 210z" fill="#dcfce7" stroke="#15803d" stroke-width="14" stroke-linejoin="round"/>'),
      objectPreset(5, '星形物品', '<path d="M260 42l42 116 124 4-98 76 34 120-102-70-102 70 34-120-98-76 124-4z" fill="#fef3c7" stroke="#a16207" stroke-width="12" stroke-linejoin="round"/>'),
      objectPreset(6, '瓶形物品', '<path d="M214 48h92v72l46 68v152c0 26-22 48-48 48h-88c-26 0-48-22-48-48V188l46-68z" fill="#ccfbf1" stroke="#0f766e" stroke-width="12" stroke-linejoin="round"/>'),
      objectPreset(7, '屏幕物品', '<rect x="72" y="72" width="376" height="236" rx="18" fill="#e0e7ff" stroke="#3730a3" stroke-width="12"/><path d="M210 348h100M260 310v38" stroke="#3730a3" stroke-width="16" stroke-linecap="round"/>'),
      objectPreset(8, '柱形物品', '<ellipse cx="260" cy="92" rx="132" ry="48" fill="#fae8ff" stroke="#86198f" stroke-width="12"/><path d="M128 92v228c0 26 59 48 132 48s132-22 132-48V92" fill="#fae8ff" stroke="#86198f" stroke-width="12"/>'),
      objectPreset(9, '云形物品', '<path d="M170 312h188c52 0 92-38 92-84s-38-82-86-84c-22-54-74-86-132-76-46 8-82 42-96 86-42 4-76 38-76 80 0 44 38 78 110 78z" fill="#e0f2fe" stroke="#0369a1" stroke-width="12" stroke-linejoin="round"/>'),
      objectPreset(10, '宝箱物品', '<path d="M90 184h340v174H90z" fill="#fed7aa" stroke="#9a3412" stroke-width="12"/><path d="M118 184c8-78 66-122 142-122s134 44 142 122z" fill="#ffedd5" stroke="#9a3412" stroke-width="12"/><path d="M260 184v174M90 238h340" stroke="#9a3412" stroke-width="12"/>')
    ]
  }
}
