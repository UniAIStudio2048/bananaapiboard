import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

assert.match(source, /const\s+llmHighlightOverlayRef\s*=\s*ref\(null\)/, 'LLM highlight overlay should have a template ref')
assert.match(source, /ref="llmHighlightOverlayRef"/, 'LLM highlight overlay DOM should bind the ref')
assert.match(source, /@scroll="syncLLMHighlightOverlayScroll"/, 'LLM textarea scroll should sync the highlight overlay')

const syncBody = source.match(/function syncLLMHighlightOverlayScroll\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
assert.ok(syncBody, 'LLM highlight scroll sync function should exist')
assert.match(syncBody, /llmInputRef\.value/, 'Scroll sync should read the textarea ref')
assert.match(syncBody, /llmHighlightOverlayRef\.value/, 'Scroll sync should read the overlay ref')
assert.match(syncBody, /overlay\.scrollTop\s*=\s*textarea\.scrollTop/, 'Scroll sync should copy scrollTop')
assert.match(syncBody, /overlay\.scrollLeft\s*=\s*textarea\.scrollLeft/, 'Scroll sync should copy scrollLeft')
