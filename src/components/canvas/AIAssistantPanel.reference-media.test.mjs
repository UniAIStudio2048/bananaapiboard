/**
 * 参考媒体边界（AC-P1-08）测试：普通文字问答不自动附带上一轮媒体；
 * 只有显式引用（@ 媒体 / 勾选「以上一结果为参考」）才发送；同一 URL 只发送一次。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.reference-media.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('普通文字问答不自动附带上一轮媒体（AC-P1-08）', () => {
  // collectRecentAssistantMedia 只保留定义不再被发送路径调用（历史兜底已移除）
  const sendBlock = panel.match(/async function sendEnhancedMessage[\s\S]*?uploadedAttachments = messageAttachments/)?.[0]
  assert.ok(sendBlock, 'sendEnhancedMessage must exist')
  assert.doesNotMatch(sendBlock, /collectRecentAssistantMedia\(\)/, '发送路径不得自动注入历史媒体')
})

test('显式引用素材才发送：uploadedAttachments 仅来自 messageAttachments（用户 @ 的媒体）', () => {
  assert.match(panel, /uploadedAttachments = messageAttachments\s*\n\s*\.filter\(a => !a\.file && a\.url\)/)
})

test('reference_media_mode 随请求透传（explicit/none 由用户勾选决定）', () => {
  assert.match(panel, /reference_media_mode: turnReferenceMediaMode\.value \|\| 'explicit'/)
})
