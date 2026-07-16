import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowPanel.vue'), 'utf8')

const loadWorkflowsStart = source.indexOf('async function loadWorkflows(forceRefresh = false)')
const loadWorkflowsEnd = source.indexOf('// 加载历史工作流', loadWorkflowsStart)
assert.notEqual(loadWorkflowsStart, -1, 'WorkflowPanel should define loadWorkflows')
assert.notEqual(loadWorkflowsEnd, -1, 'WorkflowPanel should keep loadWorkflows before history loading')

const loadWorkflowsSource = source.slice(loadWorkflowsStart, loadWorkflowsEnd)

const loadRemainingStart = source.indexOf('async function loadRemainingWorkflowPages')
const loadRemainingEnd = source.indexOf('async function loadWorkflowProjects', loadRemainingStart)
assert.notEqual(loadRemainingStart, -1, 'WorkflowPanel should define loadRemainingWorkflowPages')
assert.notEqual(loadRemainingEnd, -1, 'WorkflowPanel should keep loadRemainingWorkflowPages before project loading')

const loadRemainingSource = source.slice(loadRemainingStart, loadRemainingEnd)

assert.match(
  loadWorkflowsSource,
  /pagination\?\.total/,
  'loadWorkflows should read the saved workflow API pagination total'
)

assert.match(
  loadWorkflowsSource,
  /const pageSize = WORKFLOW_LIST_PAGE_SIZE/,
  'loadWorkflows should use the large metadata page size for fast saved workflow list loading'
)

assert.doesNotMatch(
  loadWorkflowsSource,
  /for\s*\([^)]*page\s*=\s*2[\s\S]*?await getWorkflowList/,
  'loadWorkflows should not serially request every saved workflow page before rendering'
)

assert.match(
  source,
  /const WORKFLOW_LIST_PAGE_SIZE = 500/,
  'WorkflowPanel should request a large metadata-only page to avoid slow all-workflow pagination'
)

assert.match(
  source,
  /const WORKFLOW_BACKGROUND_PAGE_CONCURRENCY = 2/,
  'WorkflowPanel should cap background saved workflow pagination concurrency'
)

assert.doesNotMatch(
  loadRemainingSource,
  /Promise\.all\(\s*pageNumbers\.map/,
  'WorkflowPanel should not request every remaining saved workflow page concurrently'
)

assert.match(
  loadRemainingSource,
  /pageNumbers\.slice\(index, index \+ WORKFLOW_BACKGROUND_PAGE_CONCURRENCY\)/,
  'WorkflowPanel should fetch remaining saved workflow pages in bounded batches'
)

assert.match(
  loadWorkflowsSource,
  /workflows\.value\s*=\s*(?!wfResult\.list\b)[\w$]+/,
  'loadWorkflows should assign the merged saved workflow list before the project tree renders'
)

assert.doesNotMatch(
  loadWorkflowsSource,
  /Promise\.all\(\[\s*getWorkflowList[\s\S]*?getProjectList/,
  'loadWorkflows should not wait for projects before rendering the first saved workflow page'
)

assert.match(
  loadWorkflowsSource,
  /workflows\.value\s*=\s*firstPageList[\s\S]*?loadWorkflowProjects\(/,
  'loadWorkflows should render the first saved workflow page before loading project folders in the background'
)

assert.match(
  source,
  /const projectTree = computed\(\(\) => \{[\s\S]*?for \(const w of filteredWorkflows\.value\)/,
  'Project tree rendering should be driven from the merged saved workflows collection'
)

assert.match(
  source,
  /function matchesWorkflowSearch\(workflow, rawQuery\)[\s\S]*?workflow\.workflow_uid[\s\S]*?workflow\.workflowId/,
  'Workflow search should include both saved and history workflow identifiers'
)

assert.match(
  source,
  /String\(value \?\? ''\)\.toLowerCase\(\)\.includes\(query\)/,
  'Workflow search should use case-insensitive fuzzy matching for normalized field values'
)

console.log('WorkflowPanel pagination source tests passed')
