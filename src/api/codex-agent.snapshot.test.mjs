/**
 * Codex Agent 重连 snapshot 回放测试（bugfix：从历史进入进行中对话缺失信息）。
 *
 * 根因之一：subscribeCodexStream 没有处理 turn.snapshot 事件。当事件存储过期/缺失时，
 * 后端 GET /stream 回退发送 turn.snapshot（含 partialContent + toolEvents，即“当前已打印
 * 的进度”），但前端 switch 无该分支，快照被静默丢弃——进行中对话的部分信息就此丢失，
 * 只有回合完成（turn.completed 触发重载完整历史）后才显示完整内容。
 *
 * 期望：subscribeCodexStream 把 turn.snapshot 派发给 onSnapshot 回调。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/api/codex-agent.snapshot.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function loadSubscribe() {
  const source = await readFile(new URL('./codex-agent.js', import.meta.url), 'utf8')
  const runnableSource = source.replace(
    "import { getApiUrl, getTenantHeaders } from '@/config/tenant'",
    "const getApiUrl = (path) => path\nconst getTenantHeaders = () => ({})"
  )
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(runnableSource).toString('base64')}`
  return (await import(moduleUrl)).subscribeCodexStream
}

function makeStream(frames) {
  const encoder = new TextEncoder()
  let sent = false
  return new ReadableStream({
    pull(controller) {
      if (sent) { controller.close(); return }
      sent = true
      const payload = frames.map(([event, data]) =>
        [`event: ${event}`, `data: ${JSON.stringify(data)}`, ''].join('\n'))
      controller.enqueue(encoder.encode(payload.join('\n') + '\n\n'))
    },
  })
}

test('turn.snapshot 事件被派发给 onSnapshot（事件过期时的回退进度不得丢失）', async () => {
  const subscribeCodexStream = await loadSubscribe()
  const snapshot = {
    turnId: 'turn-1',
    threadId: 'thread-1',
    state: 'running',
    partialContent: '任务已提交，正在生成图片…',
    toolEvents: [{ tool: 'image-gen', status: 'completed', result: null }],
  }
  const stream = makeStream([
    ['status', { turn_status: 'running', turn_id: 'turn-1', thread_id: 'thread-1', event_id: 1 }],
    ['turn.snapshot', { snapshot, turn_id: 'turn-1', thread_id: 'thread-1', event_id: 2 }],
  ])
  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  const snapshots = []
  let onContentCalled = false
  await subscribeCodexStream('thread-1', {
    onSnapshot: (s) => snapshots.push(s),
    onContent: () => { onContentCalled = true },
    onDone: () => {},
    onEventId: () => {},
  })

  assert.equal(snapshots.length, 1, 'turn.snapshot 应恰好派发一次')
  assert.equal(snapshots[0].partialContent, '任务已提交，正在生成图片…', '快照正文不丢失')
  assert.deepEqual(snapshots[0].toolEvents, [{ tool: 'image-gen', status: 'completed', result: null }], '快照工具事件不丢失')
  assert.equal(onContentCalled, false, 'snapshot 不应触发 onContent')
})
