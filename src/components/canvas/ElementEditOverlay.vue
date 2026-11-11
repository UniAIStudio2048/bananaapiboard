<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  Brush,
  ChevronDown,
  CircleDot,
  History,
  ImagePlus,
  List,
  MapPin,
  Move,
  PencilLine,
  SquareDashed,
  SquarePen,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap
} from '@lucide/vue'
import { annotateImageElement } from '@/api/canvas/elementEdit.js'
import {
  ELEMENT_EDIT_LIMITS,
  boxLargeEnough,
  centerRectAt,
  clampPoint,
  clampRect,
  closeStroke,
  containRect,
  normalizeCandidateBox,
  rectFromPoints,
  resizeRect,
  sourceBounds,
  translateRect,
  validateElementEdits
} from '@/utils/canvasElementEditGeometry.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  imageUrl: { type: String, default: '' },
  // 返回节点图片显示框（屏幕坐标），编辑层始终贴合该区域
  getAnchorRect: { type: Function, default: null },
  pointsCost: { type: [Number, String], default: '' },
  busy: { type: Boolean, default: false },
  submitError: { type: String, default: '' },
  maxInputImages: { type: Number, default: 10 },
  uploadReference: { type: Function, default: null }
})

const emit = defineEmits(['close', 'generate'])

const TOOLS = [
  { tool: 'point', label: '点选', icon: MapPin },
  { tool: 'box', label: '框选', icon: SquareDashed },
  { tool: 'brush', label: '画笔', icon: Brush }
]

const rootRef = ref(null)
const stageRef = ref(null)
const frame = ref(null)
const natural = ref({ width: 0, height: 0 })
const tool = ref('point')
const brushSizePx = ref(ELEMENT_EDIT_LIMITS.brushDefault)
const records = ref([])
const draft = ref(null)
const redoStack = ref([])
const notice = ref('')
const draftError = ref('')
const labelsOpen = ref(false)
const uploadMenuOpen = ref(false)
const uploading = ref(false)
const preview = reactive({ sourceRect: null, targetRect: null, strokes: null })
const moveHint = reactive({ visible: false, x: 0, y: 0 })

let gesture = null
let frameLoop = 0
let recognitionToken = 0
let drawableImagePromise = null

const media = computed(() => {
  if (!frame.value) return { left: 0, top: 0, width: 0, height: 0 }
  return containRect({ width: frame.value.width, height: frame.value.height }, natural.value)
})
const mediaPx = computed(() => ({ width: Math.max(1, media.value.width), height: Math.max(1, media.value.height) }))
const naturalOrMedia = computed(() => natural.value.width > 0 ? natural.value : mediaPx.value)
const currentBrushSize = computed(() => brushSizePx.value / Math.max(1, Math.min(media.value.width, media.value.height)))
const showBrushSize = computed(() => tool.value === 'brush' || draft.value?.source.type === 'brush')
const canUndo = computed(() => !props.busy && (!!draft.value || records.value.length > 0))
const showInitialGuide = computed(() => !records.value.length && !draft.value && !preview.sourceRect && !preview.strokes)
const guideText = computed(() => tool.value === 'box' ? '框选你想要修改的对象' : tool.value === 'brush' ? '画出你想要修改的对象' : '标记你想要修改的对象')
const sliderOffset = computed(() => (brushSizePx.value - ELEMENT_EDIT_LIMITS.brushMin) / (ELEMENT_EDIT_LIMITS.brushMax - ELEMENT_EDIT_LIMITS.brushMin) * 44)

const draftBounds = computed(() => {
  const value = draft.value
  if (!value) return null
  return sourceBounds(value.source, mediaPx.value) ?? (value.source.type === 'point' ? { x: value.source.point.x, y: value.source.point.y, width: 0, height: 0 } : null)
})
const renderedDraftBounds = computed(() => preview.sourceRect ?? draftBounds.value)
const draftTargetRect = computed(() => {
  const value = draft.value
  return value?.action === 'move' && value.target && draftBounds.value ? (value.targetRect ?? centerRectAt(draftBounds.value, value.target)) : null
})
const renderedTargetRect = computed(() => preview.targetRect ?? draftTargetRect.value)
const handleRect = computed(() => renderedTargetRect.value ?? renderedDraftBounds.value)
// 框选的选区在未选择"移动"时可直接拖动位置、拖四角缩放；"移动"操作拖动的是目标位置
const canAdjustSource = computed(() => draft.value?.source.type === 'box' && draft.value.action !== 'move' && !draft.value.recognizing && !props.busy)
const cardBounds = computed(() => renderedTargetRect.value ?? renderedDraftBounds.value)
const previewStrokes = computed(() => preview.strokes ?? (draft.value?.source.type === 'brush' ? draft.value.source.strokes : null))
const editingExisting = computed(() => !!draft.value && records.value.some(record => record.id === draft.value.id))
const pointCandidates = computed(() => draft.value?.source.type === 'point' ? draft.value.source.candidates || [] : [])
const subjectName = computed(() => draft.value?.source.type === 'point' ? draft.value.source.subjectName || '选区' : '选区')
const referenceLimitReached = computed(() => {
  const urls = new Set(records.value.filter(record => record.id !== draft.value?.id && record.referenceImage).map(record => record.referenceImage.url))
  return urls.size >= Math.max(0, props.maxInputImages - 1)
})
const validation = computed(() => validateElementEdits(records.value, mediaPx.value))
const canGenerate = computed(() => validation.value.valid && !draft.value && !props.busy)
const panelHeight = computed(() => records.value.length ? 94 + 36 * Math.min(records.value.length, 3) : 50)

const modifyCompact = computed(() => draft.value?.action === 'modify' && !draft.value.prompt.length && !draft.value.referenceImage)
const cardStyle = computed(() => {
  const bounds = cardBounds.value
  const value = draft.value
  if (!bounds || !value) return {}
  const m = media.value
  const left = m.left + (bounds.x + bounds.width) * m.width
  const top = m.top + bounds.y * m.height
  if (value.action === 'move') return { left: `${left + 4}px`, top: `${top - 51}px` }
  if (value.action === 'modify' && modifyCompact.value) return { left: `${left + 2}px`, top: `${Math.max(m.top, top - 50)}px` }
  return { left: `${left}px`, top: `${Math.max(m.top, top - (value.action ? 0 : 54))}px` }
})

