import { readFileSync, existsSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '..')
const routerSource = readFileSync(join(srcRoot, 'router/index.js'), 'utf8')
const appSource = readFileSync(join(srcRoot, 'App.vue'), 'utf8')
const apiPath = join(srcRoot, 'api/group.js')
const viewPath = join(__dirname, 'GroupCredits.vue')

assert.ok(existsSync(apiPath), 'src/api/group.js should exist')
assert.ok(existsSync(viewPath), 'GroupCredits.vue should exist')

const apiSource = readFileSync(apiPath, 'utf8')
const viewSource = readFileSync(viewPath, 'utf8')

assert.match(
  routerSource,
  /const GroupCredits = \(\) => import\('@\/views\/GroupCredits\.vue'\)/,
  'router should lazy-load GroupCredits.vue'
)

assert.match(
  routerSource,
  /path:\s*'\/group'[\s\S]*name:\s*'groupCredits'[\s\S]*requiresAuth:\s*true/s,
  'router should expose authenticated hidden /group route'
)

assert.doesNotMatch(
  appSource,
  /path:\s*'\/group'|to="\/group"/,
  'App navigation should not expose /group'
)

for (const exportName of [
  'getGroupTeams',
  'getGroupTeamMembers',
  'updateGroupBillingPolicy',
  'allocateGroupCredits',
  'revokeGroupAllocation',
  'revokeAllGroupMemberCredits',
  'getGroupLedger'
]) {
  assert.match(apiSource, new RegExp(`export async function ${exportName}\\(`), `api/group.js should export ${exportName}`)
}

assert.match(apiSource, /getApiUrl\('\/api\/group\/teams'\)/, 'API should call /api/group/teams')
assert.match(apiSource, /getTenantHeaders\(\)/, 'API should include tenant headers')
assert.match(apiSource, /Authorization:\s*`Bearer \$\{token\}`/, 'API should include bearer token')
assert.match(apiSource, /error\.status = response\.status/, 'API errors should expose HTTP status')
assert.match(apiSource, /error\.body = data/, 'API errors should expose response body')

assert.match(viewSource, /billingPolicies\s*=\s*\[/, 'GroupCredits should define billing policy controls')
assert.match(viewSource, /team_only/, 'GroupCredits should expose team-only policy')
assert.match(viewSource, /team_first/, 'GroupCredits should expose team-first policy')
assert.match(viewSource, /showAllocationModal/, 'GroupCredits should implement allocation modal state')
assert.match(viewSource, /allocateGroupCredits\(/, 'GroupCredits should call allocateGroupCredits')
assert.match(viewSource, /revokeGroupAllocation\(/, 'GroupCredits should call revokeGroupAllocation')
assert.match(viewSource, /revokeAllGroupMemberCredits\(/, 'GroupCredits should call revokeAllGroupMemberCredits')
assert.match(viewSource, /getGroupLedger\(/, 'GroupCredits should load ledger data')
assert.match(viewSource, /ledgerDrawerOpen/, 'GroupCredits should implement ledger drawer state')
assert.match(viewSource, /function closeLedgerDrawer\(\)/, 'GroupCredits should expose a dedicated ledger drawer collapse handler')
const ledgerHeader = viewSource.match(/<h3 class="text-lg font-semibold">团队积分流水<\/h3>[\s\S]*?<div class="flex gap-2 border-b/)
assert.ok(ledgerHeader, 'Ledger drawer header should be present')
assert.doesNotMatch(ledgerHeader[0], />\s*收起\s*</, 'Ledger drawer collapse control should not be in the header')
const ledgerFooter = viewSource.match(/<span>共 \{\{ ledgerPagination\.total \}\} 条<\/span>[\s\S]*?下一页[\s\S]*?<\/div>\n\s*<\/div>\n\s*<\/aside>/)
assert.ok(ledgerFooter, 'Ledger drawer footer should be present')
assert.match(ledgerFooter[0], />\s*收起\s*</, 'Ledger drawer should include a visible collapse control in the footer')
assert.match(viewSource, /previousPolicy/, 'GroupCredits should rollback failed policy saves')
assert.match(viewSource, /forbidden|unauthorized|403/, 'GroupCredits should render unauthorized state')

console.log('GroupCredits source tests passed')
