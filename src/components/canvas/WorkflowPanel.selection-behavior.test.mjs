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
  /function clearWorkflowSelectionClickTimer\(\) \{[\s\S]*?clearTimeout\(workflowSelectionClickTimer\)[\s\S]*?workflowSelectionClickTimer = null[\s\S]*?\n\}/,
  'Workflow panel should be able to cancel delayed single-click selection before double-click loading'
)

assert.match(
  source,
  /function handleWorkflowClick\(workflow\) \{[\s\S]*?clearWorkflowSelectionClickTimer\(\)[\s\S]*?workflowSelectionClickTimer = setTimeout\(\(\) => \{[\s\S]*?toggleWorkflow\(workflow\)[\s\S]*?\}, 200\)[\s\S]*?\n\}/,
  'Saved workflow single-click selection should be delayed so double-click can load before DOM changes'
)

assert.match(
  source,
  /function handleHistoryWorkflowClick\(workflow\) \{[\s\S]*?clearWorkflowSelectionClickTimer\(\)[\s\S]*?workflowSelectionClickTimer = setTimeout\(\(\) => \{[\s\S]*?toggleHistoryWorkflow\(workflow\)[\s\S]*?\}, 200\)[\s\S]*?\n\}/,
  'History workflow single-click selection should be delayed so double-click can load before DOM changes'
)

assert.match(
  source,
  /function handleLoadMyWorkflowFromDoubleClick\(workflow\) \{[\s\S]*?clearWorkflowSelectionClickTimer\(\)[\s\S]*?handleLoadMyWorkflow\(workflow\)[\s\S]*?\n\}/,
  'Saved workflow double-click loading should cancel pending single-click selection'
)

assert.match(
  source,
  /function handleLoadHistoryWorkflowFromDoubleClick\(workflow\) \{[\s\S]*?clearWorkflowSelectionClickTimer\(\)[\s\S]*?handleLoadHistoryWorkflow\(workflow\)[\s\S]*?\n\}/,
  'History workflow double-click loading should cancel pending single-click selection'
)

assert.match(
  source,
  /class="column-content"[\s\S]*?@click="clearSelectedWorkflowDetails"[\s\S]*?class="workflow-item history-item"[\s\S]*?@click\.stop="handleHistoryWorkflowClick\(workflow\)"[\s\S]*?@dblclick\.stop\.prevent="handleLoadHistoryWorkflowFromDoubleClick\(workflow\)"/,
  'History list should clear on column background clicks, stop item clicks, delay selection, and prevent double-click default while loading'
)

assert.match(
  source,
  /class="history-description-editor"[\s\S]*?@click\.stop[\s\S]*?@dblclick\.stop/,
  'History description editor should not collapse or load when edited'
)

console.log('WorkflowPanel selection behavior tests passed')
