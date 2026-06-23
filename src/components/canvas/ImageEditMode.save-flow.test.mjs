import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageEditMode.vue'), 'utf8')

assert.match(
  source,
  /persistEditSessionInBackground/,
  'ImageEditMode should persist edit history in the background so image saving is not blocked'
)
assert.doesNotMatch(
  source,
  /let persistedSession|persistedSession \? \{ editSession: persistedSession \}/,
  'ImageEditMode save flow should not wait for edit history persistence before updating the image node'
)
assert.match(
  source,
  /await uploadEditedImageInBackground\(nodeId, nodeSnapshot, data\)[\s\S]*canvasStore\.exitEditMode\(\)/,
  'ImageEditMode should keep edit mode alive until final image upload updates the node'
)
assert.doesNotMatch(
  source,
  /canvasStore\.exitEditMode\(\)\s*\n\s*if \(data\.image\) \{[\s\S]*uploadEditedImageInBackground\(nodeId, nodeSnapshot, data\)/,
  'ImageEditMode should not exit before starting the final image upload'
)
assert.match(
  source,
  /function buildNodeImagePatch\(node, newUrl\) \{[\s\S]*node\.data\?\.output\?\.urls\?\.length > 0[\s\S]*url: newUrl[\s\S]*urls: \[newUrl,/,
  'ImageEditMode should keep output.url synchronized with output.urls[0] after edits'
)

console.log('ImageEditMode save flow tests passed')
