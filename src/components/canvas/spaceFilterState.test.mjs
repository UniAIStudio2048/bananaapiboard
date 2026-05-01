import assert from 'node:assert/strict'

import {
  getCurrentSpaceFilter,
  syncGlobalSpaceFromFilter
} from './spaceFilterState.js'

assert.equal(
  getCurrentSpaceFilter({ globalSpaceType: { value: 'personal' }, globalTeamId: { value: null } }),
  'personal'
)

assert.equal(
  getCurrentSpaceFilter({ globalSpaceType: { value: 'team' }, globalTeamId: { value: 'team-1' } }),
  'team-team-1'
)

const calls = []
await syncGlobalSpaceFromFilter({
  globalSpaceType: { value: 'personal' },
  globalTeamId: { value: null },
  switchToPersonalSpace: () => calls.push(['personal']),
  switchToTeam: async (teamId) => calls.push(['team', teamId])
}, 'team-team-2')

assert.deepEqual(calls, [['team', 'team-2']])

await syncGlobalSpaceFromFilter({
  globalSpaceType: { value: 'team' },
  globalTeamId: { value: 'team-2' },
  switchToPersonalSpace: () => calls.push(['personal']),
  switchToTeam: async (teamId) => calls.push(['team', teamId])
}, 'all')

assert.deepEqual(calls, [['team', 'team-2']], 'all is a panel filter and should not mutate the global workspace')

console.log('spaceFilterState tests passed')
