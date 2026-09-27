import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./llm.js', import.meta.url), 'utf8')

for (const streaming of [false, true]) {
  test(`canvas ${streaming ? 'stream' : 'JSON'} chat waits eight minutes without sending timeout to provider`, async () => {
    let duration
    let body
    const api = runInNewContext(`${source.replace(/^import .*$/gm, '').replace(/^export /gm, '')}; ({ chatWithLLM, chatWithLLMStream })`, {
      getApiUrl: path => path,
      getTenantHeaders: () => ({}),
      useTeamStore: () => ({ getSpaceParams: () => ({ spaceType: 'personal' }) }),
      localStorage: { getItem: () => null },
      AbortSignal: { timeout: ms => { duration = ms; return {} } },
      TextDecoder,
      fetch: async (_url, options) => {
        body = JSON.parse(options.body)
        return {
          ok: true,
          json: async () => ({ success: true, result: 'ok' }),
          body: { getReader: () => ({ read: async () => ({ done: true }) }) }
        }
      }
    })
    const chat = streaming ? api.chatWithLLMStream : api.chatWithLLM
    await chat({ messages: [], timeoutMs: 480000 })
    assert.equal(duration, 480000)
    assert.equal('timeoutMs' in body, false)
    await chat({ messages: [] })
    assert.equal(duration, 90000, 'other callers retain their existing default')
  })
}
