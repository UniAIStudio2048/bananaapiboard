import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowList.vue'), 'utf8')

assert.match(
  source,
  /import SpaceSwitcher from '@\/components\/canvas\/SpaceSwitcher\.vue'/,
  'Workflow list should expose the same space switcher used by canvas panels'
)

assert.match(
  source,
  /const spaceFilter = useCanvasSpaceFilter\(teamStore\)/,
  'Workflow list should track the shared canvas space filter'
)

assert.match(
  source,
  /const spaceParams = teamStore\.getSpaceParams\(spaceFilter\.value\)/,
  'Workflow list should derive API parameters from the selected space'
)

assert.match(
  source,
  /getProjectList\(\{\s*spaceType: spaceParams\.spaceType,\s*teamId: spaceParams\.teamId\s*\}\)/s,
  'Workflow list project loading should request projects for the selected space'
)

assert.match(
  source,
  /const params = \{\s*page: pagination\.value\.page,\s*pageSize: pagination\.value\.pageSize,\s*\.\.\.spaceParams\s*\}/s,
  'Workflow list workflow loading should request workflows for the selected space'
)

assert.match(
  source,
  /getWorkflowList\(params\)/,
  'Workflow list should send the selected-space params to the workflow API'
)

assert.match(
  source,
  /<SpaceSwitcher\s+v-model="spaceFilter"/,
  'Workflow list should render a space switcher'
)

assert.match(
  source,
  /:space-filter="spaceFilter"/,
  'Move-to-project dialog should receive the current space filter'
)

console.log('WorkflowList space filter source tests passed')
