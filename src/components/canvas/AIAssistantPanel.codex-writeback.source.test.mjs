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
  assert.match(source, /function buildMediaTurnInstruction\([\s\S]*?task-status 获取 completed 和 result_urls[\s\S]*?canvas-write[\s\S]*?\n}/)
  assert.match(source, /const turnHint = \[[\s\S]*?buildMediaTurnInstruction\(\)[\s\S]*?\]\.filter\(Boolean\)\.join\('\\n'\)/)
  assert.match(source, /if \(!hasCanvasWriteTarget\(\)\) \{[\s\S]*?emit\('canvas-writeback'/)
  assert.match(source, /await sendCodexMessage\(\{[\s\S]*?content: messageText,[\s\S]*?hint: turnHint/)
})

test('enhanced Codex mode forwards the explicit automatic Skill authorization preference', () => {
  assert.match(source, /const authorizationModeForTurn = queuedAuthorizationMode\.value \|\| \(skillExecutionMode\.value === 'auto' \? 'auto' : 'once'\)/)
  assert.match(source, /await sendCodexMessage\(\{[\s\S]*?authorization_mode: authorizationModeForTurn/)
})

test('queued enhanced drafts restore their Skill and authorization metadata before force insertion', () => {
  assert.match(source, /function restoreDraft\(draft\)[\s\S]*?draft\.skillId/)
  assert.match(source, /function restoreDraft\(draft\)[\s\S]*?draft\.authorizationMode/)
  assert.match(source, /const authorizationModeForTurn = queuedAuthorizationMode\.value \|\| \(skillExecutionMode\.value === 'auto' \? 'auto' : 'once'\)/)
  assert.match(source, /authorization_mode: authorizationModeForTurn/)
})

test('服务端队列是唯一真源：syncServerQueueItem 合并进 serverQueue 后清空本地乐观镜像', () => {
  // 本地 queuedMessages 仅作乐观展示：服务端确认后由 syncServerQueueItem 清镜像，
  // 避免同一条跟进消息在回合结束后再次发送（服务端 send_mode=queue 为持久化真源）
  assert.match(source, /function syncServerQueueItem\(draft, json\)/)
  assert.match(source, /function syncServerQueueItem\(draft, json\)[\s\S]*?queuedMessages\.value = queuedMessages\.value\.filter/)
})

test('enhanced send forwards model, references and canvas context to the server', () => {
  const block = source.match(/async function sendEnhancedMessage\(force = false\)[\s\S]*?modelRef: turnModelRef \|\| null/)?.[0]
  assert.ok(block, 'sendEnhancedMessage must forward model, references and canvas context')
  assert.match(block, /model: turnModelRef\?\.modelId \|\| undefined/)
  assert.match(block, /canvas_context: props\.canvasContext \|\| null/)
  assert.match(block, /skillRef: turnSkillRef \|\| null/)
  assert.match(block, /modelRef: turnModelRef \|\| null/)
})
