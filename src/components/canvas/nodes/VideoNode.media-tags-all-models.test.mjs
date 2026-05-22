import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

test('all video models support prompt media thumbnail mentions', () => {
  assert.match(
    source,
    /const\s+supportsMediaTags\s*=\s*computed\(\(\)\s*=>\s*true\)/,
    'Video prompt media tags should not be gated to only SD2 or selected model families'
  )
  assert.match(source, /@click="supportsMediaTags && insertMediaTag\(\{ type: 'video'/)
  assert.match(source, /@click="supportsMediaTags && insertMediaTag\(\{ type: 'image'/)
  assert.match(source, /@click="supportsMediaTags && insertMediaTag\(\{ type: 'audio'/)
  assert.match(source, /finalPrompt\s*=\s*escapePromptTags\(finalPrompt\)/)
})
