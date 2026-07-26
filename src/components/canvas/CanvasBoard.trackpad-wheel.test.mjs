import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

test('trackpad wheel panning uses both horizontal and vertical deltas', () => {
  const wheelHandler = source.match(
    /function handleWheelInner\(event,\s*forceZoom\s*=\s*false\) \{[\s\S]*?\n\}\n\n\/\/ 🚀 自定义节点类型映射/
  )?.[0] || ''

  assert.match(wheelHandler, /event\.deltaX/, 'horizontal trackpad movement should pan the canvas horizontally')
  assert.match(wheelHandler, /event\.deltaY/, 'vertical trackpad movement should pan the canvas vertically')
  assert.match(wheelHandler, /const\s+TRACKPAD_PAN_SPEED_SCALE\s*=\s*1\s*\/\s*3/, 'trackpad panning should be slowed to one third')
  assert.match(wheelHandler, /Math\.abs\(event\.deltaX\s*\|\|\s*0\)\s*>\s*0/, 'horizontal delta should select trackpad-style pan')
  assert.match(wheelHandler, /x:\s*viewport\.x\s*-\s*event\.deltaX\s*\*\s*TRACKPAD_PAN_SPEED_SCALE/, 'deltaX should pan at one third speed')
  assert.match(wheelHandler, /y:\s*viewport\.y\s*-\s*event\.deltaY\s*\*\s*TRACKPAD_PAN_SPEED_SCALE/, 'deltaY should pan at one third speed during two-axis trackpad pan')
  assert.match(wheelHandler, /const\s+dy\s*=\s*event\.deltaY\s*>\s*0\s*\?\s*-PAN_SPEED\s*:\s*PAN_SPEED/, 'pure vertical wheel panning should keep the existing speed')
})

test('modified wheel is captured globally and routed to canvas zoom', () => {
  assert.match(source, /function handleGlobalWheel\(event\)\s*\{[\s\S]*?event\.ctrlKey[\s\S]*?event\.metaKey[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?handleWheel\(event,\s*\{\s*forceZoom:\s*true\s*\}\)/)
  assert.match(source, /function handleWheel\(event,\s*\{\s*forceZoom\s*=\s*false\s*\}\s*=\s*\{\}\)/)
  assert.match(source, /function handleWheelInner\(event,\s*forceZoom\s*=\s*false\)/)
  assert.match(source, /const\s+shouldZoom\s*=\s*forceZoom\s*\|\|\s*\(isInfiniteCanvas\s*\?\s*isCtrl\s*:\s*!isCtrl\)/)
  assert.match(source, /window\.addEventListener\(['"]wheel['"],\s*handleGlobalWheel,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/)
  assert.match(source, /window\.removeEventListener\(['"]wheel['"],\s*handleGlobalWheel,\s*\{\s*capture:\s*true\s*\}\)/)
})
