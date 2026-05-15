import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readComponent(filename) {
  return readFileSync(join(__dirname, filename), 'utf8')
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `Expected ${functionName} to exist`)

  const paramsEnd = source.indexOf(')', start)
  assert.ok(paramsEnd > start, `Expected ${functionName} parameter list to close`)
  const bodyStart = source.indexOf('{', paramsEnd)
  let depth = 0
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, i)
  }

  throw new Error(`Could not parse ${functionName}`)
}

test('failed image generation retry reuses the current node', () => {
  const source = readComponent('ImageNode.vue')
  const regenerateBody = functionBody(source, 'handleRegenerate')
  const generateBody = functionBody(source, 'handleGenerate')

  assert.match(regenerateBody, /handleGenerate\(\{\s*retry:\s*true\s*\}\)/)
  assert.doesNotMatch(regenerateBody, /forceNewNode/)
  assert.doesNotMatch(generateBody, /createNewOutputNode\(/)
  assert.doesNotMatch(generateBody, /hasExistingMediaContent\(\)/)
  assert.match(generateBody, /targetNodeId\s*=\s*props\.id/)
  assert.match(generateBody, /output:\s*null/)
  assert.match(generateBody, /generatedImage:\s*null/)
  assert.match(generateBody, /imageUrl:\s*null/)
  assert.match(generateBody, /nodeRole:\s*'output'/)
  assert.doesNotMatch(regenerateBody, /status:\s*'idle'/)
})

test('failed video generation retry reuses the current node', () => {
  const source = readComponent('VideoNode.vue')
  const regenerateBody = functionBody(source, 'handleRegenerate')
  const generateBody = functionBody(source, 'handleGenerate')

  assert.match(regenerateBody, /handleGenerate\(\{\s*retry:\s*true\s*\}\)/)
  assert.doesNotMatch(regenerateBody, /forceNewNode/)
  assert.doesNotMatch(generateBody, /createNewOutputNode\(/)
  assert.doesNotMatch(generateBody, /hasExistingMediaContent\(\)/)
  assert.match(generateBody, /targetNodeId\s*=\s*props\.id/)
  assert.match(generateBody, /output:\s*null/)
  assert.match(generateBody, /videoUrl:\s*null/)
  assert.doesNotMatch(regenerateBody, /status:\s*'idle'/)
})

test('audio generation clears existing audio content on the current node', () => {
  const source = readComponent('AudioNode.vue')
  const generateBody = functionBody(source, 'handleGenerateMusic')

  assert.match(generateBody, /status:\s*'processing'/)
  assert.match(generateBody, /audioUrl:\s*null/)
  assert.match(generateBody, /audioData:\s*null/)
  assert.match(generateBody, /output:\s*null/)
})

test('text generation clears existing text output on the current node', () => {
  const source = readComponent('TextNode.vue')
  const generateBody = functionBody(source, 'handleLLMGenerate')

  assert.match(generateBody, /status:\s*'processing'/)
  assert.match(generateBody, /llmResponse:\s*''/)
  assert.match(generateBody, /output:\s*null/)
  assert.match(generateBody, /error:\s*null/)
})
