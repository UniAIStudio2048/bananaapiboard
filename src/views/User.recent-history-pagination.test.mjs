import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'User.vue'), 'utf8')

test('user page initial history request uses pagination page sizes instead of fixed 12', () => {
  assert.match(source, /\/api\/user\/recent-images\?limit=\$\{imagesLimit\.value\}&offset=0/)
  assert.match(source, /\/api\/user\/recent-videos\?limit=\$\{videosLimit\.value\}&offset=0/)
  assert.doesNotMatch(source, /\/api\/user\/recent-images\?limit=12&offset=0/)
  assert.doesNotMatch(source, /\/api\/user\/recent-videos\?limit=12&offset=0/)
})
