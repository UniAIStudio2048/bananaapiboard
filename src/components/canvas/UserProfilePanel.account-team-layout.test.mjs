import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse } from '@vue/compiler-dom'

const source = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../styles/canvas-chrome.css', import.meta.url), 'utf8')
const template = parseSfc(source).descriptor.template.content
const tree = parse(template)
function find(node, predicate) {
  if (node.type === 1 && predicate(node)) return node
  for (const child of node.children || []) { const result = find(child, predicate); if (result) return result }
}
function section(menu) {
  return find(tree, node => node.props.some(prop => prop.type === 7 && prop.name === 'else-if' && prop.exp?.content === `activeMenu === '${menu}'`))
}

test('账户管理分组显示资料和密码，同时保留原有表单和操作', () => {
  const markup = section('profile')?.loc.source || ''
  assert.match(markup, /account-profile-card/)
  assert.match(markup, /account-security-card/)
  for (const field of ['profileForm.username', 'profileForm.email', 'profileForm.bio', 'passwordForm.oldPassword', 'passwordForm.newPassword', 'passwordForm.confirmPassword']) assert.ok(markup.includes(`v-model="${field}"`), field)
  assert.match(markup, /<PhoneBinding\s+@updated="emit\('update'\)"/)
  assert.match(markup, /@click="saveProfile"/)
  assert.match(markup, /@click="changePassword"/)
})

test('团队空间保留角色权限、团队操作和邀请处理', () => {
  const markup = section('teams')?.loc.source || ''
  assert.match(markup, /team-section-heading/)
  assert.match(markup, /<UsersRound/)
  assert.doesNotMatch(markup, /👥|➕/u)
  for (const action of ['handleAcceptInvitation(invite.id)', 'handleRejectInvitation(invite.id)', 'openCreateTeamModal', 'openInviteMemberModal(team)', 'openRenameTeamModal(team)', 'openMemberManageModal(team)', 'handleDissolveTeam(team)', 'handleLeaveTeam(team)']) assert.ok(markup.includes(action), action)
  assert.match(markup, /team\.my_role === 'owner' \|\| team\.my_role === 'admin'/)
  assert.match(markup, /team\.my_role !== 'owner'/)
  assert.match(css, /\.account-fields/)
  assert.match(css, /\.team-card-actions[\s\S]*?flex-wrap:\s*wrap/)
})
