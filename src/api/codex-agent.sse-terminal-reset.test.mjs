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

test('turn.completed 后连接 reset 仍按成功终态收尾', async () => {
  const sendCodexMessage = await loadSendCodexMessage()
  const encoder = new TextEncoder()
  let reads = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (reads++ === 0) {
        controller.enqueue(encoder.encode([
          'event: thread.started',
          'data: {"thread_id":"thread-1"}',
          '',
          'event: turn.completed',
          'data: {"finalResponse":"生产 AI 助手可用","turn_id":"turn-1"}',
          '',
          '',
        ].join('\n')))
        return
      }
      controller.error(new TypeError('network error'))
    },
  })

  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  let doneResult = null
  let reportedError = null
  const result = await sendCodexMessage({
    content: '请只回复：生产 AI 助手可用',
    onDone: (value) => { doneResult = value },
    onError: (error) => { reportedError = error },
  })

  assert.equal(reportedError, null)
  assert.equal(doneResult?.thread_id, 'thread-1')
  assert.equal(doneResult?.finalResponse, '生产 AI 助手可用')
  assert.equal(result.finalResponse, '生产 AI 助手可用')
})

test('turn.completed 前连接 reset 仍报告失败', async () => {
  const sendCodexMessage = await loadSendCodexMessage()
  const stream = new ReadableStream({
    pull(controller) {
      controller.error(new TypeError('network error'))
    },
  })

  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

  let reportedError = null
  await assert.rejects(
    sendCodexMessage({
      content: '测试真实网络故障',
      onError: (error) => { reportedError = error },
    }),
    /network error/
  )
  assert.match(reportedError?.message || '', /network error/)
})