function newId() {
  return `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function percentStyle(rect) {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }
}

function corners(rect) {
  return [['nw', rect.x, rect.y], ['ne', rect.x + rect.width, rect.y], ['sw', rect.x, rect.y + rect.height], ['se', rect.x + rect.width, rect.y + rect.height]]
}

function connectorLines(source, target) {
  const w = mediaPx.value.width
  const h = mediaPx.value.height
  return [
    [source.x, source.y, target.x, target.y],
    [source.x + source.width, source.y, target.x + target.width, target.y],
    [source.x, source.y + source.height, target.x, target.y + target.height],
    [source.x + source.width, source.y + source.height, target.x + target.width, target.y + target.height]
  ].map(([x1, y1, x2, y2]) => ({ x1: x1 * w, y1: y1 * h, x2: x2 * w, y2: y2 * h }))
}

function strokeShapes(strokes) {
  const w = mediaPx.value.width
  const h = mediaPx.value.height
  return (strokes || []).filter(stroke => stroke.length).map(stroke => {
    const first = stroke[0]
    const last = stroke.at(-1)
    return {
      closed: stroke.length >= 3 && first.x === last.x && first.y === last.y,
      points: stroke.map(point => `${point.x * w},${point.y * h}`).join(' ')
    }
  })
}

function thumbViewBox(bounds) {
  const size = naturalOrMedia.value
  return [bounds.x * size.width, bounds.y * size.height, Math.max(1, bounds.width * size.width), Math.max(1, bounds.height * size.height)].join(' ')
}

function recordSourceRect(record) {
  return sourceBounds(record.source, mediaPx.value)
}

function recordTargetRect(record) {
  const source = recordSourceRect(record)
  return record.action === 'move' && record.target && source ? (record.targetRect ?? centerRectAt(source, record.target)) : null
}

// ---------- 状态操作 ----------

function resetSession() {
  records.value = []
  draft.value = null
  redoStack.value = []
  notice.value = ''
  draftError.value = ''
  labelsOpen.value = false
  uploadMenuOpen.value = false
  uploading.value = false
  tool.value = 'point'
  gesture = null
  recognitionToken += 1
  drawableImagePromise = null
  Object.assign(preview, { sourceRect: null, targetRect: null, strokes: null })
}

function setTool(next) {
  if (tool.value === next) return
  tool.value = next
  if (draft.value) recognitionToken += 1
  draft.value = null
  notice.value = ''
}

function setBrushSize(value) {
  const size = Math.min(ELEMENT_EDIT_LIMITS.brushMax, Math.max(ELEMENT_EDIT_LIMITS.brushMin, Number(value) || ELEMENT_EDIT_LIMITS.brushDefault))
  brushSizePx.value = size
  if (draft.value?.source.type === 'brush') {
    draft.value.source.brushSize = Math.min(1, Math.max(1e-4, currentBrushSize.value))
  }
}

function canBegin() {
  return !draft.value && !props.busy && records.value.length < ELEMENT_EDIT_LIMITS.maxCount
}

function createDraft(source, recognizing = false) {
  return { id: newId(), source, action: null, prompt: '', recognizing, recognitionFailed: false }
}

function cancelDraft() {
  recognitionToken += 1
  draft.value = null
  draftError.value = ''
  labelsOpen.value = false
  uploadMenuOpen.value = false
}

function undo() {
  if (props.busy) return
  if (draft.value) {
    if (!draft.value.recognizing) redoStack.value.push({ type: 'draft', draft: clone(draft.value) })
    cancelDraft()
    return
  }
  const last = records.value.at(-1)
  if (!last) return
  records.value = records.value.slice(0, -1)
  redoStack.value.push({ type: 'record', record: clone(last) })
}

function redo() {
  if (props.busy || draft.value || !redoStack.value.length) return
  const entry = redoStack.value.pop()
  if (entry.type === 'draft') draft.value = entry.draft
  else records.value = [...records.value, entry.record]
}

function completeDraft() {
  const value = draft.value
  if (!value || uploading.value) return
  if (value.recognizing || value.recognitionFailed || !value.action) return
  if (value.action === 'modify' && !value.prompt.trim()) {
    draftError.value = '请输入修改描述'
    return
  }
  if (value.action === 'move' && !value.target) {
    draftError.value = '请选择移动目标位置'
    return
  }
  const source = clone(value.source)
  if (source.type === 'point') {
    delete source.candidates
    delete source.selectedCandidateIndex
  }
  const record = {
    id: value.id,
    source,
    action: value.action,
    prompt: value.prompt.trim(),
    target: value.target ? { ...value.target } : undefined,
    targetRect: value.targetRect ? { ...value.targetRect } : undefined,
    referenceImage: value.referenceImage ? { ...value.referenceImage } : undefined
  }
  records.value = records.value.some(item => item.id === record.id)
    ? records.value.map(item => item.id === record.id ? record : item)
    : [...records.value, record]
  redoStack.value = []
  draft.value = null
  draftError.value = ''
  uploadMenuOpen.value = false
}

function reopenRecord(id) {
  if (draft.value || props.busy) return
  const record = records.value.find(item => item.id === id)
  if (!record) return
  draft.value = { ...clone(record), prompt: record.prompt || '', recognizing: false, recognitionFailed: false }
  redoStack.value = []
}

function deleteRecord(id) {
  if (props.busy) return
  records.value = records.value.filter(item => item.id !== id)
  if (draft.value?.id === id) cancelDraft()
  redoStack.value = []
}

function setDraftAction(action) {
  if (!draft.value || (draft.value.source.type === 'brush' && action === 'move')) return
  labelsOpen.value = false
  draft.value.action = action
  if (action === 'modify') {
    draft.value.target = undefined
    draft.value.targetRect = undefined
  } else {
    draft.value.referenceImage = undefined
  }
}

function selectCandidate(index) {
  const candidate = pointCandidates.value[index]
  if (!candidate || !draft.value) return
  draft.value.source.subjectName = candidate.subjectName
  draft.value.source.bbox = { ...candidate.bbox }
  draft.value.source.selectedCandidateIndex = index
  labelsOpen.value = false
}

function setDraftTargetRect(rect) {
  if (draft.value?.action !== 'move') return
  const next = clampRect(rect)
  draft.value.targetRect = next
  draft.value.target = clampPoint({ x: next.x + next.width / 2, y: next.y + next.height / 2 })
}

// ---------- 点选识别 ----------

function loadImage(src, cors) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (cors) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

function loadDrawableImage() {
  if (!drawableImagePromise) {
    const url = props.imageUrl
    drawableImagePromise = loadImage(url, true).catch(async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error('图片加载失败')
      const objectUrl = URL.createObjectURL(await response.blob())
      try { return await loadImage(objectUrl, false) } finally { URL.revokeObjectURL(objectUrl) }
    })
  }
  return drawableImagePromise
}

async function markedPointImage(point) {
  try {
    const image = await loadDrawableImage()
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const scale = Math.min(1, 1280 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const radius = Math.max(5, Math.round(Math.max(canvas.width, canvas.height) / 110))
    context.beginPath()
    context.arc(point.x * canvas.width, point.y * canvas.height, radius, 0, Math.PI * 2)
    context.fillStyle = '#ff2d2d'
    context.fill()
    context.lineWidth = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) / 320))
    context.strokeStyle = '#fff'
    context.stroke()
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return props.imageUrl
  }
}

async function recognizePoint(point) {
  const recognizingPoint = draft.value?.recognizing && draft.value.source.type === 'point'
  if (props.busy || records.value.length >= ELEMENT_EDIT_LIMITS.maxCount || (draft.value && !recognizingPoint)) {
    if (records.value.length >= ELEMENT_EDIT_LIMITS.maxCount) notice.value = `最多添加 ${ELEMENT_EDIT_LIMITS.maxCount} 处编辑`
    return
  }
  const token = ++recognitionToken
  const value = createDraft({ type: 'point', point: clampPoint(point) }, true)
  draft.value = value
  redoStack.value = []
  try {
    const result = await annotateImageElement({
      image: await markedPointImage(point),
      mode: 'point',
      point: clampPoint(point),
      idempotencyKey: value.id
    })
    if (token !== recognitionToken || draft.value?.id !== value.id) return
    const seen = new Set()
    const candidates = (result.candidates || [])
      .map(item => ({ subjectName: String(item.label || '').trim(), bbox: normalizeCandidateBox(item.box) }))
      .filter(item => item.subjectName && item.bbox)
      .filter(item => {
        const key = `${item.subjectName}:${Object.values(item.bbox).join(',')}`
        return !seen.has(key) && seen.add(key)
      })
    if (!candidates.length) throw new Error('empty')
    draft.value = {
      ...draft.value,
      source: { ...draft.value.source, subjectName: candidates[0].subjectName, bbox: candidates[0].bbox, candidates, selectedCandidateIndex: 0 },
      recognizing: false
    }
  } catch {
    if (token !== recognitionToken || draft.value?.id !== value.id) return
    draft.value = { ...draft.value, recognizing: false, recognitionFailed: true }
  }
}

// ---------- 指针交互 ----------

function toNormalized(event) {
  const bounds = stageRef.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return { x: 0, y: 0 }
  return clampPoint({ x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height })
}

function stagePointerDown(event) {
  if (event.button !== 0 || props.busy) return
  event.preventDefault()
  event.stopPropagation()
  stageRef.value?.setPointerCapture?.(event.pointerId)
  notice.value = ''
  labelsOpen.value = false
  const point = toNormalized(event)
  const value = draft.value
  if (value?.action === 'move' && !value.recognizing) return
  if (tool.value === 'point' && (!value || (value.recognizing && value.source.type === 'point'))) {
    void recognizePoint(point)
    return
  }
  if (tool.value === 'box' && !value) {
    gesture = { kind: 'box', start: point }
    preview.sourceRect = { x: point.x, y: point.y, width: 0, height: 0 }
  } else if (tool.value === 'brush' && (!value || value.source.type === 'brush')) {
    gesture = { kind: 'brush', points: [point] }
    preview.strokes = [...(value?.source.type === 'brush' ? value.source.strokes : []), [point]]
  }
}

function updateGesture(point) {
  if (!gesture) return
  if (gesture.kind === 'box') {
    preview.sourceRect = rectFromPoints(gesture.start, point)
  } else if (gesture.kind === 'brush') {
    const last = gesture.points.at(-1)
    if (!last || last.x !== point.x || last.y !== point.y) gesture.points.push(point)
    preview.strokes = [...(draft.value?.source.type === 'brush' ? draft.value.source.strokes : []), [...gesture.points]]
  } else if (gesture.kind === 'moveSource') {
    preview.sourceRect = translateRect(gesture.rect, point.x - gesture.start.x, point.y - gesture.start.y)
  } else if (gesture.kind === 'resizeSource') {
    preview.sourceRect = resizeRect(gesture.rect, point, gesture.corner, {
      width: ELEMENT_EDIT_LIMITS.minBoxPx / mediaPx.value.width,
      height: ELEMENT_EDIT_LIMITS.minBoxPx / mediaPx.value.height
    })
  } else if (gesture.kind === 'moveTarget') {
    preview.targetRect = translateRect(gesture.rect, point.x - gesture.start.x, point.y - gesture.start.y)
  } else if (gesture.kind === 'resizeTarget') {
    preview.targetRect = resizeRect(gesture.rect, point, gesture.corner, {
      width: 12 / mediaPx.value.width,
      height: 12 / mediaPx.value.height
    })
  }
}

function stagePointerMove(event) {
  if (!gesture) return
  event.preventDefault()
  event.stopPropagation()
  updateGesture(toNormalized(event))
}

function stagePointerUp(event) {
  const current = gesture
  if (!current) return
  event.preventDefault()
  event.stopPropagation()
  updateGesture(toNormalized(event))
  gesture = null
  if (current.kind === 'box') {
    const rect = preview.sourceRect
    preview.sourceRect = null
    if (!rect || !boxLargeEnough(rect, mediaPx.value)) {
      notice.value = '选区太小，请扩大标记范围'
    } else if (!canBegin()) {
      notice.value = `最多添加 ${ELEMENT_EDIT_LIMITS.maxCount} 处编辑`
    } else {
      draft.value = createDraft({ type: 'box', rect: clampRect(rect) })
      redoStack.value = []
    }
  } else if (current.kind === 'brush') {
    const all = preview.strokes || [current.points]
    const strokes = all.map((stroke, index) => index === all.length - 1 ? closeStroke(stroke) : stroke)
    preview.strokes = null
    if (draft.value?.source.type === 'brush') {
      draft.value.source.strokes = strokes
    } else if (!canBegin()) {
      notice.value = `最多添加 ${ELEMENT_EDIT_LIMITS.maxCount} 处编辑`
    } else {
      draft.value = createDraft({ type: 'brush', brushSize: Math.min(1, Math.max(1e-4, currentBrushSize.value)), strokes })
      redoStack.value = []
    }
  } else if (isSourceGesture(current.kind)) {
    const rect = preview.sourceRect
    preview.sourceRect = null
    if (rect && draft.value?.source.type === 'box') draft.value.source.rect = clampRect(rect)
  } else {
    const rect = preview.targetRect
    preview.targetRect = null
    if (rect) setDraftTargetRect(rect)
  }
}

function stagePointerCancel() {
  gesture = null
  Object.assign(preview, { sourceRect: null, targetRect: null, strokes: null })
}

function isSourceGesture(kind) {
  return kind === 'moveSource' || kind === 'resizeSource'
}

function startTargetGesture(event, kind, corner) {
  if (event.button !== 0 || !handleRect.value) return
  event.preventDefault()
  event.stopPropagation()
  hideMoveHint()
  stageRef.value?.setPointerCapture?.(event.pointerId)
  gesture = { kind, corner, start: toNormalized(event), rect: { ...handleRect.value } }
  if (isSourceGesture(kind)) preview.sourceRect = { ...handleRect.value }
  else preview.targetRect = { ...handleRect.value }
}

function showMoveHintAt(event) {
  if (!(draft.value?.action === 'move' && !draft.value.target && !preview.targetRect)) return
  const bounds = event.currentTarget.getBoundingClientRect()
  Object.assign(moveHint, { visible: true, x: event.clientX - bounds.left + 20, y: event.clientY - bounds.top + 20 })
}

function hideMoveHint() {
  moveHint.visible = false
}

// 编辑层覆盖在画布之上，把图片区域的滚轮转发给下方画布，保持缩放/平移手感。
function forwardWheel(event) {
  const root = rootRef.value
  if (!root) return
  event.preventDefault()
  root.style.pointerEvents = 'none'
  const children = [...root.querySelectorAll('[data-ee-hit]')]
  children.forEach(child => { child.style.pointerEvents = 'none' })
  const target = document.elementFromPoint(event.clientX, event.clientY)
  children.forEach(child => { child.style.pointerEvents = '' })
  root.style.pointerEvents = ''
  if (!target || root.contains(target)) return
  target.dispatchEvent(new WheelEvent('wheel', event))
}

// ---------- 参考图 ----------

const fileInputRef = ref(null)

async function handleReferenceFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !file.type.startsWith('image/') || !props.uploadReference || !draft.value) return
  const draftId = draft.value.id
  uploading.value = true
  try {
    const url = await props.uploadReference(file)
    if (!url) throw new Error('上传失败')
    const dot = file.name.lastIndexOf('.')
    const name = (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || file.name
    if (draft.value?.id === draftId && draft.value.action === 'modify') draft.value.referenceImage = { name, url }
  } catch {
    notice.value = '参考图上传失败，请重试'
  } finally {
    uploading.value = false
  }
}

function openLocalUpload() {
  uploadMenuOpen.value = false
  fileInputRef.value?.click()
}

function openHistoryGallery() {
  uploadMenuOpen.value = false
  const draftId = draft.value?.id
  window.dispatchEvent(new CustomEvent('canvas:pick-history-image', {
    detail: {
      onSelect(item) {
        const url = String(item?.url || '').trim()
        if (!url || draft.value?.id !== draftId || draft.value.action !== 'modify') return
        let name = '历史图库'
        try {
          const file = decodeURIComponent(new URL(url, window.location.origin).pathname.split('/').filter(Boolean).at(-1) || '')
          const dot = file.lastIndexOf('.')
          name = (dot > 0 ? file.slice(0, dot) : file).trim() || name
        } catch {}
        draft.value.referenceImage = { name, url }
      }
    }
  }))
}

function removeReference() {
  if (draft.value) draft.value.referenceImage = undefined
}

// ---------- 生命周期 ----------

function updateFrame() {
  const rect = props.getAnchorRect?.()
  if (rect && rect.width > 0 && rect.height > 0) {
    const current = frame.value
    if (!current || current.left !== rect.left || current.top !== rect.top || current.width !== rect.width || current.height !== rect.height) {
      frame.value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
  } else if (frame.value) {
    frame.value = null
  }
  frameLoop = requestAnimationFrame(updateFrame)
}

function imageLoaded(event) {
  const image = event.target
  if (image?.naturalWidth) natural.value = { width: image.naturalWidth, height: image.naturalHeight }
}

function close() {
  if (props.busy) return
  emit('close')
}

function generate() {
  if (!canGenerate.value) return
  emit('generate', { edits: clone(records.value), natural: { ...natural.value } })
}

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))
}

function keydown(event) {
  if (!props.visible) return
  const inside = rootRef.value?.contains(event.target)
  const typing = isTyping(event.target)
  if (event.key === 'Escape') {
    if (!inside && typing) return
    event.preventDefault()
    event.stopPropagation()
    if (labelsOpen.value || uploadMenuOpen.value) {
      labelsOpen.value = false
      uploadMenuOpen.value = false
    } else if (draft.value) {
      cancelDraft()
    } else {
      close()
    }
    return
  }
  // 输入框内的按键交给目标元素处理（捕获阶段阻止传播会让输入框收不到 keydown），由根节点 @keydown.stop 拦截冒泡。
  if (typing) return
  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()
  if (mod && key === 'z') {
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) redo()
    else undo()
  } else if (mod && key === 'y') {
    event.preventDefault()
    event.stopPropagation()
    redo()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
  }
}

watch(() => props.visible, value => {
  cancelAnimationFrame(frameLoop)
  if (value) {
    resetSession()
    frameLoop = requestAnimationFrame(updateFrame)
  } else {
    frame.value = null
  }
}, { immediate: true })

watch(() => props.imageUrl, () => {
  drawableImagePromise = null
  natural.value = { width: 0, height: 0 }
})

watch(() => draft.value?.id, () => {
  draftError.value = ''
  labelsOpen.value = false
  uploadMenuOpen.value = false
  nextTick(() => rootRef.value?.querySelector('[data-ee-autofocus]')?.focus({ preventScroll: true }))
})

watch(() => [draft.value?.action, !!draft.value?.target], () => {
  nextTick(() => rootRef.value?.querySelector('[data-ee-autofocus]')?.focus({ preventScroll: true }))
})

onMounted(() => window.addEventListener('keydown', keydown, true))
onBeforeUnmount(() => {
  cancelAnimationFrame(frameLoop)
  window.removeEventListener('keydown', keydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && frame"
      ref="rootRef"
      class="ee-root"
      :style="{ left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` }"
      data-element-edit="true"
      @contextmenu.prevent
      @keydown.stop
    >
      <!-- 顶部工具栏 -->
      <div class="ee-toolbar" data-ee-hit role="toolbar" aria-label="元素编辑工具" @pointerdown.stop @wheel.stop.prevent>
        <button type="button" class="ee-close" title="关闭" aria-label="关闭" :disabled="busy" @click="close">
          <X :size="12" :stroke-width="2" />
          <span>元素编辑</span>
        </button>
        <div class="ee-divider" />
        <button
          v-for="item in TOOLS"
          :key="item.tool"
          type="button"
          class="ee-icon-btn"
          :class="{ active: tool === item.tool }"
          :title="item.label"
          :aria-label="item.label"
          :aria-pressed="tool === item.tool"
          :disabled="busy"
          @click="setTool(item.tool)"
        >
          <component :is="item.icon" :size="18" :stroke-width="1.6" />
        </button>
        <template v-if="showBrushSize">
          <div class="ee-divider" />
          <div class="ee-brush-size">
            <span class="ee-brush-icon"><CircleDot :size="16" :stroke-width="1.6" /></span>
            <div class="ee-slider">
              <div class="ee-slider-track" />
              <div class="ee-slider-fill" :style="{ width: `${sliderOffset + 7}px` }" />
              <input
                type="range"
                aria-label="画笔大小"
                :min="ELEMENT_EDIT_LIMITS.brushMin"
                :max="ELEMENT_EDIT_LIMITS.brushMax"
                step="1"
                :value="brushSizePx"
                @input="setBrushSize($event.target.value)"
                @keydown.stop
              />
              <div class="ee-slider-thumb" :style="{ left: `${sliderOffset}px` }" />
            </div>
          </div>
        </template>
        <div class="ee-divider" />
        <button type="button" class="ee-icon-btn" title="撤销" aria-label="撤销" :disabled="!canUndo" @click="undo">
          <Undo2 :size="18" :stroke-width="1.6" />
        </button>
      </div>

      <!-- 图片与标注层 -->
      <img :src="imageUrl" alt="" draggable="false" class="ee-image" @load="imageLoaded" />
      <div
        ref="stageRef"
        class="ee-stage"
        data-ee-hit
        :class="[`tool-${tool}`, { 'is-dragging': !!preview.targetRect }]"
        :style="{ left: `${media.left}px`, top: `${media.top}px`, width: `${media.width}px`, height: `${media.height}px` }"
        @pointerdown="stagePointerDown"
        @pointermove="stagePointerMove"
        @pointerup="stagePointerUp"
        @pointercancel="stagePointerCancel"
        @wheel="forwardWheel"
        @dblclick.stop
      >
        <template v-if="showInitialGuide">
          <div class="ee-initial-mask" />
          <div class="ee-initial-guide"><span>{{ guideText }}</span></div>
        </template>

        <!-- 已添加的编辑 -->
        <template v-for="record in records" :key="record.id">
          <svg v-if="record.source.type === 'brush'" class="ee-svg" :viewBox="`0 0 ${mediaPx.width} ${mediaPx.height}`" preserveAspectRatio="none">
            <component
              :is="shape.closed ? 'polygon' : 'polyline'"
              v-for="(shape, index) in strokeShapes(record.source.strokes)"
              :key="index"
              :points="shape.points"
              fill="none"
              stroke="#fff"
              :stroke-width="record.source.brushSize * Math.min(mediaPx.width, mediaPx.height)"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <template v-if="record.id !== draft?.id && recordSourceRect(record)">
            <template v-if="recordTargetRect(record)">
              <div class="ee-rect" :style="{ ...percentStyle(recordSourceRect(record)), opacity: 0.5 }" />
              <svg class="ee-svg ee-connectors" :viewBox="`0 0 ${mediaPx.width} ${mediaPx.height}`" preserveAspectRatio="none">
                <line v-for="(line, index) in connectorLines(recordSourceRect(record), recordTargetRect(record))" :key="index" v-bind="line" stroke="#fff" stroke-width="1" stroke-dasharray="3 3" />
              </svg>
              <div class="ee-rect" :style="percentStyle(recordTargetRect(record))" />
            </template>
            <div v-else-if="record.source.type !== 'brush'" class="ee-rect" :style="percentStyle(recordSourceRect(record))" />
          </template>
        </template>

        <!-- 当前选区 -->
        <template v-if="renderedDraftBounds">
          <template v-if="renderedTargetRect">
            <div class="ee-rect" :style="{ ...percentStyle(renderedDraftBounds), opacity: 0.5 }" />
            <svg class="ee-svg ee-connectors" :viewBox="`0 0 ${mediaPx.width} ${mediaPx.height}`" preserveAspectRatio="none">
              <line v-for="(line, index) in connectorLines(renderedDraftBounds, renderedTargetRect)" :key="index" v-bind="line" stroke="#fff" stroke-width="1" stroke-dasharray="3 3" />
            </svg>
            <div class="ee-rect" :style="percentStyle(renderedTargetRect)" />
          </template>
          <div v-else-if="renderedDraftBounds.width > 0" class="ee-rect" :style="percentStyle(renderedDraftBounds)" />
        </template>
        <svg v-if="previewStrokes" class="ee-svg" :viewBox="`0 0 ${mediaPx.width} ${mediaPx.height}`" preserveAspectRatio="none">
          <component
            :is="shape.closed ? 'polygon' : 'polyline'"
            v-for="(shape, index) in strokeShapes(previewStrokes)"
            :key="index"
            :points="shape.points"
            fill="none"
            stroke="#fff"
            :stroke-width="(draft?.source.type === 'brush' ? draft.source.brushSize : currentBrushSize) * Math.min(mediaPx.width, mediaPx.height)"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span
          v-if="draft?.recognizing && draft.source.type === 'point'"
          class="ee-point"
          :style="{ left: `${draft.source.point.x * 100}%`, top: `${draft.source.point.y * 100}%` }"
        />

        <!-- 选区角点、拖动与缩放 -->
        <template v-if="draft && handleRect && handleRect.width > 0">
          <button
            v-if="draft.action === 'move' || canAdjustSource"
            type="button"
            class="ee-move-area"
            aria-label="选区"
            :style="percentStyle(handleRect)"
            @pointerdown="startTargetGesture($event, canAdjustSource ? 'moveSource' : 'moveTarget')"
            @pointermove="showMoveHintAt"
            @pointerleave="hideMoveHint"
          >
            <span
              v-if="draft.action === 'move' && !draft.target && !preview.targetRect"
              class="ee-move-hint"
              :style="{ opacity: moveHint.visible ? 1 : 0, transform: `translate3d(${moveHint.x}px, ${moveHint.y}px, 0)` }"
            >拖动对象到想要的位置</span>
          </button>
          <template v-for="[corner, x, y] in corners(handleRect)" :key="corner">
            <button
              v-if="canAdjustSource || (draft.action === 'move' && draft.target)"
              type="button"
              class="ee-corner"
              :class="corner === 'nw' || corner === 'se' ? 'nwse' : 'nesw'"
              aria-label="缩放选区"
              :style="{ left: `${x * 100}%`, top: `${y * 100}%` }"
              @pointerdown="startTargetGesture($event, canAdjustSource ? 'resizeSource' : 'resizeTarget', corner)"
            ><i /></button>
            <span v-else class="ee-corner static" :style="{ left: `${x * 100}%`, top: `${y * 100}%` }"><i /></span>
          </template>
        </template>
      </div>

      <!-- 选区卡片 -->
      <template v-if="draft && cardBounds && !preview.targetRect">
        <div
          v-if="draft.recognizing || draft.recognitionFailed"
          class="ee-card ee-bubble ee-status-card"
          data-ee-hit
          :class="{ failed: draft.recognitionFailed }"
          :style="cardStyle"
          @pointerdown.stop
          @wheel.stop
        >
          <div v-if="draft.recognizing" class="ee-recognizing"><span class="ee-spinner" />识别中...</div>
          <div v-else class="ee-failed">
            <span>未识别到主体，请改用框选或画笔</span>
            <button type="button" class="ee-ghost-btn" @click="cancelDraft">取消</button>
          </div>
        </div>

        <div
          v-else-if="!draft.action"
          class="ee-card ee-bubble ee-action-card"
          data-ee-hit
          :class="{ wide: draft.source.type !== 'brush' }"
          :style="cardStyle"
          @pointerdown.stop
          @wheel.stop
        >
          <div class="ee-subject" @focusout="labelsOpen = labelsOpen && $event.currentTarget.contains($event.relatedTarget)">
            <button
              type="button"
              class="ee-subject-tag"
              :aria-haspopup="pointCandidates.length > 1 ? 'listbox' : undefined"
              :aria-expanded="labelsOpen"
              :disabled="pointCandidates.length < 2"
              @click="labelsOpen = !labelsOpen"
            >
              <svg class="ee-thumb" :viewBox="thumbViewBox(draftBounds)" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <image :href="imageUrl" x="0" y="0" :width="naturalOrMedia.width" :height="naturalOrMedia.height" preserveAspectRatio="none" />
              </svg>
              <span class="ee-subject-name">{{ subjectName }}</span>
              <ChevronDown v-if="pointCandidates.length > 1" :size="12" :class="{ open: labelsOpen }" class="ee-chevron" />
            </button>
            <div v-if="labelsOpen" class="ee-candidates" role="listbox">
              <button
                v-for="(candidate, index) in pointCandidates"
                :key="`${candidate.subjectName}-${index}`"
                type="button"
                role="option"
                :aria-selected="index === (draft.source.selectedCandidateIndex || 0)"
                :class="{ selected: index === (draft.source.selectedCandidateIndex || 0) }"
                @click="selectCandidate(index)"
              >
                <svg class="ee-thumb" :viewBox="thumbViewBox(candidate.bbox)" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <image :href="imageUrl" x="0" y="0" :width="naturalOrMedia.width" :height="naturalOrMedia.height" preserveAspectRatio="none" />
                </svg>
                <span>{{ candidate.subjectName }}</span>
              </button>
            </div>
          </div>
          <div class="ee-actions">
            <button type="button" class="ee-text-btn" @click="setDraftAction('modify')"><SquarePen :size="18" :stroke-width="1.6" />修改</button>
            <button v-if="draft.source.type !== 'brush'" type="button" class="ee-text-btn" @click="setDraftAction('move')"><Move :size="18" :stroke-width="1.6" />移动</button>
          </div>
        </div>

        <div
          v-else-if="draft.action === 'move' && draft.target"
          class="ee-card ee-bubble ee-move-card"
          data-ee-hit
          :style="cardStyle"
          @pointerdown.stop
          @wheel.stop
        >
          <input
            v-model="draft.prompt"
            data-ee-autofocus
            class="ee-move-input"
            placeholder="补充移动说明"
            maxlength="300"
            @keydown.enter="!$event.isComposing && completeDraft()"
          />
          <button v-if="editingExisting" type="button" class="ee-round-icon" title="删除" aria-label="删除" @click="deleteRecord(draft.id)"><Trash2 :size="16" :stroke-width="1.6" /></button>
          <button type="button" class="ee-primary-pill" @click="completeDraft">{{ editingExisting ? '保存' : '添加' }}</button>
        </div>

        <div
          v-else-if="draft.action === 'modify'"
          class="ee-card ee-modify-card"
          data-ee-hit
          :class="modifyCompact ? 'compact ee-bubble' : draft.referenceImage ? 'uploaded' : 'expanded'"
          :style="cardStyle"
          @pointerdown.stop
          @wheel.stop
        >
          <div v-if="draft.referenceImage" class="ee-reference-row">
            <div class="ee-reference-preview">
              <img :src="draft.referenceImage.url" alt="" />
              <button type="button" title="删除" aria-label="删除参考图" :disabled="uploading" @click.stop="removeReference"><Trash2 :size="12" /></button>
            </div>
          </div>
          <div class="ee-modify-body">
            <div class="ee-subject-tag static">
              <svg class="ee-thumb" :viewBox="thumbViewBox(draftBounds)" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <image :href="imageUrl" x="0" y="0" :width="naturalOrMedia.width" :height="naturalOrMedia.height" preserveAspectRatio="none" />
              </svg>
              <span class="ee-subject-name">{{ subjectName }}</span>
            </div>
            <textarea
              v-model="draft.prompt"
              data-ee-autofocus
              class="ee-modify-input"
              :rows="modifyCompact || draft.referenceImage ? 1 : 3"
              maxlength="500"
              placeholder="描述你想如何修改"
              @input="draftError = ''"
              @keydown.enter="modifyCompact && !$event.isComposing && $event.preventDefault()"
            />
            <span v-if="!modifyCompact && draftError" class="ee-draft-error" :class="{ uploaded: !!draft.referenceImage }">{{ draftError }}</span>
          </div>
          <div v-if="!modifyCompact" class="ee-modify-footer">
            <input ref="fileInputRef" type="file" accept="image/*" hidden @change="handleReferenceFile" />
            <div class="ee-upload" @mouseenter="uploadMenuOpen = true" @mouseleave="uploadMenuOpen = false">
              <button
                type="button"
                class="ee-round-icon"
                title="上传图片"
                aria-label="上传图片"
                aria-haspopup="menu"
                :aria-expanded="uploadMenuOpen"
                :disabled="uploading || referenceLimitReached"
                @click="uploadMenuOpen = true"
              >
                <span v-if="uploading" class="ee-spinner large" />
                <ImagePlus v-else :size="18" :stroke-width="1.6" />
              </button>
              <div v-if="uploadMenuOpen && !uploading && !referenceLimitReached" class="ee-upload-menu" role="menu">
                <div class="ee-upload-menu-inner">
                  <button type="button" role="menuitem" :disabled="!uploadReference" @click="openLocalUpload"><Upload :size="14" />本地上传</button>
                  <button type="button" role="menuitem" @click="openHistoryGallery"><History :size="14" />历史图库</button>
                </div>
              </div>
            </div>
            <div class="ee-footer-actions">
              <button v-if="draft.referenceImage" type="button" class="ee-round-icon" title="删除" aria-label="删除参考图" :disabled="uploading" @click="removeReference"><Trash2 :size="14" /></button>
              <button v-if="editingExisting" type="button" class="ee-round-icon" title="删除" aria-label="删除" @click="deleteRecord(draft.id)"><Trash2 :size="16" :stroke-width="1.6" /></button>
              <button type="button" class="ee-primary-pill" :disabled="uploading || !draft.prompt.trim()" @click="completeDraft">{{ editingExisting ? '保存' : '添加' }}</button>
            </div>
          </div>
        </div>
      </template>

      <div v-if="notice" class="ee-notice" role="status">{{ notice }}</div>

      <!-- 编辑内容面板 -->
      <div class="ee-panel" data-ee-hit :style="{ height: `${panelHeight}px` }" @pointerdown.stop @wheel.stop>
        <div class="ee-panel-head" :class="{ filled: records.length }">
          <span class="ee-panel-title"><List :size="16" :stroke-width="1.6" />编辑内容</span>
          <span class="ee-panel-count">{{ records.length ? `${records.length} 处` : '待添加' }}</span>
        </div>
        <div v-if="records.length" class="ee-records">
          <div v-for="(record, index) in records" :key="record.id" class="ee-record">
            <button type="button" class="ee-record-main" :disabled="!!draft || busy" @click="reopenRecord(record.id)">
              <span class="ee-record-tag">
                <svg v-if="recordSourceRect(record)" class="ee-thumb small" :viewBox="thumbViewBox(recordSourceRect(record))" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <image :href="imageUrl" x="0" y="0" :width="naturalOrMedia.width" :height="naturalOrMedia.height" preserveAspectRatio="none" />
                </svg>
                <span class="ee-truncate">{{ record.source.type === 'point' ? record.source.subjectName : '选区' }}</span>
              </span>
              <span v-if="record.referenceImage" class="ee-record-tag">
                <img :src="record.referenceImage.url" alt="" class="ee-thumb small" />
                <span class="ee-truncate">{{ record.referenceImage.name }}</span>
              </span>
              <span class="ee-record-text">{{ record.prompt || (record.action === 'modify' ? '修改' : '移动') }}</span>
            </button>
            <div v-if="!draft && !busy" class="ee-record-actions">
              <button type="button" title="编辑" aria-label="编辑" @click="reopenRecord(record.id)"><PencilLine :size="16" :stroke-width="1.6" /></button>
              <button type="button" class="muted" aria-label="删除" :title="`正在编辑第 ${index + 1} 处`" @click="deleteRecord(record.id)"><Trash2 :size="14" :stroke-width="1.6" /></button>
            </div>
          </div>
        </div>
        <div v-if="submitError" class="ee-submit-error">{{ submitError }}</div>
        <div v-if="records.length" class="ee-panel-footer">
          <button type="button" class="ee-cancel-btn" :disabled="busy" @click="close">取消</button>
          <button type="button" class="ee-generate-btn" :disabled="!canGenerate" @click="generate">
            <Zap :size="12" fill="currentColor" :stroke-width="0" />
            <span v-if="pointsCost !== ''">{{ pointsCost }}</span>
            {{ busy ? '生成中...' : submitError ? '重试' : '生成' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ee-root {
  --ee-panel: #1b1b1b;
  --ee-border: #303030;
  --ee-text: #f2f2f2;
  --ee-text-secondary: #a5a5a5;
  --ee-text-muted: #818181;
  --ee-text-disabled: #5f5f5f;
  --ee-hover: rgba(255, 255, 255, 0.08);
  --ee-active: rgba(255, 255, 255, 0.14);
  --ee-invert-bg: #f2f2f2;
  --ee-invert-hover: #ffffff;
  --ee-invert-text: #171717;
  --ee-danger: #f87171;
  --ee-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.24), 0 2px 2px rgba(0, 0, 0, 0.12);
  position: fixed;
  z-index: 950;
  pointer-events: none;
  color: var(--ee-text);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}

.ee-root input,
.ee-root textarea {
  user-select: text;
}

:root.canvas-theme-light .ee-root {
  --ee-panel: #ffffff;
  --ee-border: #dedede;
  --ee-text: #171717;
  --ee-text-secondary: #656565;
  --ee-text-muted: #858585;
  --ee-text-disabled: #b4b4b4;
  --ee-hover: rgba(0, 0, 0, 0.05);
  --ee-active: rgba(0, 0, 0, 0.08);
  --ee-invert-bg: #171717;
  --ee-invert-hover: #303030;
  --ee-invert-text: #ffffff;
  --ee-danger: #dc2626;
  --ee-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.08), 0 2px 2px rgba(0, 0, 0, 0.04);
}

