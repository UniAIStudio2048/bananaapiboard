import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowShare.vue'), 'utf8')
const nodeSource = readFileSync(join(__dirname, '..', 'components', 'canvas', 'WorkflowShareNode.vue'), 'utf8')

assert.match(source, /normalizeWorkflowSharePayload/)
assert.match(source, /shareData\.canClone/)
assert.match(source, /v-for="warning in warnings"/)
assert.match(source, /noindex, nofollow, noarchive/)
assert.match(source, /no-referrer/)
assert.doesNotMatch(source, /components\/canvas\/nodes\//)
assert.doesNotMatch(source, /CanvasBoard|SaveWorkflowDialog|useCanvasStore/)
assert.match(nodeSource, /white-space:\s*pre-wrap/)
assert.match(nodeSource, /媒体仅在原工作区可用/)
assert.match(nodeSource, /公开参数与结果/)

console.log('WorkflowShare contract tests passed')
