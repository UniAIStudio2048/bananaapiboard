import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

assert.match(source, /const previewableHistoryItems = computed\(\(\) => \{[\s\S]*?filteredHistory\.value\.filter/)
assert.match(source, /function switchHistoryPreview\(offset\)[\s\S]*?handleHistoryClick\(nextItem\)/)
assert.match(source, /e\.key === 'ArrowLeft'[\s\S]*?switchHistoryPreview\(-1\)/)
assert.match(source, /e\.key === 'ArrowRight'[\s\S]*?switchHistoryPreview\(1\)/)
assert.match(source, /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === 's'[\s\S]*?stopImmediatePropagation\?\.\(\)[\s\S]*?handleDownload\(previewItem\.value\)/)
assert.match(source, /document\.addEventListener\('keydown', handleKeydown, true\)/)
assert.match(source, /document\.removeEventListener\('keydown', handleKeydown, true\)/)
assert.match(source, /class="preview-nav-btn preview-nav-prev"[\s\S]*?switchHistoryPreview\(-1\)/)
assert.match(source, /class="preview-nav-btn preview-nav-next"[\s\S]*?switchHistoryPreview\(1\)/)

console.log('HistoryPanel preview navigation source tests passed')
