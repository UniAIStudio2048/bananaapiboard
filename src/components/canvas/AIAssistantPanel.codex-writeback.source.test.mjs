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
  assert.match(source, /function sendEnhancedMessage\(\) \{[\s\S]*?const generated = extractCodexGeneratedMediaResult\(event\.tool, event\.result\)[\s\S]*?applyGeneratedResult\(generated\)/)
  assert.match(source, /const turnHint = \[[\s\S]*?生成任务完成后，请通过 task-status 获取结果；前端会根据 task-status 返回的结果自动写回当前画布，请不要调用 canvas-write。[\s\S]*?\]\.filter\(Boolean\)\.join\('\\n'\)/)
  assert.match(source, /await sendCodexMessage\(\{[\s\S]*?content: messageText,[\s\S]*?hint: turnHint/)
})