.ee-root button {
  font: inherit;
  color: inherit;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.ee-root button:disabled {
  cursor: not-allowed;
}

.ee-root button:focus-visible,
.ee-root input:focus-visible {
  outline: 2px solid var(--ee-text-secondary);
  outline-offset: 1px;
}

/* 工具栏 */
.ee-toolbar {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 52px);
  transform: translateX(-50%);
  width: max-content;
  height: 44px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid var(--ee-border);
  border-radius: 14px;
  background: var(--ee-panel);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
  pointer-events: auto;
  touch-action: none;
}

.ee-close {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 8px;
  white-space: nowrap;
}

.ee-divider {
  width: 1px;
  height: 42px;
  margin: 0 2px;
  background: var(--ee-border);
}

.ee-icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.ee-close:hover:not(:disabled),
.ee-icon-btn:hover:not(:disabled) {
  background: var(--ee-hover);
}

.ee-icon-btn.active {
  background: var(--ee-active);
}

.ee-icon-btn:disabled,
.ee-close:disabled {
  opacity: 0.35;
}

.ee-brush-size {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ee-brush-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ee-slider {
  position: relative;
  width: 64px;
  height: 12px;
  margin-right: 6px;
}

.ee-slider-track,
.ee-slider-fill {
  position: absolute;
  top: 50%;
  height: 4px;
  transform: translateY(-50%);
  border-radius: 999px;
}

.ee-slider-track {
  left: 0;
  right: 0;
  background: var(--ee-active);
}

.ee-slider-fill {
  left: 0;
  background: var(--ee-text);
}

.ee-slider input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 12px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.ee-slider-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  transform: translateY(-50%);
  border: 2px solid var(--ee-text);
  border-radius: 50%;
  background: var(--ee-panel);
  pointer-events: none;
}

