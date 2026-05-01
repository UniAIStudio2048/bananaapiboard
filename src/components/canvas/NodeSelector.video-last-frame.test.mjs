import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NodeSelector.vue'), 'utf8')

assert.match(source, /extractVideoFrame/, 'video-last-frame should use server-side extraction so output is uploaded')
assert.match(source, /loadVideoDuration/, 'video-last-frame should read duration before requesting tail-frame extraction')
assert.match(source, /time:\s*Math\.max\(0,\s*duration - 0\.12\)/, 'video-last-frame should send an explicit tail-frame time')
assert.match(source, /mode:\s*'last'/, 'video-last-frame should ask the server to use robust tail-frame extraction')
assert.match(source, /nodeData\.needsFrameExtraction\s*=\s*false/, 'NodeSelector should own extraction to avoid duplicate ImageNode tail-frame requests')
