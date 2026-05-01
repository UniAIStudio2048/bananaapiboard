import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowPanel.vue'), 'utf8')

assert.match(
  source,
  /function toggleHistoryWorkflow\(workflow\) \{[\s\S]*?selectedHistoryId\.value = selectedHistoryId\.value === workflow\.id \? null : workflow\.id[\s\S]*?\n\}/,
  'History workflow single-click should toggle expansion so clicking selected non-editor area collapses it'
)

assert.match(
  source,
  /function clearSelectedWorkflowDetails\(\) \{[\s\S]*?selectedId\.value = null[\s\S]*?selectedHistoryId\.value = null[\s\S]*?\n\}/,
  'Workflow panel should expose a shared outside-click clearer for selected workflow details'
)

assert.match(
  source,
  /class="column-content"[\s\S]*?@click="clearSelectedWorkflowDetails"[\s\S]*?class="workflow-item history-item"[\s\S]*?@click\.stop="toggleHistoryWorkflow\(workflow\)"[\s\S]*?@dblclick="handleLoadHistoryWorkflow\(workflow\)"/,
  'History list should clear on column background clicks, stop item clicks, and keep double-click loading'
)

assert.match(
  source,
  /class="history-description-editor"[\s\S]*?@click\.stop[\s\S]*?@dblclick\.stop/,
  'History description editor should not collapse or load when edited'
)

console.log('WorkflowPanel selection behavior tests passed')
