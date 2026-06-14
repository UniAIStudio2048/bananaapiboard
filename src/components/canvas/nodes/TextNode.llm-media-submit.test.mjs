import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

test('text node LLM submission uses media URL policy instead of browser-fetching remote media', () => {
  assert.match(source, /collectTextNodeLlmMediaReferences/)
  assert.match(source, /uploadTextNodeLlmMediaItems/)
  assert.match(source, /videoUrls:\s*upstreamVideoUrls\.value/)
  assert.match(source, /imageUrls:\s*upstreamImageUrls\.value/)
  assert.doesNotMatch(source, /uploadImagesToQiniu\(imageOnlyUrls\)/)
  assert.doesNotMatch(source, /uploadVideosToCloud\(videoUrls\)/)
})

test('text node LLM submission does not duplicate the current user message', () => {
  assert.doesNotMatch(source, /messages\.push\(userMessage\)/)
})
