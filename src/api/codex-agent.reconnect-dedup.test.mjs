/**
 * Codex Agent reconnect-dedup tests (audit AC-P0-05).
 *
 * 重连时以 (turn_id, event_id) 为去重键：subscribeCodexStream 传入
 * lastEventId 后，重复的帧（正文片段 / 工具卡 / task 事件）不得重复应用；
 * onEventId 回调把最新游标交还给调用方持久保存。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/api/codex-agent.reconnect-dedup.test.mjs
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

test('Last-Event-ID 之后的事件：event_id <= 游标 的重复帧被跳过', async () => {
  const subscribeCodexStream = await loadSubscribe()
  // 重连：已消费到 event_id=2，服务端回放 2、3、4（2 是重复帧）
  const stream = makeStream([
    ['turn.accepted', { status: 'accepted', turn_id: 'turn-1', event_id: 2 }],
    ['item.completed', { item: { type: 'agent_message', text: '第三段' }, turn_id: 'turn-1', event_id: 3 }],
    ['done', { status: 'completed', turn_id: 'turn-1', thread_id: 'thread-1', event_id: 4 }],
  ])
  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  const contents = []
  let doneCalled = false
  const lastIds = []
  await subscribeCodexStream('thread-1', {
    lastEventId: 2,
    onContent: (text) => contents.push(text),
    onDone: () => { doneCalled = true },
    onEventId: ({ turn_id, event_id }) => lastIds.push({ turn_id, event_id }),
  })

  assert.deepEqual(contents, ['第三段'], '重复帧（event_id=2）不得再次应用')
  assert.equal(doneCalled, true)
  assert.deepEqual(lastIds[lastIds.length - 1], { turn_id: 'turn-1', event_id: 4 }, 'onEventId 回报最新游标')
})

test('同一正文片段不因重连而重复：正文、工具事件各恰好一次', async () => {
  const subscribeCodexStream = await loadSubscribe()
  // 第一次订阅已消费 1-3；重连回放 1、2、3、4，其中 1-3 是重复
  const stream = makeStream([
    ['item.completed', { item: { type: 'agent_message', text: '第一段' }, turn_id: 'turn-1', event_id: 1 }],
    ['tool.completed', { tool: 'image-gen', status: 'completed', turn_id: 'turn-1', event_id: 2 }],
    ['item.completed', { item: { type: 'agent_message', text: '第二段' }, turn_id: 'turn-1', event_id: 3 }],
    ['turn.completed', { finalResponse: '第二段', turn_id: 'turn-1', event_id: 4 }],
  ])
  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  const contents = []
  const tools = []
  await subscribeCodexStream('thread-1', {
    lastEventId: 3,
    onContent: (text) => contents.push(text),
    onToolEvent: (e) => tools.push(e),
    onEventId: () => {},
  })

  assert.deepEqual(contents, ['第二段'], '正文只应用缺失帧，不重复')
  assert.deepEqual(tools, [], '重复的工具事件（event_id=2）必须被跳过')
})
