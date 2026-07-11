import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

test('text node LLM submission uses media URL policy instead of browser-fetching remote media', () => {
  assert.match(source, /collectTextNodeLlmMediaReferences/)
  assert.match(source, /uploadTextNodeLlmMediaItems/)
  assert.match(source, /videoUrls:\s*upstreamVideoUrls\.value/)
  assert.match(source, /imageUrls:\s*upstreamImageUrls\.value/)
  assert.match(source, /hasReferenceMedia:\s*totalMediaCount\.value\s*>\s*0/)
  assert.match(source, /if\s*\(\s*totalMediaCount\.value\s*>\s*0\s*\)\s*\{/)
  assert.doesNotMatch(source, /uploadImagesToQiniu\(imageOnlyUrls\)/)
  assert.doesNotMatch(source, /uploadVideosToCloud\(videoUrls\)/)
})

test('text node LLM submission does not duplicate the current user message', () => {
  assert.doesNotMatch(source, /messages\.push\(userMessage\)/)
})

test('text node local media uploads are cancellable by node and tab identity', () => {
  const uploadSource = extractFunction('uploadTextNodeLlmMediaItems')
  assert.match(
    uploadSource,
    /uploadCanvasMedia\(file, item\.type, \{ nodeId: props\.id, tabId: canvasStore\.activeTabId \}\)/
  )
  assert.match(
    uploadSource,
    /catch \(error\) \{\s*if \(error\?\.name === 'AbortError'\) throw error/,
    'an intentional abort must propagate without entering the upload failure path'
  )

  const generateSource = extractFunction('handleLLMGenerate')
  assert.match(generateSource, /catch \(uploadError\) \{\s*if \(uploadError\?\.name === 'AbortError'\) throw uploadError/)
  assert.match(
    generateSource,
    /catch \(error\) \{\s*if \(error\?\.name === 'AbortError'\) \{\s*isGenerating\.value = false\s*return/,
    'an intentional abort must not become a TextNode generation failure'
  )
})
