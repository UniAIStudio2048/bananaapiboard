import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ELEMENT_EDIT_LIMITS,
  clampRect,
  rectFromPoints,
  translateRect,
  centerRectAt,
  resizeRect,
  containRect,
  closeStroke,
  brushBounds,
  sourceBounds,
  boxLargeEnough,
  normalizeCandidateBox,
  validateElementEdits,
  buildElementEditPrompt
} from './canvasElementEditGeometry.js'

function assertRectClose(actual, expected) {
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} != ${expected[key]}`)
}

test('limits match the reference editor', () => {
  assert.deepEqual(ELEMENT_EDIT_LIMITS, { maxCount: 10, brushMin: 1, brushMax: 10, brushDefault: 3, minBoxPx: 12 })
})

test('clampRect keeps a normalized rect inside the image', () => {
  assert.deepEqual(clampRect({ x: -0.2, y: 0.9, width: 0.5, height: 0.4 }), { x: 0, y: 0.9, width: 0.5, height: 0.09999999999999998 })
})

test('rectFromPoints normalizes drag direction', () => {
  assert.deepEqual(rectFromPoints({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, width: 0.39999999999999997, height: 0.4 })
})

test('translateRect and centerRectAt keep size and stay in bounds', () => {
  const rect = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }
  assert.deepEqual(translateRect(rect, 0.9, -0.5), { x: 0.7, y: 0, width: 0.3, height: 0.2 })
  assert.deepEqual(centerRectAt(rect, { x: 0.5, y: 0.5 }), { x: 0.35, y: 0.4, width: 0.3, height: 0.2 })
})

test('resizeRect anchors the opposite corner and enforces a minimum size', () => {
  const rect = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }
  const se = resizeRect(rect, { x: 0.9, y: 0.7 }, 'se', { width: 0.05, height: 0.05 })
  assertRectClose(se, { x: 0.2, y: 0.2, width: 0.7, height: 0.5 })
  const nw = resizeRect(rect, { x: 0.59, y: 0.59 }, 'nw', { width: 0.05, height: 0.05 })
  assert.ok(Math.abs(nw.width - 0.05) < 1e-9 && Math.abs(nw.height - 0.05) < 1e-9)
})

test('containRect fits the natural image inside the display box', () => {
  assert.deepEqual(containRect({ width: 200, height: 100 }, { width: 1000, height: 1000 }), { left: 50, top: 0, width: 100, height: 100 })
})

test('closeStroke appends the first point once for strokes of 3+ points', () => {
  const stroke = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
  assert.deepEqual(closeStroke(stroke).at(-1), { x: 0, y: 0 })
  assert.equal(closeStroke(closeStroke(stroke)).length, 4)
  assert.equal(closeStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length, 2)
})

test('brushBounds expands by half the brush width in pixels', () => {
  const bounds = brushBounds([[{ x: 0.5, y: 0.5 }]], 0.1, { width: 100, height: 200 })
  assertRectClose(bounds, { x: 0.45, y: 0.475, width: 0.1, height: 0.05 })
})

test('sourceBounds handles point, box and brush sources', () => {
  assert.deepEqual(sourceBounds({ type: 'box', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }), { x: 0.1, y: 0.1, width: 0.2, height: 0.2 })
  assert.equal(sourceBounds({ type: 'point', point: { x: 0.1, y: 0.1 } }), null)
  assert.ok(sourceBounds({ type: 'brush', brushSize: 0.02, strokes: [[{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }]] }))
})

test('boxLargeEnough requires 12 display pixels on each side', () => {
  assert.equal(boxLargeEnough({ width: 0.1, height: 0.1 }, { width: 120, height: 120 }), true)
  assert.equal(boxLargeEnough({ width: 0.09, height: 0.1 }, { width: 120, height: 120 }), false)
})

test('normalizeCandidateBox accepts 0-1000 arrays and normalized objects', () => {
  assert.deepEqual(normalizeCandidateBox([100, 200, 600, 1000]), { x: 0.1, y: 0.2, width: 0.5, height: 0.8 })
  assert.deepEqual(normalizeCandidateBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }), { x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
  assert.equal(normalizeCandidateBox([5, 5, 5, 9]), null)
})

test('validateElementEdits reports missing prompt, missing target and tiny selections', () => {
  const media = { width: 1000, height: 1000 }
  assert.deepEqual(validateElementEdits([], media), { valid: false, reason: 'empty' })
  assert.deepEqual(validateElementEdits([{ action: 'modify', prompt: ' ', source: { type: 'box', rect: { x: 0, y: 0, width: 0.5, height: 0.5 } } }], media), { valid: false, reason: 'promptRequired' })
  assert.deepEqual(validateElementEdits([{ action: 'move', source: { type: 'box', rect: { x: 0, y: 0, width: 0.5, height: 0.5 } } }], media), { valid: false, reason: 'targetRequired' })
  assert.deepEqual(validateElementEdits([{ action: 'modify', prompt: 'x', source: { type: 'box', rect: { x: 0, y: 0, width: 0.005, height: 0.5 } } }], media), { valid: false, reason: 'geometry' })
  assert.deepEqual(validateElementEdits([{ action: 'modify', prompt: 'x', source: { type: 'box', rect: { x: 0, y: 0, width: 0.2, height: 0.2 } } }], media), { valid: true })
})

test('buildElementEditPrompt reproduces the structured edit template', () => {
  const edits = [
    { action: 'modify', prompt: '把头发改成黑色长直发', source: { type: 'point', point: { x: 0.5, y: 0.2 }, subjectName: '人', bbox: { x: 0.0625, y: 0.0357, width: 0.875, height: 0.9643 } } },
    { action: 'move', prompt: '', source: { type: 'box', rect: { x: 0.227, y: 0.682, width: 0.522, height: 0.285 } }, target: { x: 0.532, y: 0.326 } },
    { action: 'modify', prompt: '加一盆绿植', source: { type: 'brush', brushSize: 0.027, strokes: [[{ x: 0.82, y: 0.104 }, { x: 0.86, y: 0.326 }, { x: 0.9, y: 0.549 }, { x: 0.82, y: 0.104 }]] } }
  ]
  const prompt = buildElementEditPrompt(edits, new Map(), true, { width: 1, height: 1 })
  assert.equal(prompt, [
    'Edit Image 1 only. Apply the following edits in order.',
    'Preserve all unmentioned content, identities, composition, lighting and style.',
    '',
    'EDIT 1 MODIFY',
    'selection_type=point',
    'subject="人"',
    'bbox_percent=[6.3, 3.6, 93.8, 100.0]',
    'instruction="把头发改成黑色长直发"',
    '',
    'EDIT 2 MOVE',
    'selection_type=box',
    'bbox_percent=[22.7, 68.2, 74.9, 96.7]',
    'source_bbox_percent=[22.7, 68.2, 74.9, 96.7]',
    'target_center_percent=[53.2, 32.6]',
    'instruction="Move the selected content without duplicating it or leaving a ghost. Preserve its appearance. Preserve its size."',
    '',
    'EDIT 3 MODIFY',
    'selection_type=brush',
    'bbox_percent=[82.0, 10.4, 90.0, 54.9]',
    'brush_width_percent=2.7',
    'closed_paths_percent=[[[82.0, 10.4], [86.0, 32.6], [90.0, 54.9], [82.0, 10.4]]]',
    'instruction="加一盆绿植"'
  ].join('\n'))
})

test('buildElementEditPrompt describes resized moves, extra notes and reference images', () => {
  const reference = { url: 'https://cdn/ref.png', name: '红色帽子' }
  const edits = [
    {
      action: 'move',
      prompt: '放到桌面上',
      source: { type: 'box', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
      target: { x: 0.6, y: 0.6 },
      targetRect: { x: 0.45, y: 0.45, width: 0.3, height: 0.3 }
    },
    { action: 'modify', prompt: '换成参考图里的帽子', referenceImage: reference, source: { type: 'box', rect: { x: 0.5, y: 0, width: 0.2, height: 0.2 } } },
    { action: 'modify', prompt: '去掉', source: { type: 'brush', brushSize: 0.01, strokes: [[{ x: 0.1, y: 0.8 }, { x: 0.2, y: 0.9 }]] } }
  ]
  const prompt = buildElementEditPrompt(edits, new Map([[reference.url, 2]]), false)
  assert.match(prompt, /target_bbox_percent=\[45\.0, 45\.0, 75\.0, 75\.0\]/)
  assert.match(prompt, /Scale the moved content to match the target bounding box dimensions\./)
  assert.match(prompt, /additional_instruction="放到桌面上"/)
  assert.match(prompt, /reference_image=Image 2\nreference_name="红色帽子"/)
  assert.match(prompt, /selection_approximation=bbox/)
  assert.doesNotMatch(prompt, /closed_paths_percent/)
})
