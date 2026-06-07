import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

test('trackpad wheel panning uses both horizontal and vertical deltas', () => {
  const wheelHandler = source.match(
    /function handleWheelInner\(event\) \{[\s\S]*?\n\}\n\n\/\/ 🚀 自定义节点类型映射/
  )?.[0] || ''

  assert.match(wheelHandler, /event\.deltaX/, 'horizontal trackpad movement should pan the canvas horizontally')
  assert.match(wheelHandler, /event\.deltaY/, 'vertical trackpad movement should pan the canvas vertically')
  assert.match(wheelHandler, /Math\.abs\(event\.deltaX\s*\|\|\s*0\)\s*>\s*0/, 'horizontal delta should select trackpad-style pan')
  assert.match(wheelHandler, /x:\s*viewport\.x\s*-\s*event\.deltaX/, 'deltaX should update viewport.x')
  assert.match(wheelHandler, /y:\s*viewport\.y\s*-\s*event\.deltaY/, 'deltaY should update viewport.y during two-axis trackpad pan')
  assert.match(wheelHandler, /const\s+dy\s*=\s*event\.deltaY\s*>\s*0\s*\?\s*-PAN_SPEED\s*:\s*PAN_SPEED/, 'pure vertical wheel panning should keep the existing speed')
})
