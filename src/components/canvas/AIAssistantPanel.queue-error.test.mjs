/**
 * 队列错误测试：服务端队列删除失败必须保留队列项并显示原因，不得静默吞掉；
 * 排队入队失败（附件上传 / 服务端排队）写入草稿 status='error'，用户可见可重试。
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

test('本地排队机制恢复：enqueueServerMessage 走服务端排队，入队失败写入草稿', () => {
  assert.match(panel, /enqueueServerMessage\(draft\)/)
  assert.match(panel, /排队附件上传失败/)
  assert.match(panel, /服务端排队失败/)
  assert.match(panel, /draft\.status = 'error'/)
})

test('队列删除失败保留队列项并显示原因', () => {
  const block = panel.match(/删除队列消息失败[\s\S]*?\n  \}/)?.[0]
  assert.ok(block, 'queue delete failure block must exist')
  assert.match(block, /queued\.status = 'error'/)
  assert.match(block, /queued\.error = error\?\.message \|\| '删除失败，请重试'/)
  // 失败后不得立即 filter 清空 serverQueue
  assert.doesNotMatch(block, /serverQueue\.value = serverQueue\.value\.filter/)
})
