import { localizedPattern } from '../../i18n/sourceAssertions.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./SkillsMarket.vue', import.meta.url), 'utf8')

test('Skills market renders the tenant market tabs and private Skill editor', () => {
  assert.match(source, localizedPattern(/通用/))
  assert.match(source, localizedPattern(/收藏/))
  assert.match(source, localizedPattern(/我的/))
  assert.match(source, localizedPattern(/创建我的 Skill/))
  assert.match(source, /SKILL\.md/)
  assert.match(source, /@reference/)
  assert.match(source, /getMySkills/)
  assert.match(source, /createMySkill/)
  assert.match(source, localizedPattern(/选择后会加载到对话框，发送才会调用/))
  assert.match(source, /@click="skill\.status === 'published' && reference\(skill\)"/)
  assert.match(source, localizedPattern(/查看详情/))
  assert.match(source, /'is-popover': !showAll/)
  assert.match(source, localizedPattern(/@click="showAll = true">全部<\/button>/))
  assert.match(source, /:style="showAll \? undefined : anchor"/)
})
