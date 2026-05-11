import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'MoveToProjectDialog.vue'), 'utf8')

assert.match(
  source,
  /spaceFilter: \{ type: String, default: 'personal' \}/,
  'Move-to-project dialog should accept the current space filter'
)

assert.match(
  source,
  /const teamStore = useTeamStore\(\)/,
  'Move-to-project dialog should use the team store to resolve space filter params'
)

assert.match(
  source,
  /const spaceParams = teamStore\.getSpaceParams\(props\.spaceFilter\)/,
  'Move-to-project dialog should load projects for the current space filter'
)

assert.match(
  source,
  /getProjectList\(\{\s*spaceType: spaceParams\.spaceType,\s*teamId: spaceParams\.teamId\s*\}\)/s,
  'Move-to-project dialog project list should be scoped to the selected space'
)

console.log('MoveToProjectDialog space filter source tests passed')
