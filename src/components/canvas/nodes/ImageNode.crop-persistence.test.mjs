import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const canvasSource = readFileSync(new URL('../../../views/Canvas.vue', import.meta.url), 'utf8')
const editModeSource = readFileSync(new URL('../ImageEditMode.vue', import.meta.url), 'utf8')

test('manual crop saves a durable uploaded URL instead of a data URL', () => {
  const cropSave = source.match(/async function handleCropSave\(result\) \{[\s\S]*?\n\}/)
  assert.ok(cropSave, 'handleCropSave should be async so the crop can be uploaded before persistence')
  assert.match(cropSave[0], /await uploadCropBlob\(/)
  assert.match(cropSave[0], /output:\s*\{[\s\S]*url:\s*serverUrl[\s\S]*urls:\s*\[serverUrl\]/)
  assert.doesNotMatch(cropSave[0], /url:\s*result\.dataUrl/)
})

test('grid crop nodes are created from completed uploads, never blob previews', () => {
  const gridSources = source.match(/async function handleGenericGridCrop[\s\S]*?async function createStoryboardFromCrop/)
  assert.ok(gridSources)
  assert.match(gridSources[0], /await uploadCropBlob\(/)
  assert.doesNotMatch(gridSources[0], /sourceImages:\s*\[blobUrl\]/)
  assert.doesNotMatch(gridSources[0], /isUploading:\s*true/)
})

test('completed crop uploads notify Canvas so the workflow is persisted immediately', () => {
  assert.match(source, /canvas-media-upload-complete/)
  assert.match(source, /canvasStore\.commitMediaUpload\(/)
  assert.match(canvasSource, /addEventListener\('canvas-media-upload-complete'/)
  assert.match(canvasSource, /schedulePersistAfterTask\(`media-upload:/)
  assert.match(canvasSource, /removeEventListener\('canvas-media-upload-complete'/)
  assert.match(editModeSource, /canvas-media-upload-complete/)
})

console.log('ImageNode crop persistence tests passed')