.ee-slider:has(input:focus-visible) .ee-slider-thumb {
  outline: 2px solid var(--ee-text-secondary);
  outline-offset: 1px;
}

/* 图片与标注层 */
.ee-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  user-select: none;
  pointer-events: none;
}

.ee-stage {
  position: absolute;
  overflow: visible;
  touch-action: none;
  pointer-events: auto;
  cursor: crosshair;
}

.ee-stage.is-dragging {
  cursor: move;
}

.ee-initial-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.ee-initial-guide {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 10;
  transform: translate(-50%, -50%);
  white-space: nowrap;
  color: #fff;
  pointer-events: none;
}

.ee-initial-guide span,
.ee-move-hint {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(5px);
  font-size: 13px;
  line-height: 20px;
}

.ee-rect {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #fff;
  background: rgba(255, 255, 255, 0.12);
  mix-blend-mode: plus-lighter;
  pointer-events: none;
}

.ee-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.ee-connectors {
  opacity: 0.5;
}

.ee-point {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #ff2d2d;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.ee-move-area {
  position: absolute;
  padding: 0;
  cursor: move !important;
}

.ee-move-hint {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 10;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
  will-change: transform;
}

.ee-corner {
  position: absolute;
  z-index: 10;
  width: 16px;
  height: 16px;
  padding: 0;
  transform: translate(-50%, -50%);
}

