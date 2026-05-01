import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(
  source,
  /:only-render-visible-elements="true"/,
  'CanvasBoard should let Vue Flow skip off-screen nodes and edges'
)

assert.match(
  source,
  /const isViewportMoving = ref\(false\)/,
  'CanvasBoard should expose a viewport-moving state for pan and zoom quality downgrade'
)

assert.match(
  source,
  /provide\('isCanvasViewportMoving', isViewportMoving\)/,
  'CanvasBoard should provide viewport-moving state to media-heavy nodes'
)

assert.match(
  source,
  /markViewportMoving\(\)/,
  'CanvasBoard should mark viewport movement from viewport-change events'
)

console.log('CanvasBoard performance tests passed')
