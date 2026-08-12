/**
 * 附件-only（AC-P2-01）测试：仅添加附件时发送按钮可用；无文字时使用明确的
 * 默认文本语义「请分析我附加的素材」，不静默返回。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.attachments-only.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('hasDraft：附件存在时发送按钮可用（无文字也可发送）', () => {
  assert.match(panel, /const hasDraft = computed\(\(\) => Boolean\(inputText\.value\.trim\(\) \|\| attachments\.value\.length > 0\)\)/)
})

test('附件-only 消息使用默认文本语义，不静默返回', () => {
  assert.match(panel, /inputText\.value\.trim\(\) \|\| \(attachments\.value\.length \? '请分析我附加的素材。' : ''\)/)
})
