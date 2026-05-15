import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

test('ImageNode invalidates canvas history after image generation creates results', () => {
  assert.match(source, /function invalidateCanvasHistory\(\)/)
  assert.match(source, /canvas-history-invalidate/)
  assert.match(source, /canvasStore\.updateNodeData\(props\.id,\s*\{[\s\S]*?status: 'success'[\s\S]*?output: \{[\s\S]*?type: 'image'[\s\S]*?urls: allResults[\s\S]*?\}[\s\S]*?\}\)\s*[\r\n\s]*invalidateCanvasHistory\(\)/)
})
