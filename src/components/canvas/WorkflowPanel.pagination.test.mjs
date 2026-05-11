import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowPanel.vue'), 'utf8')

const loadWorkflowsMatch = source.match(/async function loadWorkflows\(forceRefresh = false\) \{[\s\S]*?\n\}/)
assert.ok(loadWorkflowsMatch, 'WorkflowPanel should define loadWorkflows')

const loadWorkflowsSource = loadWorkflowsMatch[0]

assert.match(
  loadWorkflowsSource,
  /pagination\?\.total/,
  'loadWorkflows should read the saved workflow API pagination total'
)

assert.match(
  loadWorkflowsSource,
  /(?:while|for)\s*\([^)]*(?:total|totalPages|pageCount|pagination)[^)]*\)/,
  'loadWorkflows should request additional saved workflow pages when pagination total exceeds the first page'
)

assert.match(
  loadWorkflowsSource,
  /getWorkflowList\(\{\s*page:\s*(?!1\b)[^,}]+,\s*pageSize:/,
  'loadWorkflows should call getWorkflowList for pages beyond the first page'
)

assert.match(
  loadWorkflowsSource,
  /workflows\.value\s*=\s*(?!wfResult\.list\b)[\w$]+/,
  'loadWorkflows should assign the merged saved workflow list before the project tree renders'
)

assert.match(
  source,
  /const projectTree = computed\(\(\) => \{[\s\S]*?for \(const w of filteredWorkflows\.value\)/,
  'Project tree rendering should be driven from the merged saved workflows collection'
)

console.log('WorkflowPanel pagination source tests passed')
