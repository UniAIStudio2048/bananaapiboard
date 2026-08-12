/**
 * 会话删除（AC-P2-04 / AC-P1-05）测试：
 * 删除按钮不依赖 modelPickerTypes.length；删除前确认；说明不会取消已提交媒体任务；
 * 失败在页面内可见。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.session-delete.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('删除按钮不依赖 modelPickerTypes.length（AC-P2-04）', () => {
  const deleteBtn = panel.match(/<button\s*\n?\s*class="history-item__delete"[\s\S]*?<\/button>/)?.[0]
  assert.ok(deleteBtn, 'delete button must exist')
  assert.doesNotMatch(deleteBtn, /v-if="modelPickerTypes\.length"/, '删除按钮不得依赖媒体模型存在')
  assert.match(deleteBtn, /deleteSessionItem\(session\.id\)/)
})

test('删除前确认且文案说明不会取消已提交媒体任务', () => {
  assert.match(panel, /删除对话不会取消已经提交的图片或视频任务/)
  assert.match(panel, /正在执行的 AI 回复会先停止；确认停止后再删除/)
  assert.match(panel, /showAlert\(/)
})

test('delete_waiting_for_cancel 保留会话并显示进度；网络失败页面可见', () => {
  assert.match(panel, /error\?\.code === 'delete_waiting_for_cancel' \|\| \/正在停止\/\.test\(error\?\.message \|\| ''\)/)
  assert.match(panel, /上一轮 AI 回复仍在停止中，请稍后重试删除/)
  assert.match(panel, /showAlert\(`删除会话失败：\$\{error\?\.message \|\| '未知错误'\}`, '删除失败'\)/)
})
