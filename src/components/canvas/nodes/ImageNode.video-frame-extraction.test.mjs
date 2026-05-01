import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

assert.match(source, /extractVideoFrame/, 'ImageNode video tail-frame extraction should use server-side extraction for remote videos')
assert.match(source, /loadVideoDuration/, 'ImageNode should read duration before requesting tail-frame extraction')
assert.match(source, /time:\s*Math\.max\(0,\s*duration - 0\.12\)/, 'ImageNode should send an explicit tail-frame time')
assert.match(source, /canExtractVideoFrameLocally/, 'ImageNode should keep local blob video extraction path')
assert.doesNotMatch(source, /const video = document\.createElement\('video'\)[\s\S]*?ctx\.drawImage\(video, 0, 0, canvas\.width, canvas\.height\)[\s\S]*?extractVideoFrame/, 'remote extraction should not draw CDN videos to canvas before using API')
assert.match(source, /props\.data\?\.extractedFromVideo !== true/, 'tail-frame extraction nodes should not be marked as lost background tasks')
assert.match(source, /\{\{\s*data\.progress\s*\|\|\s*'生成中'\s*\}\}/, 'processing image nodes should show their progress text when provided')
