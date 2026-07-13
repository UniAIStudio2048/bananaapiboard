import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./AssetHoverPreview.vue', import.meta.url), 'utf8')

test('hover preview stops old playback when the asset changes or closes', () => {
  assert.match(source, /watch\(\[\(\) => props\.visible, \(\) => props\.asset\?\.id\]/)
  assert.match(source, /cleanupMedia\(\)[\s\S]*?if \(visible\)/)
  assert.match(source, /media\.pause\?\.\(\)/)
  assert.match(source, /media\.currentTime = 0/)
  assert.match(source, /:key="asset\.id"/)
})
