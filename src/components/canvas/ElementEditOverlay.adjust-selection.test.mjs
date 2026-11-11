// 元素编辑：框选完成后，选框本身可拖动移动、四角可缩放（"移动"操作仍拖动目标位置）
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ElementEditOverlay.vue'), 'utf8')

test('box selections are adjustable unless the move action is chosen', () => {
  assert.match(
    source,
    /const canAdjustSource = computed\(\(\) => draft\.value\?\.source\.type === 'box' && draft\.value\.action !== 'move' && !draft\.value\.recognizing && !props\.busy\)/
  )
})

test('selection drag area and corners are interactive for adjustable box selections', () => {
  const handles = source.match(/<!-- 选区角点、拖动与缩放 -->[\s\S]*?<\/template>\s*<\/template>/)
  assert.ok(handles, 'handle template should exist')
  const block = handles[0]
  assert.match(block, /v-if="draft\.action === 'move' \|\| canAdjustSource"/)
  assert.match(block, /startTargetGesture\(\$event, canAdjustSource \? 'moveSource' : 'moveTarget'\)/)
  assert.match(block, /v-if="canAdjustSource \|\| \(draft\.action === 'move' && draft\.target\)"/)
  assert.match(block, /startTargetGesture\(\$event, canAdjustSource \? 'resizeSource' : 'resizeTarget', corner\)/)
  assert.match(block, /v-if="draft\.action === 'move' && !draft\.target && !preview\.targetRect"/, 'move hint stays specific to the move action')
})

test('source gestures preview and commit the selection rect within the image', () => {
  assert.match(source, /function isSourceGesture\(kind\)/)
  const start = source.match(/function startTargetGesture\(event, kind, corner\) \{[\s\S]*?\n\}/)
  assert.ok(start)
  assert.match(start[0], /if \(isSourceGesture\(kind\)\) preview\.sourceRect = \{ \.\.\.handleRect\.value \}/)

  const update = source.match(/function updateGesture\(point\) \{[\s\S]*?\n\}/)
  assert.ok(update)
  assert.match(update[0], /gesture\.kind === 'moveSource'[\s\S]*?preview\.sourceRect = translateRect\(gesture\.rect, point\.x - gesture\.start\.x, point\.y - gesture\.start\.y\)/)
  assert.match(update[0], /gesture\.kind === 'resizeSource'[\s\S]*?preview\.sourceRect = resizeRect\(gesture\.rect, point, gesture\.corner, \{[\s\S]*?ELEMENT_EDIT_LIMITS\.minBoxPx \/ mediaPx\.value\.width/)

  const up = source.match(/function stagePointerUp\(event\) \{[\s\S]*?\n\}/)
  assert.ok(up)
  assert.match(up[0], /else if \(isSourceGesture\(current\.kind\)\) \{[\s\S]*?draft\.value\.source\.rect = clampRect\(rect\)/)
})
