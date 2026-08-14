import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const apiSource = readFileSync(new URL('./llm.js', import.meta.url), 'utf8')
const textNodeSource = readFileSync(new URL('../../components/canvas/nodes/TextNode.vue', import.meta.url), 'utf8')

test('canvas LLM stream returns the final structured result and surfaces SSE errors', () => {
  assert.match(apiSource, /let finalResult = null/)
  assert.match(apiSource, /json\.success === true && typeof json\.result === 'string'/)
  assert.match(apiSource, /throw new Error\(json\.message \|\| json\.error/)
  assert.match(apiSource, /return finalResult \|\| \{ success: true, result: fullText \}/)
})

test('text node uses the CDN-safe stream only for media LLM submissions', () => {
  assert.match(textNodeSource, /import \{[^}]*chatWithLLMStream[^}]*\} from '@\/api\/canvas\/llm'/s)
  assert.match(
    textNodeSource,
    /processedImages\.length > 0\s*\? await chatWithLLMStream\(\{ \.\.\.apiParams, timeoutMs: 300000 \}\)\s*:\s*await chatWithLLM\(apiParams\)/
  )
})
