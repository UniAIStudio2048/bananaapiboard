import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const viewSource = readFileSync(join(__dirname, 'WorkflowShare.vue'), 'utf8')
const apiSource = readFileSync(join(__dirname, '..', 'api', 'canvas', 'workflowShare.js'), 'utf8')

assert.match(viewSource, /cloneIntentKey = ref\(''\)/)
assert.match(viewSource, /ensureCloneIntentKey\(\)/)
assert.match(viewSource, /clonePublicWorkflowShare\(token\.value, shareData\.value\.sourceRevision, idempotencyKey\)/)
assert.match(viewSource, /if \(error\?\.status === 409\) \{\s*cloneIntentKey\.value = ''/)
assert.match(apiSource, /clonePublicWorkflowShare\(token, sourceRevision, idempotencyKey = createIdempotencyKey\(\)\)/)

console.log('WorkflowShare clone intent contract tests passed')