.ee-corner.static {
  pointer-events: none;
}

.ee-corner.nwse {
  cursor: nwse-resize !important;
}

.ee-corner.nesw {
  cursor: nesw-resize !important;
}

.ee-corner i {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  box-sizing: border-box;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(0, 0, 0, 0.5);
  background: #fff;
  pointer-events: none;
}

/* 选区卡片 */
.ee-card {
  position: absolute;
  z-index: 20;
  box-sizing: border-box;
  border: 1px solid var(--ee-border);
  background: var(--ee-panel);
  box-shadow: var(--ee-shadow);
  pointer-events: auto;
}

.ee-bubble {
  border-radius: 16px 16px 16px 2px;
}

.ee-status-card {
  min-height: 46px;
  padding: 8px;
  width: fit-content;
}

.ee-status-card.failed {
  width: 222px;
}

.ee-recognizing {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  white-space: nowrap;
}

.ee-failed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ee-failed span {
  color: var(--ee-text-muted);
}

.ee-ghost-btn {
  align-self: flex-end;
  padding: 4px 8px;
  border-radius: 8px;
}

.ee-ghost-btn:hover {
  background: var(--ee-hover);
}

.ee-spinner {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid var(--ee-text-muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ee-spin 0.8s linear infinite;
}

.ee-spinner.large {
  width: 18px;
  height: 18px;
  border-color: var(--ee-text);
  border-top-color: transparent;
}

@keyframes ee-spin {
  to { transform: rotate(360deg); }
}

.ee-action-card {
  height: 46px;
  width: max-content;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.ee-action-card.wide {
  min-width: 222px;
}

.ee-subject {
  position: relative;
  flex-shrink: 0;
}

.ee-subject-tag {
  height: 30px;
  width: max-content;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--ee-hover);
  flex-shrink: 0;
}

.ee-subject-tag:disabled {
  cursor: default !important;
}

.ee-subject-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 22px;
}

