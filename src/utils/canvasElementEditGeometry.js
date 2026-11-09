// 元素编辑：几何工具与结构化编辑提示词。
// 所有坐标都以图片显示区域为基准归一化到 [0, 1]，原点在左上角。

export const ELEMENT_EDIT_LIMITS = Object.freeze({
  maxCount: 10,
  brushMin: 1,
  brushMax: 10,
  brushDefault: 3,
  minBoxPx: 12
})

export const ELEMENT_EDIT_MOVE_INSTRUCTION = 'Move the selected content without duplicating it or leaving a ghost. Preserve its appearance.'

export function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function clampPoint(point) {
  return { x: clamp01(point?.x), y: clamp01(point?.y) }
}

export function clampRect(rect) {
  const x = clamp01(rect?.x)
  const y = clamp01(rect?.y)
  return {
    x,
    y,
    width: Math.max(0, Math.min(1 - x, Number(rect?.width) || 0)),
    height: Math.max(0, Math.min(1 - y, Number(rect?.height) || 0))
  }
}

export function rectFromPoints(a, b) {
  const start = clampPoint(a)
  const end = clampPoint(b)
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  }
}

export function translateRect(rect, dx, dy) {
  return {
    ...rect,
    x: Math.min(1 - rect.width, Math.max(0, rect.x + dx)),
    y: Math.min(1 - rect.height, Math.max(0, rect.y + dy))
  }
}

export function centerRectAt(rect, center) {
  return translateRect(rect, center.x - (rect.x + rect.width / 2), center.y - (rect.y + rect.height / 2))
}

// 以对角为锚点缩放矩形，corner 为 nw/ne/sw/se。
export function resizeRect(rect, point, corner, min = { width: 0, height: 0 }) {
  const west = corner.endsWith('w')
  const north = corner.startsWith('n')
  const anchorX = west ? rect.x + rect.width : rect.x
  const anchorY = north ? rect.y + rect.height : rect.y
  const minW = clamp01(min.width)
  const minH = clamp01(min.height)
  const px = clamp01(point.x)
  const py = clamp01(point.y)
  const nextX = west ? Math.max(0, Math.min(anchorX - minW, px)) : Math.min(1, Math.max(anchorX + minW, px))
  const nextY = north ? Math.max(0, Math.min(anchorY - minH, py)) : Math.min(1, Math.max(anchorY + minH, py))
  return clampRect({
    x: Math.min(anchorX, nextX),
    y: Math.min(anchorY, nextY),
    width: Math.abs(nextX - anchorX),
    height: Math.abs(nextY - anchorY)
  })
}

// object-fit: contain 时图片在显示框中的实际区域（像素）。
export function containRect(box, natural) {
  if (!(box?.width > 0 && box?.height > 0 && natural?.width > 0 && natural?.height > 0)) {
    return { left: 0, top: 0, width: Math.max(0, box?.width || 0), height: Math.max(0, box?.height || 0) }
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height)
  const width = natural.width * scale
  const height = natural.height * scale
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height }
}

export function closeStroke(points) {
  if (!Array.isArray(points) || points.length < 3) return points
  const first = points[0]
  const last = points.at(-1)
  return first.x !== last.x || first.y !== last.y ? [...points, { ...first }] : points
}

// 画笔笔迹的外接框（含笔宽），brushSize 为相对于图片短边的比例。
export function brushBounds(strokes, brushSize, media) {
  const points = (strokes || []).flat()
  if (!points.length || !(media?.width > 0) || !(media?.height > 0)) return null
  const radius = brushSize * Math.min(media.width, media.height) / 2
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    const x = point.x * media.width
    const y = point.y * media.height
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const x1 = Math.max(0, (minX - radius) / media.width)
  const y1 = Math.max(0, (minY - radius) / media.height)
  const x2 = Math.min(1, (maxX + radius) / media.width)
  const y2 = Math.min(1, (maxY + radius) / media.height)
  let area = Math.PI * radius * radius
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      area += Math.hypot((stroke[index].x - stroke[index - 1].x) * media.width, (stroke[index].y - stroke[index - 1].y) * media.height) * radius * 2
    }
  }
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    areaRatio: Math.min((x2 - x1) * (y2 - y1), area / (media.width * media.height))
  }
}

