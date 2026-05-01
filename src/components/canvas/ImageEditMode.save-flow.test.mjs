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
  /canvasStore\.exitEditMode\(\)[\s\S]*persistEditSessionInBackground/,
  'ImageEditMode should close edit mode after final image upload before optional history persistence'
)

console.log('ImageEditMode save flow tests passed')
