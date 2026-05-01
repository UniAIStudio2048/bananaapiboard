import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

assert.match(source, /const isNodeSelectorOpen = ref\(false\)/, 'canvas store should define node selector open state')
assert.match(source, /const nodeSelectorPosition = ref\(\{ x: 0, y: 0 \}\)/, 'canvas store should define node selector screen position')
assert.match(source, /const nodeSelectorFlowPosition = ref\(null\)/, 'canvas store should define node selector flow position')
assert.match(source, /const nodeSelectorTrigger = ref\(null\)/, 'canvas store should define node selector trigger')
assert.match(source, /const triggerNodeId = ref\(null\)/, 'canvas store should define node selector trigger node id')

console.log('canvasStore node selector state tests passed')
