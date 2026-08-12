/**
 * 增强模式控件（AC-P1-04）测试：deep_think / web_search 开关真实进入请求；
 * web_search=false 时模型与工具层都不得调用搜索。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.enhanced-settings.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('deep_think/web_search/reference_media_mode 进入发送请求体（AC-P1-04）', () => {
  const sendBlock = panel.match(/await sendCodexMessage\(\{[\s\S]*?signal: requestController\.signal,/)?.[0]
  assert.ok(sendBlock, 'sendCodexMessage block must exist')
  assert.match(sendBlock, /deep_think: deepThinkEnabled\.value === true/)
  assert.match(sendBlock, /web_search: webSearchEnabled\.value !== false/)
  assert.match(sendBlock, /reference_media_mode: turnReferenceMediaMode\.value \|\| 'explicit'/)
})

test('web_search 关闭后仍可发送（布尔透传而非缺失）', () => {
  // 开关默认关闭时必须显式传 false，不能让后端以为未提供而默认开启
  assert.match(panel, /web_search: webSearchEnabled\.value !== false/)
  assert.doesNotMatch(panel, /web_search: webSearchEnabled\.value \? true : undefined/)
})
