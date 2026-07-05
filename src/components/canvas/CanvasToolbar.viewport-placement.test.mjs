import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasToolbar.vue'), 'utf8')

const createNodeMatch = source.match(/function createNode\(nodeType\) \{([\s\S]*?)\n\}/)
assert.ok(createNodeMatch, 'CanvasToolbar should define createNode')
assert.match(
  createNodeMatch[1],
  /getVisibleCanvasFlowPosition\(\)/,
  'toolbar node creation should place nodes in the current visible canvas viewport'
)
assert.doesNotMatch(
  createNodeMatch[1],
  /x:\s*300|window\.innerHeight\s*\/\s*2\s*-\s*100/,
  'toolbar node creation must not use fixed flow coordinates that can be off-screen after panning or loading workflows'
)

const handleUploadMatch = source.match(/function handleUpload\(\) \{([\s\S]*?)\n\}/)
assert.ok(handleUploadMatch, 'CanvasToolbar should define handleUpload')
assert.match(
  handleUploadMatch[1],
  /'toolbar',\s*null,\s*getVisibleCanvasFlowPosition\(\)/,
  'toolbar upload should pass a flow position so uploaded nodes appear in the visible viewport'
)

console.log('CanvasToolbar viewport placement tests passed')
