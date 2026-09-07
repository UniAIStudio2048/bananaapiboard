import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

assert.match(source, /WorkflowShareDialog/)
assert.match(source, /openShareWorkflow/)
assert.match(source, /shareAfterSave/)
assert.match(source, /if \(shouldOpenShare\) openWorkflowShareDialog/)
assert.match(source, /@open-share="openShareWorkflow"/)
assert.match(source, /getWorkflowShareStatus/)
assert.match(source, /async function loadCurrentTeamWorkflowShareStatus\(\)/)
assert.match(source, /watch\(\s*\(\) => \[currentTeamWorkflow\.value\?\.id/s)
assert.match(source, /class="canvas-team-share-banner"/)
assert.match(source, /teamWorkflowShareNotice\.mode === 'clone'/)

console.log('Canvas workflow-share contract tests passed')
