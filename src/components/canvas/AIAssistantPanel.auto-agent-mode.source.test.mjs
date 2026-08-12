import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('automatic Agent mode uses the Codex transport without a separate toolbar control', () => {
  assert.doesNotMatch(source, /title="增强模式（Codex Agent）"/)
  assert.doesNotMatch(source, /class="header-enhanced-badge"/)
  // AC-P1-04 Step 3: 引擎由 agentEngine 独立表达；授权模式不再切换后端
  assert.match(source, /const agentEngine = ref\('codex'\)/)
  assert.match(source, /const enhancedMode = computed\(\(\) => agentEngine\.value === 'codex'\)/)
  assert.match(source, /function selectSkillExecutionMode\(mode\) \{[\s\S]*?skillExecutionMode\.value = nextMode[\s\S]*?saveEnhancedModePreference\(nextMode === 'auto'\)/)
})

test('shows only an explicitly referenced Skill as an input tag', () => {
  assert.match(source, /v-if="referencedSkill" class="selected-model-tag selected-skill-tag"/)
  assert.match(source, /<div v-if="selectedAssistantModel \|\| referencedSkill" class="input-context-tags" aria-label="当前创作配置">/)
  assert.match(source, /function referenceSkill\(skill\)/)
})
