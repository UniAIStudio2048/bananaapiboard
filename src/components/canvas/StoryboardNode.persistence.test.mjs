import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'nodes/StoryboardNode.vue'), 'utf8')

assert.match(
  source,
  /function updateNodeData\(\)[\s\S]*canvasStore\.updateNodeData\(props\.id, data\)[\s\S]*emit\('update:data', data\)/,
  'StoryboardNode should persist local cell changes to the canvas store before emitting compatibility updates'
)

console.log('StoryboardNode persistence tests passed')
