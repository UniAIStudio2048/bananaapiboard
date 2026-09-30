import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
}
globalThis.window = new EventTarget()
let get = async () => ({ success: true, teams: [], invitations: [], members: [] })
globalThis.__teamSessionGet = path => get(path)

const mocks = {
  '@/api/client': 'export default { get: path => globalThis.__teamSessionGet(path) }',
  '@/i18n': 'export const t = key => key',
  '@/config/tenant': 'export const getApiUrl = path => path; export const getTenantHeaders = () => ({})',
  '@/utils/logger': 'export const logApiRequest = () => {}; export const logApiResponse = () => {}; export const logApiError = () => {}; export const logAuth = () => {}; export const logUserAction = () => {}'
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}` }
    if (specifier.startsWith('@/')) return nextResolve(new URL(`../${specifier.slice(2)}.js`, import.meta.url).href, context)
    return nextResolve(specifier, context)
  }
})
const { useTeamStore } = await import('./team.js')
const { clearAuthSession, persistAuthSession } = await import('../api/client.js')
const { useCanvasSpaceFilter } = await import('../components/canvas/spaceFilterState.js')
hooks.deregister()
const teamStore = useTeamStore()
const oldTeam = { id: 'team-a', name: 'A team', my_role: 'owner' }

function login(id, token = `session-${id}`) {
  persistAuthSession(token, { id, username: id })
  teamStore.setCurrentUserId(id)
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  clearAuthSession()
  teamStore.reset()
  storage.clear()
  get = async () => ({ success: true, teams: [oldTeam], invitations: [], members: [] })
})

test('logout immediately clears team state without deleting the account space preference', async () => {
  login('a')
  await teamStore.loadMyTeams()
  await teamStore.switchToTeam(oldTeam.id)
  teamStore.pendingInvitations.value = [{ id: 'invite-a' }]
  teamStore.teamMembers.value = [{ user_id: 'a' }]
  clearAuthSession()
  assert.deepEqual(teamStore.getSpaceParams(), { spaceType: 'personal' })
  assert.equal(teamStore.globalTeam.value, null)
  assert.deepEqual(teamStore.myTeams.value, [])
  assert.deepEqual(teamStore.pendingInvitations.value, [])
  assert.deepEqual(teamStore.teamMembers.value, [])
  assert.equal(storage.get('user_a_teamId'), oldTeam.id)
})

test('remounting the workflow panel after account switch uses personal space without F5', async () => {
  login('a')
  await teamStore.loadMyTeams()
  await teamStore.switchToTeam(oldTeam.id)
  const filter = useCanvasSpaceFilter(teamStore)
  filter.value = `team-${oldTeam.id}`
  // No mounted component watcher observes the restore for account B.
  clearAuthSession()
  login('b')
  get = async () => ({ success: true, teams: [], invitations: [] })
  await teamStore.restoreSpaceState()
  const nextFilter = useCanvasSpaceFilter(teamStore)
  assert.equal(nextFilter, filter, 'panels must still share the same ref')
  assert.equal(nextFilter.value, 'personal')
  assert.deepEqual(teamStore.getSpaceParams(nextFilter.value), { spaceType: 'personal' })
  assert.equal(storage.has('user_b_teamId'), false)
})

test('new sessions restore their own remembered team and preserve all filter within a session', async () => {
  login('a')
  await teamStore.loadMyTeams()
  await teamStore.switchToTeam(oldTeam.id)
  useCanvasSpaceFilter(teamStore).value = 'all'
  assert.equal(useCanvasSpaceFilter(teamStore).value, 'all')
  clearAuthSession()
  login('a', 'second-session-a')
  await teamStore.restoreSpaceState()
  assert.equal(useCanvasSpaceFilter(teamStore).value, `team-${oldTeam.id}`)
})

test('replacing a login session resets teams but updating the same session does not', async () => {
  login('a')
  await teamStore.loadMyTeams()
  await teamStore.switchToTeam(oldTeam.id)
  persistAuthSession('session-a', { id: 'a', username: 'a', points: 10 })
  assert.equal(teamStore.globalTeamId.value, oldTeam.id)
  persistAuthSession('session-b', { id: 'b', username: 'b' })
  assert.deepEqual(teamStore.getSpaceParams(), { spaceType: 'personal' })
  assert.deepEqual(teamStore.myTeams.value, [])
})

test('changing user identity clears the previous team even without a logout event', async () => {
  login('a')
  await teamStore.loadMyTeams()
  await teamStore.switchToTeam(oldTeam.id)
  teamStore.setCurrentUserId('b')
  assert.deepEqual(teamStore.getSpaceParams(), { spaceType: 'personal' })
  assert.deepEqual(teamStore.myTeams.value, [])
})

test('initial user binding preserves legacy space migration on an existing session', async () => {
  storage.set('currentSpaceType', 'team')
  storage.set('currentTeamId', oldTeam.id)
  teamStore.setCurrentUserId('a')
  await teamStore.restoreSpaceState()
  assert.equal(teamStore.globalTeamId.value, oldTeam.id)
})

test('logging back into the original account still rejects responses from its earlier session', async () => {
  login('a')
  const request = deferred()
  get = () => request.promise
  const loading = teamStore.loadMyTeams()
  clearAuthSession()
  login('b')
  clearAuthSession()
  login('a', 'third-session-a')
  request.resolve({ success: true, teams: [oldTeam] })
  await loading
  assert.deepEqual(teamStore.myTeams.value, [])
})

for (const [method, field, response] of [
  ['loadMyTeams', 'myTeams', { success: true, teams: [oldTeam] }],
  ['loadPendingInvitations', 'pendingInvitations', { success: true, invitations: [{ id: 'invite-a' }] }],
  ['loadTeamMembers', 'teamMembers', { success: true, members: [{ user_id: 'a' }] }]
]) {
  test(`late ${method} response cannot repopulate another account`, async () => {
    login('a')
    const request = deferred()
    get = () => request.promise
    const loading = teamStore[method](oldTeam.id)
    clearAuthSession()
    login('b')
    request.resolve(response)
    await loading
    assert.deepEqual(teamStore[field].value, [])
  })
}

test('an old failed team request cannot clear new data or its loading flag', async () => {
  login('a')
  const oldRequest = deferred()
  get = () => oldRequest.promise
  const oldLoad = teamStore.loadMyTeams()
  clearAuthSession()
  login('b')
  teamStore.myTeams.value = [{ id: 'team-b' }]
  const newRequest = deferred()
  get = () => newRequest.promise
  const newLoad = teamStore.loadMyTeams()
  oldRequest.reject(new Error('old request failed'))
  await oldLoad
  assert.deepEqual(teamStore.myTeams.value, [{ id: 'team-b' }])
  assert.equal(teamStore.loading.value, true)
  newRequest.resolve({ success: true, teams: [] })
  await newLoad
  assert.equal(teamStore.loading.value, false)
})

test('a delayed restore stops before selecting a team or loading invitations for the next account', async () => {
  login('a')
  storage.set('user_a_spaceType', 'team')
  storage.set('user_a_teamId', oldTeam.id)
  const request = deferred()
  const paths = []
  get = path => { paths.push(path); return request.promise }
  const restore = teamStore.restoreSpaceState()
  clearAuthSession()
  login('b')
  request.resolve({ success: true, teams: [oldTeam] })
  await restore
  assert.deepEqual(teamStore.getSpaceParams(), { spaceType: 'personal' })
  assert.deepEqual(paths, ['/api/teams'])
  assert.equal(storage.has('user_b_teamId'), false)
})

test('a delayed switch cannot save an old team preference under the next account', async () => {
  login('a')
  await teamStore.loadMyTeams()
  const request = deferred()
  get = () => request.promise
  const switching = teamStore.switchToTeam(oldTeam.id)
  clearAuthSession()
  login('b')
  request.resolve({ success: true, members: [{ user_id: 'a' }] })
  assert.equal(await switching, false)
  assert.equal(storage.has('user_b_teamId'), false)
  assert.deepEqual(teamStore.teamMembers.value, [])
})
