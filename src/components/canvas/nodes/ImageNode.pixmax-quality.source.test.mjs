import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'ImageNode.vue'), 'utf8')
const apiSource = readFileSync(join(import.meta.dirname, '../../../api/canvas/nodes.js'), 'utf8')

test('ImageNode detects Pixmax PixImage 2 and shows quality chips', () => {
  assert.match(source, /const isPixmaxImage2Model = computed\(/)
  assert.match(source, /currentModel\?\.apiType !== 'pixmax-openapi'/)
  assert.match(source, /PIX_IMAGE_2/)
  assert.match(source, /PIXIMAGE_2/)
  assert.match(source, /const qualityOptions = computed\(/)
  assert.match(source, /const showQualityOption = computed\(/)
  assert.match(source, /isPixmaxImage2Model\.value/)
})

test('Pixmax quality options expose low/medium/high with default medium', () => {
  assert.match(source, /\{ value: 'low', label: 'Low' \}/)
  assert.match(source, /\{ value: 'medium', label: 'Medium' \}/)
  assert.match(source, /\{ value: 'high', label: 'High' \}/)
  assert.match(source, /props\.data\.quality \|\| 'medium'/)
  assert.match(source, /!\[['"]low['"], ['"]medium['"], ['"]high['"]\]\.includes\(selectedQuality\.value\)/)
})

test('ImageNode sends and persists selected quality for Pixmax PixImage 2', () => {
  assert.match(source, /quality: isPixmaxImage2Model\.value \? selectedQuality\.value : 'high'/)
  assert.match(source, /selectedQuality, botType/)
  assert.match(source, /quality,/)
  assert.match(source, /canvasStore\.updateNodeData\(props\.id, \{[\s\S]*?quality,/)
})

test('Image-to-image API passes quality through to the generate endpoint', () => {
  assert.match(apiSource, /quality,/)
  assert.match(apiSource, /if \(quality && quality !== 'auto'\) \{\s*body\.quality = quality\s*\}/)
})