// 笔迹点本身的外接框（不含笔宽），用于提示词。
export function strokesBounds(strokes) {
  const points = (strokes || []).flat()
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = points.map(point => clamp01(point.x))
  const ys = points.map(point => clamp01(point.y))
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(0, Math.max(...xs) - x), height: Math.max(0, Math.max(...ys) - y) }
}

export function sourceBounds(source, media = { width: 1000, height: 1000 }) {
  if (!source) return null
  if (source.type === 'box') return clampRect(source.rect)
  if (source.type === 'point') return source.bbox ? clampRect(source.bbox) : null
  const bounds = brushBounds(source.strokes, source.brushSize, media)
  return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null
}

function promptBounds(source) {
  if (source.type === 'point') return source.bbox
  if (source.type === 'box') return source.rect
  return strokesBounds(source.strokes)
}

export function boxLargeEnough(rect, mediaPx) {
  return rect.width * mediaPx.width >= ELEMENT_EDIT_LIMITS.minBoxPx && rect.height * mediaPx.height >= ELEMENT_EDIT_LIMITS.minBoxPx
}

// 识别服务返回的候选框：数组为 0-1000 的 [x1, y1, x2, y2]，对象为 0-1 的 {x, y, width, height}。
export function normalizeCandidateBox(box) {
  let rect = null
  if (Array.isArray(box) && box.length >= 4) {
    const [x1, y1, x2, y2] = box.map(Number)
    const scale = [x1, y1, x2, y2].some(value => value > 1) ? 1000 : 1
    rect = { x: Math.min(x1, x2) / scale, y: Math.min(y1, y2) / scale, width: Math.abs(x2 - x1) / scale, height: Math.abs(y2 - y1) / scale }
  } else if (box && typeof box === 'object') {
    rect = { x: Number(box.x), y: Number(box.y), width: Number(box.width ?? box.w), height: Number(box.height ?? box.h) }
  }
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null
  const clamped = clampRect(rect)
  return clamped.width > 0.01 && clamped.height > 0.01 ? clamped : null
}

function selectionTooSmall(edit, media) {
  const source = edit.source
  if (source.type === 'point') return false
  const bounds = source.type === 'box' ? clampRect(source.rect) : brushBounds(source.strokes, source.brushSize, media)
  if (!bounds) return true
  const shortSide = Math.min(media.width, media.height)
  const minSide = Math.min(bounds.width * media.width, bounds.height * media.height)
  const areaRatio = bounds.areaRatio ?? bounds.width * bounds.height
  return minSide < Math.max(12, 0.012 * shortSide) || areaRatio < 4e-4
}

export function validateElementEdits(edits, media) {
  if (!edits?.length) return { valid: false, reason: 'empty' }
  if (edits.some(edit => edit.action === 'modify' && !edit.prompt?.trim())) return { valid: false, reason: 'promptRequired' }
  if (edits.some(edit => edit.action === 'move' && !edit.target)) return { valid: false, reason: 'targetRequired' }
  if (edits.some(edit => selectionTooSmall(edit, media))) return { valid: false, reason: 'geometry' }
  return { valid: true }
}

function percent(value) {
  return (clamp01(value) * 100).toFixed(1)
}

function pointPercent(point) {
  return `[${percent(point.x)}, ${percent(point.y)}]`
}

function rectPercent(rect) {
  return `[${percent(rect.x)}, ${percent(rect.y)}, ${percent(rect.x + rect.width)}, ${percent(rect.y + rect.height)}]`
}

