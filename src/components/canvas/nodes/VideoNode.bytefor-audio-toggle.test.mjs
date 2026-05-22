import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

test('Bytefor Seedance models do not render the Seedance audio toggle', () => {
  assert.match(
    source,
    /if\s*\(\s*isByteforVideoModel\.value\s*\)\s*return\s+false/,
    'Bytefor models should be excluded before Seedance name fallback renders the audio switch'
  )
  assert.match(
    source,
    /<template\s+v-if="isSeedanceModel && !isSeedance2Model">/,
    'Seedance 1.5 audio toggle remains scoped to the Seedance model branch'
  )
})
