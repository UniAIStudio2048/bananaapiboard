import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

function cssBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('assistant panel stays within its fixed-width container', () => {
  const panel = cssBlock('.ai-assistant-panel')

  assert.match(panel, /min-width:\s*0;/)
  assert.match(source, /const isCompactMode = computed\(\(\) => panelWidth\.value < 525\)/)
  assert.match(source, /const isNarrowMode = computed\(\(\) => panelWidth\.value < 440\)/)
  assert.match(source, /'narrow-mode': isNarrowMode/)

  const narrowLabels = cssBlock('.ai-assistant-container.narrow-mode .toolbar-btn span')
  assert.match(narrowLabels, /display:\s*none;/)
})

test('assistant model picker uses tenant-allowed models and sends a selected model hint', () => {
  assert.match(source, /选择生图模型/)
  assert.match(source, /model-picker-dialog/)
  assert.match(source, /getAvailableImageModels/)
  assert.match(source, /<ModelIcon :icon="getAssistantModelIcon\(model\)" :label="model\.label \|\| model\.value" \/>/)
  assert.match(source, /tenantConfig\.image_models/)
  assert.match(source, /configuredOrder = new Map/)
  assert.match(source, /skill_model: turnModelValue \|\| undefined/)
  assert.match(source, /skill_model_type: turnModelType \|\| undefined/)
})

test('assistant model picker is anchored above the toolbar and supports daytime theme', () => {
  const picker = cssBlock('.model-picker-dialog')

  assert.match(picker, /position:\s*absolute;/)
  assert.match(picker, /bottom:\s*88px;/)
  assert.match(picker, /right:\s*clamp\(/)
  assert.match(source, /class="picker-model-action"/)
  assert.match(source, /model-picker-fade-enter-from \.model-picker-dialog/)
  assert.match(source, /:root\.canvas-theme-light \.model-picker-dialog\s*\{/)
  assert.match(source, /:root\.canvas-theme-light \.model-picker-item\.selected/)
})

test('assistant surfaces Skill generation progress and media results', () => {
  assert.match(source, /onToolEvent: \(event\) => \{/)
  assert.match(source, /生成任务已提交，正在等待结果/)
  assert.match(source, /findGeneratedMediaResult\(result\?\.tool_results\)/)
  assert.match(source, /result\?\.tool_results/)
})

test('assistant history drawer has readable daytime text and controls', () => {
  assert.match(source, /:root\.canvas-theme-light \.ai-assistant-panel \.history-drawer\s*\{[\s\S]*?background:/)
  assert.match(source, /:root\.canvas-theme-light \.ai-assistant-panel \.history-item__title\s*\{[\s\S]*?color:\s*#292524;/)
  assert.match(source, /:root\.canvas-theme-light \.ai-assistant-panel \.history-item__preview\s*\{[\s\S]*?color:\s*#78716c;/)
  assert.match(source, /:root\.canvas-theme-light \.ai-assistant-panel \.history-item__delete\s*\{[\s\S]*?color:\s*#a8a29e;/)
})

test('assistant refresh recovery sends the session before the stream finishes', () => {
  assert.match(source, /onSession: \(sessionId\) => \{[\s\S]*?currentSessionId\.value = sessionId[\s\S]*?loadSessions\(\)/)
  assert.match(source, /session_id: currentSessionId\.value/)
})

test('assistant manual mode confirms only once and does not expose persistent trust', () => {
  assert.match(source, /skillExecutionMode\.value === 'manual'/)
  assert.match(source, /decideSkillRun\('allow_once'\)/)
  assert.doesNotMatch(source, /decideSkillRun\('trust_skill'\)/)

  const decisionBody = source.slice(source.indexOf('async function decideSkillRun'))
  assert.ok(decisionBody.indexOf('pendingAgentApproval.value = null') < decisionBody.indexOf('await watchAgentRun'))
})