.ee-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.ee-chevron.open {
  transform: rotate(180deg);
}

.ee-thumb {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 5px;
  background: var(--ee-active);
  object-fit: cover;
}

.ee-thumb.small {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.ee-candidates {
  position: absolute;
  left: 0;
  top: 100%;
  z-index: 40;
  width: max-content;
  max-height: 240px;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--ee-border);
  border-radius: 12px;
  background: var(--ee-panel);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.ee-candidates button {
  height: 32px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 8px;
  white-space: nowrap;
  text-align: left;
  opacity: 0.6;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.ee-candidates button:hover {
  background: var(--ee-hover);
  opacity: 1;
}

.ee-candidates button.selected {
  background: var(--ee-active);
  opacity: 1;
}

.ee-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ee-text-btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  border-radius: 8px;
  white-space: nowrap;
}

.ee-text-btn:hover,
.ee-round-icon:hover:not(:disabled) {
  background: var(--ee-hover);
}

.ee-move-card {
  width: 344px;
  height: 46px;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.ee-move-input,
.ee-modify-input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: none !important;
  box-shadow: none !important;
  background: transparent;
  color: var(--ee-text);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
}

.ee-move-input {
  height: 32px;
  padding: 0 8px;
}

.ee-move-input::placeholder,
.ee-modify-input::placeholder {
  color: var(--ee-text-disabled);
}

.ee-round-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.ee-round-icon:disabled {
  opacity: 0.4;
}

.ee-primary-pill {
  height: 32px;
  min-width: 60px;
  flex-shrink: 0;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--ee-invert-bg) !important;
  color: var(--ee-invert-text) !important;
  font-size: 13px;
}

