import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowList.vue'), 'utf8')

assert.match(source, /WorkflowShareDialog/)
assert.match(source, /getWorkflowShareStatus/)
assert.match(source, /openWorkflowShare/)
assert.match(source, /share_mode|shareModes/)
assert.match(source, /@click\.stop="openWorkflowShare\(workflow\)"/)

console.log('WorkflowList workflow-share contract tests passed')
