import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowPanel.vue'), 'utf8')

assert.match(source, /WorkflowShareDialog/)
assert.match(source, /getWorkflowShareStatus/)
assert.match(source, /openWorkflowShare/)
assert.match(source, /@click\.stop="openWorkflowShare\(workflow\)"/)

console.log('WorkflowPanel workflow-share contract tests passed')
