import assert from 'node:assert/strict'

import {
  appendSpaceParamsToFormData,
  buildSpaceHistoryUrl,
  getCurrentBeginnerSpaceParams
} from './beginnerSpaceParams.js'

function makeTeamStore(spaceParams) {
  return {
    getSpaceParams(filter) {
      assert.equal(filter, 'current')
      return spaceParams
    }
  }
}

assert.deepEqual(
  getCurrentBeginnerSpaceParams(makeTeamStore({ spaceType: 'personal' })),
  { spaceType: 'personal', teamId: null },
  'personal space should normalize teamId to null'
)

assert.deepEqual(
  getCurrentBeginnerSpaceParams(makeTeamStore({ spaceType: 'team', teamId: 'team-7' })),
  { spaceType: 'team', teamId: 'team-7' },
  'team space should preserve teamId'
)

assert.equal(
  buildSpaceHistoryUrl('/api/images/history', {
    limit: 50,
    offset: 0,
    spaceType: 'team',
    teamId: 'team-7'
  }),
  '/api/images/history?limit=50&offset=0&spaceType=team&teamId=team-7'
)

assert.equal(
  buildSpaceHistoryUrl('/api/videos/history', {
    limit: 30,
    offset: 60,
    spaceType: 'personal',
    teamId: null
  }),
  '/api/videos/history?limit=30&offset=60&spaceType=personal'
)

const formData = new FormData()
appendSpaceParamsToFormData(formData, { spaceType: 'team', teamId: 'team-7' })
assert.equal(formData.get('spaceType'), 'team')
assert.equal(formData.get('teamId'), 'team-7')

const personalFormData = new FormData()
appendSpaceParamsToFormData(personalFormData, { spaceType: 'personal', teamId: null })
assert.equal(personalFormData.get('spaceType'), 'personal')
assert.equal(personalFormData.has('teamId'), false)

console.log('beginnerSpaceParams tests passed')
