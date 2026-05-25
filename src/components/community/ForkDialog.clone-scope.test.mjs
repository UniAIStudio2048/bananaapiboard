import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('./ForkDialog.vue', import.meta.url), 'utf8')

test('custom clone function receives selected project scope and target space', () => {
  assert.match(
    source,
    /await props\.cloneFn\(\{\s*space_type:\s*spaceType\.value,\s*\.\.\.\(spaceType\.value === 'team' \? \{ team_id: selectedTeamId\.value \} : \{\}\),\s*\.\.\.\(forkScope\.value === 'project' \? \{ scope: 'project' \} : \{\}\)\s*\}\)/s
  )
})
