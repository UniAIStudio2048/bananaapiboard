import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'llm.js'), 'utf8')

test('canvas LLM API normalizes browser fetch failures into a user-facing message', () => {
  assert.match(source, /function\s+normalizeLLMNetworkError\(/, 'LLM API should have a shared network error normalizer')
  assert.match(source, /Failed to fetch/, 'normalizer should explicitly handle the browser network failure text')
  assert.match(source, /LLM 请求连接失败/, 'network failures should not surface raw "Failed to fetch" in canvas nodes')
  assert.match(source, /async function\s+fetchLLMApi\(/, 'LLM API calls should go through the shared fetch wrapper')
})

test('canvas LLM API entrypoints use the shared network-safe fetch wrapper', () => {
  const chatBody = source.match(/export async function chatWithLLM\(params\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const streamBody = source.match(/export async function chatWithLLMStream\(params\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const actionBody = source.match(/async function callLLM\(action, params\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(chatBody, /fetchLLMApi\(/, 'chatWithLLM should normalize fetch failures')
  assert.match(streamBody, /fetchLLMApi\(/, 'chatWithLLMStream should normalize fetch failures')
  assert.match(actionBody, /fetchLLMApi\(/, 'preset LLM actions should normalize fetch failures')
})
