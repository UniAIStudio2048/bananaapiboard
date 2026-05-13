import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasThumbnail.js'), 'utf8')

assert.match(
  source,
  /if\s*\(isCosCdn\(url\)\s*&&\s*!isVideoUrl\(url\)\)\s*\{\s*return url\s*\}/s,
  'Canvas image nodes should render COS CDN images with the original URL instead of generated imageMogr2 thumbnails'
)

console.log('Canvas COS preview tests passed')
