/**
 * 续聊参考图回归测试（audit AC-P1-08）。
 *
 * 历史媒体仅在明确引用时携带：用户 @ 媒体或勾选「以上一结果为参考」才发送，
 * 普通文字问答不自动附带上一轮媒体。发送前可见将携带的参考素材，同一 URL 只发送一次。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.continue-conversation.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('增强模式发送：附件来自用户显式引用（@ 媒体），不再自动合并历史媒体（AC-P1-08）', () => {
  const block = panel.match(/async function sendEnhancedMessage\(force = false\) \{[\s\S]*?const messageAttachments = userAttachments[\s\S]*?messages\.value\.push\(\{[\s\S]*?role: 'user',[\s\S]*?\n    \}\)/)?.[0]
  assert.ok(block, 'sendEnhancedMessage attach block must exist')
  // 附件解析仍并入 @ 引用的对话历史媒体（显式引用）
  assert.match(block, /const userAttachments = mergeMentionedHistoryMedia\(resolveAssistantAttachmentsForSend/)
  // 不再自动带最近一次生成结果
  assert.doesNotMatch(block, /const referenceAttachments = collectRecentAssistantMedia\(\)/)
  // 不再按 URL 去重合并历史媒体（只有显式引用，无需二次合并）
  assert.doesNotMatch(block, /referenceAttachments\.filter\(\(a\) => !seenAttachmentUrls\.has\(a\.url\)\)/)
  // 用户消息渲染时附件回退到 url（无本地 preview）
  assert.match(block, /url: a\.preview \|\| a\.url/)
})

test('普通模式发送：同样不再自动合并历史参考图（AC-P1-08）', () => {
  // 两处发送路径均不再调用 collectRecentAssistantMedia
  assert.equal((panel.match(/const referenceAttachments = collectRecentAssistantMedia\(\)/g) || []).length, 0)
  // 两处发送路径仍用 mergeMentionedHistoryMedia 包裹显式引用解析
  assert.equal((panel.match(/const userAttachments = mergeMentionedHistoryMedia\(resolveAssistantAttachmentsForSend/g) || []).length, 2)
})

test('附件-only：无文字但有附件时发送默认语义文本（AC-P2-01）', () => {
  const block = panel.match(/async function sendEnhancedMessage\(force = false\) \{[\s\S]*?\n  if \(!messageText\) return/)?.[0]
  assert.ok(block, 'sendEnhancedMessage head must exist')
  assert.match(block, /inputText\.value\.trim\(\) \|\| \(attachments\.value\.length \? '请分析我附加的素材。' : ''\)/)
})
