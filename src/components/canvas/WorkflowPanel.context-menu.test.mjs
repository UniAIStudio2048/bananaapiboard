import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowPanel.vue'), 'utf8')

assert.match(
  source,
  /function handleWorkflowContextMenu\(event, workflow, type\)/,
  'WorkflowPanel should expose a shared workflow context-menu handler'
)

assert.match(
  source,
  /@contextmenu\.prevent\.stop="handleWorkflowContextMenu\(\$event, \{ \.\.\.workflow, project_id: group\.id \}, 'saved'\)"/,
  'Saved workflows should open actions from the context menu'
)

assert.match(
  source,
  /class="workflow-context-menu"[\s\S]*?class="context-menu-item"[\s\S]*?复制工作流 ID/,
  'The context menu should include an icon-and-label workflow ID copy action'
)

assert.match(
  source,
  /function handleRenameWorkflow\(workflow\)/,
  'WorkflowPanel should expose a workflow rename handler'
)

assert.match(source, /class="workflow-rename-input"/, 'Workflow rename should edit the title in place')
assert.doesNotMatch(source, /window\.prompt\(/, 'Workflow rename should not use a browser prompt')

assert.match(
  source,
  /handleWorkflowContextAction\('rename'\)[\s\S]*?重命名工作流/,
  'The context menu should include a workflow rename action'
)

assert.match(
  source,
  /class="item-meta workflow-meta"[\s\S]*?class="workflow-time"/,
  'Saved workflow metadata should keep the save time in a dedicated second row'
)

const savedItemStart = source.indexOf("handleWorkflowContextMenu($event, { ...workflow, project_id: group.id }, 'saved')")
const savedItemEnd = source.indexOf('class="workflow-description-editor"', savedItemStart)
const savedItemSource = source.slice(savedItemStart, savedItemEnd)
assert.doesNotMatch(savedItemSource, /class="action-btn load-btn"/, 'Saved workflow loading should not be an inline action')
assert.doesNotMatch(savedItemSource, /class="action-btn move-btn"/, 'Saved workflow move/copy should not be inline actions')
assert.match(savedItemSource, /class="action-btn delete-btn"/, 'Saved workflow delete should remain visible')

const actionStyles = source.match(/\.item-actions\s*\{([\s\S]*?)\n\}/)?.[1] || ''
assert.match(actionStyles, /opacity:\s*0/, 'Delete action should be hidden until the workflow is hovered')
assert.match(source, /\.workflow-item:hover \.item-actions/, 'Delete action should appear when the workflow is hovered')

console.log('WorkflowPanel context menu source tests passed')
