/**
 * 续聊参考图回归测试：继续对话时自动携带最近一次生成结果作为参考附件，
 * 支持“基于上一张图继续修改 / 加元素”等图生图续画需求。
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

test('续聊自动收集最近一次 assistant 消息中的生成媒体作为参考附件', () => {
  const block = panel.match(/function collectRecentAssistantMedia\(\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'collectRecentAssistantMedia must exist')
  assert.match(block, /msg\.role !== 'assistant'/)
  assert.match(block, /a\.type === 'image' \|\| a\.type === 'video'/)
  assert.match(block, /history-media:/)
  // 从后往前找最近一条带媒体的 assistant 消息，避免把整段历史全部带上
  assert.match(block, /for \(let i = messages\.value\.length - 1; i >= 0; i -= 1\)/)
})

test('增强模式发送时把历史参考图合并进本轮附件', () => {
  const block = panel.match(/async function sendEnhancedMessage\(force = false\) \{[\s\S]*?referenceAttachments = collectRecentAssistantMedia\(\)[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'sendEnhancedMessage merge must exist')
  // 本轮附件解析后并入 @ 引用的对话历史媒体，再合并最近一次生成结果作为参考图
  assert.match(block, /const userAttachments = mergeMentionedHistoryMedia\(resolveAssistantAttachmentsForSend/)
  assert.match(block, /const referenceAttachments = collectRecentAssistantMedia\(\)/)
  assert.match(block, /seenAttachmentUrls = new Set\(userAttachments\.map\(\(a\) => a\.url\)\.filter\(Boolean\)\)/)
  assert.match(block, /referenceAttachments\.filter\(\(a\) => !seenAttachmentUrls\.has\(a\.url\)\)/)
  // 用户消息渲染时历史参考图回退到 url（无本地 preview）
  assert.match(block, /url: a\.preview \|\| a\.url/)
})

test('普通模式发送时同样合并历史参考图', () => {
  // collectRecentAssistantMedia 在增强与普通两个发送路径各调用一次
  assert.equal((panel.match(/const referenceAttachments = collectRecentAssistantMedia\(\)/g) || []).length, 2)
  // 两处发送路径均用 mergeMentionedHistoryMedia 包裹附件解析
  assert.equal((panel.match(/const userAttachments = mergeMentionedHistoryMedia\(resolveAssistantAttachmentsForSend/g) || []).length, 2)
  // 两处都按 URL 去重合并历史参考图
  assert.equal((panel.match(/referenceAttachments\.filter\(\(a\) => !seenAttachmentUrls\.has\(a\.url\)\)/g) || []).length, 2)
})
