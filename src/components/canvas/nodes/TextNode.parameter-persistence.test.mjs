import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

function functionBlock(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)
  const nextFunction = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction)
}

test('text node restores model and language selection from node data', () => {
  assert.match(source, /const selectedModel = ref\(props\.data\?\.model \|\| 'gemini-2\.5-pro'\)/)
  assert.match(source, /const selectedLanguage = ref\(props\.data\?\.language \|\| 'zh'\)/)
})

test('text node writes model and language selection back to node data', () => {
  assert.match(source, /function persistLlmSelection\(\)\s*\{[\s\S]*canvasStore\.updateNodeData\(props\.id,\s*\{[\s\S]*model:\s*selectedModel\.value,[\s\S]*language:\s*selectedLanguage\.value \|\| 'zh'/)
  assert.match(source, /watch\(\[selectedModel,\s*selectedLanguage\],\s*persistLlmSelection\)/)

  const selectModelBlock = functionBlock('selectModel')
  assert.match(selectModelBlock, /persistLlmSelection\(\)/)

  const selectLanguageBlock = functionBlock('selectLanguage')
  assert.match(selectLanguageBlock, /persistLlmSelection\(\)/)
})

test('loading LLM config preserves a restored selected model when available', () => {
  const loadBlock = functionBlock('loadLLMConfig')
  assert.match(loadBlock, /normalizeSelectedLlmModel\(/)
  assert.doesNotMatch(loadBlock, /selectedModel\.value\s*=\s*config\.defaultModel/)
})
