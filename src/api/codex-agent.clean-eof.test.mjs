/**
 * Codex Agent clean-EOF tests (audit AC-P1-01).
 *
 * 终态前 reader EOF（连接被代理层重置 / 服务端提前断流）必须视为失败
 * （stream_incomplete），不能把半截回复标记成完成。只有收到
 * turn.completed / turn.cancelled / turn.failed 或携带终态 status 的 done
 * 之后 EOF 才按成功收尾。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/api/codex-agent.clean-eof.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function loadSendCodexMessage() {
  const source = await readFile(new URL('./codex-agent.js', import.meta.url), 'utf8')
  const runnableSource = source.replace(
    "import { getApiUrl, getTenantHeaders } from '@/config/tenant'",
    "const getApiUrl = (path) => path\nconst getTenantHeaders = () => ({})"
  )
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(runnableSource).toString('base64')}`
  return (await import(moduleUrl)).sendCodexMessage
}

function makeStream(frames, { eofError = null } = {}) {
  const encoder = new TextEncoder()
  let done = false
  return new ReadableStream({
    pull(controller) {
      if (done) {
        if (eofError) controller.error(eofError)
        else controller.close()
        return
      }
      done = true
      const payload = frames.map((frame) => {
        const [event, data] = frame
        return [`event: ${event}`, `data: ${JSON.stringify(data)}`, ''].join('\n')
      })
      controller.enqueue(encoder.encode(payload.join('\n') + '\n\n'))
    },
  })
}

test('终态前干净 EOF 返回 stream_incomplete，不调用 onDone', async () => {
  const sendCodexMessage = await loadSendCodexMessage()
  // 只有正文片段，无任何终态事件（turn.completed / done），随后连接干净结束
  const stream = makeStream([
    ['turn.accepted', { status: 'accepted', turn_id: 'turn-1' }],
    ['item.completed', { item: { type: 'agent_message', text: '半截回复' } }],
  ])

  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  let doneCalled = false
  await assert.rejects(
    sendCodexMessage({
      content: 'x',
      onDone: () => { doneCalled = true },
    }),
    /stream_incomplete/,
    '终态前 EOF 必须抛 stream_incomplete'
  )
  assert.equal(doneCalled, false, '未到终态不得调用成功回调')
})

test('带终态 status 的 done 之后 EOF 仍按成功收尾', async () => {
  const sendCodexMessage = await loadSendCodexMessage()
  const stream = makeStream([
    ['turn.accepted', { status: 'accepted', turn_id: 'turn-1' }],
    ['done', { status: 'completed', turn_id: 'turn-1', thread_id: 'thread-1' }],
  ])

  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  let doneResult = null
  const result = await sendCodexMessage({
    content: 'x',
    onDone: (value) => { doneResult = value },
  })
  assert.equal(doneResult?.status, 'completed')
  assert.equal(result.status, 'completed')
})