// 闭合路径最多 32 条、总计约 64 个点，均匀抽样后闭合。
function closedPathsPercent(strokes) {
  const paths = strokes
    .map(stroke => stroke.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
    .filter(stroke => stroke.length > 0)
    .slice(0, 32)
  let budget = 64
  const sampled = paths.map((stroke, index) => {
    const first = stroke[0]
    const last = stroke.at(-1)
    const open = stroke.length > 1 && first.x === last.x && first.y === last.y ? stroke.slice(0, -1) : stroke
    const limit = Math.max(1, Math.max(2, Math.floor(budget / (paths.length - index))) - 1)
    const picked = open.length <= limit
      ? open
      : limit <= 1
        ? [open[0]]
        : Array.from({ length: limit }, (_, i) => open[Math.round(i * (open.length - 1) / (limit - 1))])
    const closed = [...picked, picked[0]]
    budget -= closed.length
    return closed
  })
  return `[${sampled.map(path => `[${path.map(pointPercent).join(', ')}]`).join(', ')}]`
}

// 结构化编辑提示词：Image 1 为原图，参考图按出现顺序编号为 Image 2、3...
export function buildElementEditPrompt(edits, referenceIndex = new Map(), includePaths = true) {
  const blocks = edits.map((edit, index) => {
    const lines = [`EDIT ${index + 1} ${String(edit.action).toUpperCase()}`]
    const source = edit.source
    if (source.type === 'point') {
      lines.push('selection_type=point')
      lines.push(`subject=${JSON.stringify(source.subjectName)}`)
      lines.push(`bbox_percent=${rectPercent(source.bbox)}`)
    } else if (source.type === 'box') {
      lines.push('selection_type=box')
      lines.push(`bbox_percent=${rectPercent(source.rect)}`)
    } else {
      lines.push('selection_type=brush')
      lines.push(`bbox_percent=${rectPercent(strokesBounds(source.strokes))}`)
      lines.push(`brush_width_percent=${(100 * Math.max(0, source.brushSize)).toFixed(1)}`)
      lines.push(includePaths ? `closed_paths_percent=${closedPathsPercent(source.strokes)}` : 'selection_approximation=bbox')
    }
    if (edit.action === 'move') {
      const from = promptBounds(source)
      lines.push(`source_bbox_percent=${rectPercent(from)}`)
      if (edit.target) lines.push(`target_center_percent=${pointPercent(edit.target)}`)
      const resized = !!edit.targetRect && (Math.abs(edit.targetRect.width - from.width) > 1e-4 || Math.abs(edit.targetRect.height - from.height) > 1e-4)
      if (resized) lines.push(`target_bbox_percent=${rectPercent(edit.targetRect)}`)
      const instruction = [ELEMENT_EDIT_MOVE_INSTRUCTION, resized ? 'Scale the moved content to match the target bounding box dimensions.' : 'Preserve its size.']
      lines.push(`instruction=${JSON.stringify(instruction.join(' '))}`)
      if (edit.prompt?.trim()) lines.push(`additional_instruction=${JSON.stringify(edit.prompt)}`)
    } else {
      lines.push(`instruction=${JSON.stringify(edit.prompt ?? '')}`)
    }
    const imageIndex = edit.referenceImage ? referenceIndex.get(edit.referenceImage.url) : undefined
    if (imageIndex != null) {
      lines.push(`reference_image=Image ${imageIndex}`)
      if (edit.referenceImage?.name) lines.push(`reference_name=${JSON.stringify(edit.referenceImage.name)}`)
    }
    return lines.join('\n')
  })
  return [
    'Edit Image 1 only. Apply the following edits in order.',
    'Preserve all unmentioned content, identities, composition, lighting and style.',
    '',
    ...blocks.flatMap((block, index) => index === blocks.length - 1 ? [block] : [block, ''])
  ].join('\n')
}

// 原图 + 去重后的参考图，返回图片列表、编号映射与提示词（超长时去掉画笔路径）。
export function buildElementEditRequest(edits, sourceUrl, { maxInputImages = Infinity, promptMaxLength = null } = {}) {
  const images = [sourceUrl]
  const referenceIndex = new Map([[sourceUrl, 1]])
  for (const edit of edits) {
    const reference = edit.referenceImage
    if (!reference?.url || referenceIndex.has(reference.url)) continue
    images.push(reference.url)
    referenceIndex.set(reference.url, images.length)
  }
  if (images.length > maxInputImages) throw new Error('参考图数量超过模型上限')
  let prompt = buildElementEditPrompt(edits, referenceIndex, true)
  if (promptMaxLength && prompt.length > promptMaxLength) prompt = buildElementEditPrompt(edits, referenceIndex, false)
  if (promptMaxLength && prompt.length > promptMaxLength) throw new Error('编辑内容过多，请减少编辑处数')
  return { images, prompt }
}
