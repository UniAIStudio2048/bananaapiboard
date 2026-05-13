import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

assert.match(source, /const\s+promptHighlightOverlayRef\s*=\s*ref\(null\)/, 'Prompt highlight overlay should have a template ref')
assert.match(source, /ref="promptHighlightOverlayRef"/, 'Prompt highlight overlay DOM should bind the ref')
assert.match(source, /@scroll="syncPromptHighlightOverlayScroll"/, 'Prompt textarea scroll should sync the highlight overlay')

const syncBody = source.match(/function syncPromptHighlightOverlayScroll\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
assert.ok(syncBody, 'Prompt highlight scroll sync function should exist')
assert.match(syncBody, /promptTextareaRef\.value/, 'Scroll sync should read the textarea ref')
assert.match(syncBody, /promptHighlightOverlayRef\.value/, 'Scroll sync should read the overlay ref')
assert.match(syncBody, /overlay\.scrollTop\s*=\s*textarea\.scrollTop/, 'Scroll sync should copy scrollTop')
assert.match(syncBody, /overlay\.scrollLeft\s*=\s*textarea\.scrollLeft/, 'Scroll sync should copy scrollLeft')
