import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('enhanced Codex mode extracts completed media from MCP task-status responses', () => {
  assert.match(source, /function extractCodexGeneratedMediaResult\(toolName, toolResult\)/)
  assert.match(source, /extractCodexGeneratedMediaResult\(event\.tool, event\.result\)/)
  assert.match(source, /result_urls/)
})

test('enhanced Codex mode writes completed media back through the existing canvas event', () => {
  // 媒体结果经 handleToolEvent → extractCodexGeneratedMediaResult → onGeneratedResult(applyGeneratedResult) 写回画布
  assert.match(source, /handleToolEvent\(message, event, \{\s*messageText,\s*onGeneratedResult: applyGeneratedResult\s*\}\)/)
  assert.match(source, /const generated = extractCodexGeneratedMediaResult\(event\.tool, event\.result\)/)
  assert.match(source, /if \(generated && opts\.onGeneratedResult\) opts\.onGeneratedResult\(generated\)/)
  assert.match(source, /const turnHint = \[[\s\S]*?生成任务完成后，请通过 task-status 获取结果；前端会根据 task-status 返回的结果自动写回当前画布，请不要调用 canvas-write。[\s\S]*?\]\.filter\(Boolean\)\.join\('\\n'\)/)
  assert.match(source, /await sendCodexMessage\(\{[\s\S]*?content: messageText,[\s\S]*?hint: turnHint/)
})

test('enhanced Codex mode forwards the explicit automatic Skill authorization preference', () => {
  assert.match(source, /const authorizationModeForTurn = queuedAuthorizationMode\.value \|\| \(skillExecutionMode\.value === 'auto' \? 'auto' : 'once'\)/)
  assert.match(source, /await sendCodexMessage\(\{[\s\S]*?authorization_mode: authorizationModeForTurn/)
  assert.match(source, /function snapshotDraft\(\)[\s\S]*?skillId: referencedSkill\.value\?\.id \|\| null/)
  assert.match(source, /function enqueueServerMessage\(draft\)[\s\S]*?skill_id: draft\.skillId \|\| null/)
})

test('queued enhanced drafts restore their Skill and authorization metadata before force insertion', () => {
  assert.match(source, /function restoreDraft\(draft\)[\s\S]*?draft\.skillId/)
  assert.match(source, /function restoreDraft\(draft\)[\s\S]*?draft\.authorizationMode/)
  assert.match(source, /const authorizationModeForTurn = queuedAuthorizationMode\.value \|\| \(skillExecutionMode\.value === 'auto' \? 'auto' : 'once'\)/)
  assert.match(source, /authorization_mode: authorizationModeForTurn/)
})

test('server-acknowledged queue items are removed from the local draft queue', () => {
  assert.match(source, /function syncServerQueueItem\(draft, json\)[\s\S]*?queuedMessages\.value = queuedMessages\.value\.filter/)
})

test('queued enhanced drafts persist the model, references and canvas execution context', () => {
  const block = source.match(/async function enqueueServerMessage\(draft\) \{[\s\S]*?await refreshQueueAndFollow\(\)\n\}/)?.[0]
  assert.ok(block, 'enqueueServerMessage block must exist')
  assert.match(block, /hint: draft\.hint \|\| undefined/)
  assert.match(block, /model: draft\.model \|\| undefined/)
  assert.match(block, /skillRef: draft\.skillRef \|\| null/)
  assert.match(block, /modelRef: draft\.modelRef \|\| null/)
  assert.match(block, /canvas_context: draft\.canvasContext \|\| null/)
  assert.match(source, /async function sendEnhancedMessage\(force = false\)[\s\S]*?model: turnModelRef\?\.modelId \|\| undefined/)
})
