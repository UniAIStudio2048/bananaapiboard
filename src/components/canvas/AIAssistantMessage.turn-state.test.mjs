/**
 * AIAssistantMessage 回合终态渲染测试（reliability design 12.1）。
 * 断言：失败/已停止状态、错误摘要、重试按钮、媒体占位不回归。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantMessage.turn-state.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantMessage.vue'), 'utf8')

test('failed turn renders an error summary and a retry control', () => {
  assert.match(source, /v-if="message\.turnState === 'failed'" class="ai-message-turn-state ai-message-turn-state--failed"/)
  assert.match(source, /message\.error_message \|\| '回合执行失败'/)
  assert.match(source, /v-if="message\.retryable !== false"/)
  assert.match(source, /\$emit\('retry', message\)/)
})

test('cancelled turn renders a gray stopped state', () => {
  assert.match(source, /v-else-if="message\.turnState === 'cancelled'" class="ai-message-turn-state ai-message-turn-state--cancelled"/)
  assert.match(source, /已停止\{\{ message\.cancel_reason \? `（\$\{message\.cancel_reason\}）` : '' \}\}/)
  assert.match(source, /\.ai-message-turn-state--cancelled \{[\s\S]*?color: #6b7280;/)
})

test('retry event is declared on the component', () => {
  assert.match(source, /defineEmits\(\['preview-media', 'select-choice', 'retry'\]\)/)
})

test('media generating placeholders and pre-generation content still exist (no regression)', () => {
  assert.match(source, /v-for="index in mediaGeneratingCount"/)
  assert.match(source, /class="media-generating__placeholder"/)
  assert.match(source, /v-if="message\.preGenerationContent" class="ai-message__text ai-message__text--pre-generation"/)
})

test('turn state styles are static (failed/cancelled do not animate)', () => {
  assert.match(source, /\.ai-message-turn-state__dot \{[\s\S]*?background: currentColor;/)
  assert.doesNotMatch(source, /\.ai-message-turn-state__dot[\s\S]*?animation:/)
})
