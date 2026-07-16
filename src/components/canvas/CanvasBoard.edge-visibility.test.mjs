import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  fileURLToPath(new URL('./CanvasBoard.vue', import.meta.url)),
  'utf8'
)

test('hidden edge mode applies to every canvas connection layer', () => {
  assert.match(source, /'edges-hidden':\s*isEdgeHidden/)
  assert.match(source, /\.canvas-board\.edges-hidden\s+:deep\(\.vue-flow__edge\)/)
  assert.match(source, /\.canvas-board\.edges-hidden\s+:deep\(\.vue-flow__connection-line\)/)
  assert.match(source, /\.canvas-board\.edges-hidden\s+\.connection-guide-line/)
  assert.match(source, /\.canvas-board\.edges-hidden\s+\.connection-guide-line\s*\{\s*display:\s*none;/)
})