.ee-primary-pill:hover:not(:disabled) {
  background: var(--ee-invert-hover) !important;
}

.ee-primary-pill:disabled {
  opacity: 0.4;
}

.ee-modify-card {
  width: 344px;
  display: flex;
}

.ee-modify-card.compact {
  height: 46px;
  align-items: center;
}

.ee-modify-card.expanded,
.ee-modify-card.uploaded {
  flex-direction: column;
  border-radius: 16px;
}

.ee-modify-card.expanded {
  height: 114px;
}

.ee-modify-card.uploaded {
  height: 186px;
}

.ee-reference-row {
  height: 80px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding: 12px 16px 0;
  box-sizing: border-box;
}

.ee-reference-preview {
  position: relative;
  width: 56px;
  height: 68px;
}

.ee-reference-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px;
}

.ee-reference-preview button {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6) !important;
  color: #fff !important;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ee-reference-preview:hover button,
.ee-reference-preview button:focus-visible {
  opacity: 1;
}

.ee-modify-body {
  position: relative;
  min-height: 0;
  display: flex;
}

.compact .ee-modify-body {
  flex: 1;
  align-items: center;
  padding: 0 8px;
}

.expanded .ee-modify-body {
  flex: 1;
  align-items: flex-start;
  padding: 12px 16px;
}

