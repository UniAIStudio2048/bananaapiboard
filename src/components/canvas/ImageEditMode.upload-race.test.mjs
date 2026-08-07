import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageEditMode.vue'), 'utf8')

assert.match(
  source,
  /async function waitForNodeUploadSettled\(/,
  'ImageEditMode should wait for an in-flight node upload to settle before writing back the edited image'
)
assert.match(
  source,
  /await waitForNodeUploadSettled\(nodeId\)[\s\S]*?buildNodeImagePatch\(node, data\.image\)/,
  'ImageEditMode should wait for the pending upload BEFORE replacing node media with the transient preview URL'
)
assert.match(
  source,
  /isUploading:\s*false[\s\S]*?uploadStatus:\s*'completed'/,
  'ImageEditMode should clear the uploading state after the edited image upload completes'
)
assert.match(
  source,
  /replaceEditedMediaUrls\([\s\S]*?data\.image[\s\S]*?newImageUrl\)/,
  'ImageEditMode should replace the transient preview URL in source and downstream nodes after the edited upload'
)

const uploadInBackground = source.match(/async function uploadEditedImageInBackground[\s\S]*?\n\}/)
assert.ok(uploadInBackground, 'uploadEditedImageInBackground should exist')
assert.match(
  uploadInBackground[0],
  /catch \(error\) \{[\s\S]*?replaceEditedMediaUrls\([\s\S]*?data\.image[\s\S]*?settledUrl\)/,
  'ImageEditMode should roll the transient preview URL back to the original URL when the edited upload fails'
)
assert.match(
  uploadInBackground[0],
  /else \{\s*canvasStore\.updateNodeData\(nodeId, \{ _editSaving: false \}\)[\s\S]*?replaceEditedMediaUrls\([\s\S]*?data\.image[\s\S]*?settledUrl\)/,
  'ImageEditMode should roll back the transient preview URL when the edited upload returns no URL'
)

console.log('ImageEditMode upload race tests passed')
