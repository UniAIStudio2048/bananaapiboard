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
assert.match(source, /\.history-panel-wrapper\.fullscreen\s*\{[\s\S]*?top:\s*max\(20px, calc\(env\(safe-area-inset-top\) \+ 20px\)\);/, 'fullscreen history panel should clear tablet browser safe area')
assert.match(source, /\.history-panel-wrapper\.fullscreen\s*\{[\s\S]*?z-index:\s*11000;/, 'fullscreen history panel should sit above canvas top toolbar')
assert.match(source, /\.history-panel\.fullscreen\s*\{[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*100%;/, 'fullscreen history panel should fit inside the safe-area-adjusted wrapper')
assert.match(source, /\.history-preview-overlay\s*\{[\s\S]*?z-index:\s*12000;/, 'preview overlay should sit above the canvas top toolbar on tablets')
assert.match(source, /\.close-preview-btn\s*\{[\s\S]*?top:\s*max\(16px, calc\(env\(safe-area-inset-top\) \+ 16px\)\);/, 'preview close button should account for tablet browser safe area')
assert.match(source, /\.close-preview-btn\s*\{[\s\S]*?z-index:\s*30;/, 'preview close button should stay above media content and navigation')

console.log('HistoryPanel preview navigation source tests passed')
