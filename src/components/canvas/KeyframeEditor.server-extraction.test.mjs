import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'KeyframeEditor.vue'), 'utf8')

assert.match(source, /extractVideoFrame/, 'KeyframeEditor should use the server-side frame extraction API')
assert.match(source, /time:\s*currentTime\.value/, 'KeyframeEditor should request the current playback time')
