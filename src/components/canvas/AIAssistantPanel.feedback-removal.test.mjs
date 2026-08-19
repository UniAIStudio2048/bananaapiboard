/**
 * 消息级点赞/点踩反馈功能移除测试（2026-08-20）：
 * 「这次回答有帮助吗 👍/👎」不再需要——前端 UI、面板接线与 API 封装一并移除；
 * 后端 /feedback 路由属 harness API 契约（Evaluator 异步评估读取），保留不动。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.feedback-removal.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const api = readFileSync(join(__dirname, '../../api/codex-agent.js'), 'utf8')

test('面板不再接线/实现回合反馈提交', () => {
  assert.doesNotMatch(panel, /@feedback="submitTurnFeedback"/)
  assert.doesNotMatch(panel, /async function submitTurnFeedback/)
  assert.doesNotMatch(panel, /submitCodexTurnFeedback/)
})

test('前端 API 封装不再暴露 submitCodexTurnFeedback（无调用方）', () => {
  assert.doesNotMatch(api, /export async function submitCodexTurnFeedback/)
})
