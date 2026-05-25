import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasThumbnail.js'), 'utf8')

assert.match(
  source,
  /getApiUrl\('\/api\/images\/proxy'\)}\?force=1&url=\$\{encodeURIComponent\(url\)\}/,
  'canvas editor proxy URLs must force server-side proxying to avoid 302-to-CDN CORS failures'
)
