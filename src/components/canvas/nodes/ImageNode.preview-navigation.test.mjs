import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

assert.match(source, /function getCanvasNodeSwitchImageUrl\(node\)[\s\S]*?data\.output\?\.urls[\s\S]*?data\.sourceImages/)
assert.match(source, /const canvasPreviewImages = computed\(\(\) => \{[\s\S]*?canvasStore\.nodes/)
assert.match(source, /'image-input'[\s\S]*?'image-gen'[\s\S]*?'text-to-image'[\s\S]*?'image-to-image'[\s\S]*?'grid-preview'/)
assert.match(source, /function switchCanvasPreviewImage\(offset\)[\s\S]*?previewImageUrl\.value = getOriginalImageUrl\(nextItem\.url\)/)
assert.match(source, /event\.key === 'ArrowLeft'[\s\S]*?switchCanvasPreviewImage\(-1\)/)
assert.match(source, /event\.key === 'ArrowRight'[\s\S]*?switchCanvasPreviewImage\(1\)/)
assert.match(source, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key\.toLowerCase\(\) === 's'[\s\S]*?stopImmediatePropagation\?\.\(\)[\s\S]*?handleToolbarDownload\(\)/)
assert.match(source, /document\.addEventListener\('keydown', handlePreviewKeydown, true\)/)
assert.match(source, /document\.removeEventListener\('keydown', handlePreviewKeydown, true\)/)
assert.match(source, /class="preview-nav-btn preview-nav-prev"[\s\S]*?switchCanvasPreviewImage\(-1\)/)
assert.match(source, /class="preview-nav-btn preview-nav-next"[\s\S]*?switchCanvasPreviewImage\(1\)/)

console.log('ImageNode preview navigation source tests passed')
