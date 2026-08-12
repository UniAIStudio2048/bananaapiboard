/**
 * 队列错误（AC-P1-02 / AC-P1-12）测试：排队上传、服务端排队、队列删除失败
 * 必须写入对应草稿/队列项，不得静默吞掉。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.queue-error.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('排队附件上传失败写入草稿 status=error', () => {
  const block = panel.match(/排队附件上传失败[\s\S]*?return/)?.[0]
  assert.ok(block, 'upload failure block must exist')
  assert.match(block, /draft\.status = 'error'/)
  assert.match(block, /draft\.error = error\?\.message \|\| '附件上传失败，请重试'/)
})

test('服务端排队失败写入草稿 status=error（不静默吞掉）', () => {
  const block = panel.match(/服务端排队失败[\s\S]*?await refreshQueueAndFollow/)?.[0]
  assert.ok(block, 'server queue failure block must exist')
  assert.match(block, /draft\.status = 'error'/)
  assert.match(block, /draft\.error = error\?\.message \|\| '排队失败，请重试'/)
})

test('队列删除失败保留队列项并显示原因', () => {
  const block = panel.match(/删除队列消息失败[\s\S]*?\n  \}/)?.[0]
  assert.ok(block, 'queue delete failure block must exist')
  assert.match(block, /queued\.status = 'error'/)
  assert.match(block, /queued\.error = error\?\.message \|\| '删除失败，请重试'/)
  // 失败后不得立即 filter 清空 serverQueue
  assert.doesNotMatch(block, /serverQueue\.value = serverQueue\.value\.filter/)
})
