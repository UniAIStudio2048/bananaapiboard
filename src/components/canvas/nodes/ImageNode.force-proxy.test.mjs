import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')
const cloudMediaSource = readFileSync(join(__dirname, '../../../utils/cloudMediaUrl.js'), 'utf8')

assert.match(
  source,
  /getSmartImageUrl\(imageUrl\)/,
  'ImageNode canvas crop URLs should delegate to the shared media URL policy'
)
assert.match(
  cloudMediaSource,
  /getApiUrl\('\/api\/images\/proxy'\)}\?force=1&url=\$\{encodeURIComponent\(url\)\}/,
  'legacy ImageNode URLs must still force server-side proxying'
)
