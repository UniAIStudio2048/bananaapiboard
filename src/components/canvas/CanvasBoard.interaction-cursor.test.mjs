import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('./CanvasBoard.vue', import.meta.url), 'utf8')

test('canvas exposes selection and panning cursor states for both interaction modes', () => {
  assert.match(source, /const isSelectionModifierPressed = ref\(false\)/)
  assert.match(source, /event\.key === 'Shift' \|\| event\.key === 'Control'/)
  assert.match(source, /'selection-cursor':\s*interactionMode === 'infinite-canvas' \|\| isSelectionModifierPressed/)
  assert.match(source, /'is-panning':\s*isPanning/)
  assert.match(source, /'pan-ready':\s*isSpacePressed/)
})

test('space panning disables Vue Flow box selection', () => {
  assert.match(source, /:selection-key-code="isSpacePressed \? false : selectionKeyCodeConfig"/)
})

test('space hand cursor overrides canvas child cursors until keyup', () => {
  assert.match(source, /\.canvas-board\.pan-ready :deep\(\.vue-flow__pane \*\)[\s\S]{0,120}cursor:\s*grab !important/)
  assert.match(source, /if \(event\.key === ' '\)[\s\S]{0,180}isSpacePressed\.value = false/)
})

test('selection uses a slim plane cursor while canvas panning uses hand cursors', () => {
  assert.match(source, /\.canvas-board\.selection-cursor[\s\S]*cursor:\s*url\("data:image\/svg\+xml/)
  assert.match(source, /\.canvas-board\.pan-ready[\s\S]*cursor:\s*grab/)
  assert.match(source, /\.canvas-board\.is-panning[\s\S]*cursor:\s*grabbing/)
})
