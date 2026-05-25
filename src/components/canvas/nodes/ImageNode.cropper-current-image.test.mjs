import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}()`)
  assert.notEqual(start, -1, `${name} should exist`)
  const nextFunction = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction)
}

for (const name of ['handleToolbarCrop', 'handleToolbarOutpaint']) {
  const fn = extractFunction(name)
  assert.match(fn, /const imageUrl = currentImageUrl\.value/, `${name} should use the current displayed image`)
  assert.doesNotMatch(fn, /sourceImages\.value\?\.\[0\] \|\| props\.data\?\.output/, `${name} should not prefer source images over output images`)
}
