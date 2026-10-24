import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

test('ordinary canvas edges render the layered white base and cyan flowing overlay', () => {
  assert.match(source, /const canvasEdgeFlowPaths = ref\(\[\]\)/)
  assert.match(source, /function readCanvasEdgePaths\(/)
  assert.match(source, /class="canvas-edge-flow-base"/)
  assert.match(source, /class="canvas-edge-flow-path"/)
  assert.match(source, /stroke: rgba\(255, 255, 255, 0\.72\)/)
  assert.match(source, /stroke: #22d3ee/)
  assert.match(source, /animation: connectionGlowFlow 2\.8s linear infinite/)
})