.uploaded .ee-modify-body {
  height: 66px;
  flex-shrink: 0;
  align-items: flex-start;
  padding: 8px 16px;
  box-sizing: border-box;
}

.ee-subject-tag.static {
  cursor: default;
}

.ee-modify-input {
  resize: none;
  padding: 4px 8px;
}

.compact .ee-modify-input {
  height: 22px;
  padding: 0 8px;
  overflow: hidden;
  white-space: nowrap;
}

.expanded .ee-modify-input {
  min-height: 44px;
  align-self: stretch;
}

.uploaded .ee-modify-input {
  height: 30px;
  overflow: hidden;
}

.ee-draft-error {
  position: absolute;
  left: 16px;
  top: 58px;
  color: var(--ee-danger);
  font-size: 12px;
  line-height: 18px;
}

.ee-draft-error.uploaded {
  top: 38px;
}

.ee-modify-footer {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 8px;
}

.ee-upload {
  position: relative;
}

.ee-upload-menu {
  position: absolute;
  left: 0;
  top: 100%;
  z-index: 30;
  width: 168px;
  padding-top: 4px;
}

.ee-upload-menu-inner {
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid var(--ee-border);
  border-radius: 16px;
  background: var(--ee-panel);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.ee-upload-menu-inner button {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 14px;
  text-align: left;
}

.ee-upload-menu-inner button:hover:not(:disabled) {
  background: var(--ee-hover);
}

.ee-upload-menu-inner button:disabled {
  opacity: 0.4;
}

.ee-footer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ee-notice {
  position: absolute;
  left: 50%;
  top: 8px;
  z-index: 30;
  transform: translateX(-50%);
  padding: 6px 12px;
  border: 1px solid var(--ee-border);
  border-radius: 8px;
  background: var(--ee-panel);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
}

/* 编辑内容面板 */
.ee-panel {
  position: absolute;
  left: 50%;
  top: calc(100% + 12px);
  width: 400px;
  box-sizing: border-box;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ee-border);
  border-radius: 12px;
  background: var(--ee-panel);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
  pointer-events: auto;
  transition: height 0.18s ease;
}

.ee-panel-head {
  height: 50px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
}

.ee-panel-head.filled {
  height: 44px;
}

.ee-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ee-text-secondary);
}

.ee-panel-count {
  color: var(--ee-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.ee-records {
  max-height: 96px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 10px;
  overflow-y: auto;
}

.ee-record {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 22px;
}

.ee-record:hover {
  background: var(--ee-hover);
}

.ee-record-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  text-align: left;
}

.ee-record-main:disabled {
  cursor: default !important;
}

.ee-record-tag {
  height: 24px;
  max-width: 112px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  box-sizing: border-box;
  border: 0.5px solid var(--ee-border);
  border-radius: 8px;
}

.ee-truncate,
.ee-record-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ee-record-text {
  flex: 1;
}

.ee-record-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ee-record-actions button {
  display: flex;
  padding: 4px;
  border-radius: 4px;
  opacity: 0;
}

.ee-record-actions button.muted {
  color: var(--ee-text-muted);
}

.ee-record:hover .ee-record-actions button,
.ee-record-actions button:focus-visible {
  opacity: 1;
}

.ee-record-actions button:hover {
  background: var(--ee-hover);
  color: var(--ee-text);
}

.ee-submit-error {
  padding: 0 16px;
  color: var(--ee-danger);
  font-size: 12px;
  line-height: 18px;
}

.ee-panel-footer {
  height: 50px;
  flex-shrink: 0;
  margin-top: auto;
  display: flex;
  gap: 8px;
  padding: 6px 12px 12px;
  box-sizing: border-box;
}

.ee-cancel-btn,
.ee-generate-btn {
  height: 32px;
  flex: 1;
  border-radius: 8px;
  font-size: 13px;
}

.ee-cancel-btn {
  background: var(--ee-hover) !important;
}

.ee-cancel-btn:hover:not(:disabled) {
  background: var(--ee-active) !important;
}

.ee-cancel-btn:disabled {
  opacity: 0.5;
}

.ee-generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--ee-invert-bg) !important;
  color: var(--ee-invert-text) !important;
}

.ee-generate-btn:hover:not(:disabled) {
  background: var(--ee-invert-hover) !important;
}

.ee-generate-btn:disabled {
  opacity: 0.4;
}
</style>
