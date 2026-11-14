import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowList.vue'), 'utf8')

assert.match(source, /function getProjectCoverUrl\(project\)/, 'Project list should derive a cover URL for project cards')
assert.match(source, /function getWorkflowCoverUrl\(workflow\)/, 'Workflow list should derive a cover URL for workflow cards')
assert.match(source, /<video\s+v-if="getProjectCoverUrl\(project\) && isVideoCover\(getProjectCoverUrl\(project\)\)"/, 'Project cards should render a project video cover when available')
assert.match(source, /<img\s+v-else-if="getProjectCoverUrl\(project\)"/, 'Project cards should render a project image cover when available')
assert.match(source, /<video\s+v-if="getWorkflowCoverUrl\(workflow\) && isVideoCover\(getWorkflowCoverUrl\(workflow\)\)"/, 'Workflow cards should render a workflow video cover when available')
assert.match(source, /<img\s+v-else-if="getWorkflowCoverUrl\(workflow\)"/, 'Workflow cards should render a workflow image cover when available')

assert.match(source, /@dblclick\.stop="startInlineRename\('project', project\)"/, 'Project card titles should support double-click rename')
assert.match(source, /@dblclick\.stop="startInlineRename\('workflow', workflow\)"/, 'Workflow card titles should support double-click rename')
assert.match(source, /@dblclick="currentProject \? startInlineRename\('project', currentProject\) : null"/, 'Project page title should support double-click rename')
assert.match(source, /renameWorkflow\(id, trimmed\)/, 'Workflow inline rename should persist through the workflow rename API')

assert.match(source, /const totalWorkflowPages = computed\(\(\) => \{/, 'Workflow list should compute total pages from API total when totalPages is missing')
assert.match(source, /Math\.ceil\(pagination\.value\.total \/ pagination\.value\.pageSize\)/, 'Workflow pagination should fall back to total/pageSize')
assert.match(source, /v-if="currentProject && totalWorkflowPages > 1"/, 'Project workflow pagination should appear when more pages exist')
  assert.match(source, /translateUi\('uiMessages\.m272766ca2755', \{ value1: \(projects\.length\), value2: \(currentSpaceWorkflowTotal\) \}\)/)
  assert.match(source, /translateUi\('uiMessages\.m2e73afa109b2', \{ value1: \(currentProjectWorkflowTotal\) \}\)/)

console.log('WorkflowList project cover and rename source tests passed')
