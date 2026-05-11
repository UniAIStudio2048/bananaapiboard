import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowPanel.vue'), 'utf8')

assert.match(
  source,
  /const workflowsTotal = ref\(0\)/,
  'Workflow panel should track the API total for the selected space'
)

assert.match(
  source,
  /workflowsTotal\.value = Number\(wfResult\.pagination\?\.total \?\? workflows\.value\.length\)/,
  'Workflow panel should derive saved workflow counts from the selected-space workflow API result'
)

assert.doesNotMatch(
  source,
  /quota\.current_workflows/,
  'Workflow panel should not display personal quota workflow counts as selected-space saved workflow counts'
)

assert.match(
  source,
  /<span class="quota-used">\{\{ workflowsTotal \}\}<\/span>/,
  'Workflow panel quota bar should show the selected-space saved workflow total'
)

console.log('WorkflowPanel space count source tests passed')
