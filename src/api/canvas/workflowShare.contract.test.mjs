import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'workflowShare.js'), 'utf8')

assert.match(source, /\/api\/canvas\/workflows\/\$\{encodeURIComponent\(workflowId\)\}\/share/)
assert.match(source, /method: 'PUT'/)
assert.match(source, /JSON\.stringify\(\{ mode, confirmed: true \}\)/)
assert.match(source, /getSharePath\(workflowId\)\}\-status/)
assert.match(source, /getSharePath\(workflowId\)\}\/reset/)
assert.match(source, /\/api\/workflow-shares\/\$\{encodeURIComponent\(token\)\}/)
assert.match(source, /'Idempotency-Key'/)
assert.match(source, /JSON\.stringify\(\{ sourceRevision \}\)/)
assert.doesNotMatch(source, /share\?[^'"`]*mode/)

console.log('workflowShare API contract tests passed')
