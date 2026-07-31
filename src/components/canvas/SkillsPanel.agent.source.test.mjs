import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const panel = await readFile(new URL('./SkillsPanel.vue', import.meta.url), 'utf8')
const assistant = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('Canvas Skills panel exposes only external-agent and manual installation', () => {
  assert.match(panel, /<h2 id="skills-panel-title">安装到 AI Agent<\/h2>/)
  assert.match(panel, /通过 AI Agent 安装/)
  assert.match(panel, /手动安装/)
  assert.doesNotMatch(panel, /创建我的 Skill/)
  assert.doesNotMatch(panel, /我的 Skill/)
  assert.doesNotMatch(panel, /通用|收藏|搜索 Skill 名称或描述/)
  assert.doesNotMatch(panel, /getMySkills|createMySkill|updateMySkill|disableMySkill/)
})

test('canvas assistant exposes built-in Skills and one-shot manual authorization', () => {
  assert.doesNotMatch(assistant, /<select[^>]+v-model="selectedSkillId"/)
  assert.match(assistant, /canvas_context: props\.canvasContext/)
  assert.match(assistant, /skill_mode: skillExecutionMode\.value/)
  assert.match(assistant, /M12 5v14M5 12h14/)
  assert.match(assistant, /applyAgentResultToMessage/)
  assert.match(assistant, /result\?\.result_urls/)
  assert.match(assistant, /decideSkillRun\('deny'\)/)
  assert.match(assistant, /decideSkillRun\('allow_once'\)/)
  assert.doesNotMatch(assistant, /decideSkillRun\('trust_skill'\)/)
  assert.match(assistant, /createAgentRun/)
})
