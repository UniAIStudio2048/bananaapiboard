import { strict as assert } from 'node:assert'
import {
  buildWorkflowShareUrl,
  getWorkflowShareAccess,
  normalizeWorkflowShareMode
} from './workflowShare.js'

assert.equal(normalizeWorkflowShareMode('view'), 'view')
assert.equal(normalizeWorkflowShareMode('clone'), 'clone')
assert.equal(normalizeWorkflowShareMode('unknown'), 'disabled')
assert.equal(normalizeWorkflowShareMode(''), 'disabled')

assert.equal(
  buildWorkflowShareUrl('https://example.test', 'token/with spaces'),
  'https://example.test/share/workflows/token%2Fwith%20spaces'
)
assert.equal(buildWorkflowShareUrl('https://example.test', ''), '')

assert.deepEqual(
  getWorkflowShareAccess({ spaceType: 'personal' }),
  { canManage: true, statusEndpoint: false }
)
assert.deepEqual(
  getWorkflowShareAccess({
    spaceType: 'team',
    teamId: 'team-1',
    teams: [{ id: 'team-1', my_role: 'owner' }]
  }),
  { canManage: true, statusEndpoint: false }
)
assert.deepEqual(
  getWorkflowShareAccess({
    spaceType: 'team',
    teamId: 'team-1',
    teams: [{ id: 'team-1', my_role: 'member' }]
  }),
  { canManage: false, statusEndpoint: true }
)

console.log('workflowShare utility tests passed')
