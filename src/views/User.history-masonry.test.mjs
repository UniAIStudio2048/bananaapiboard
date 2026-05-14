import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'User.vue'), 'utf8')

test('user history grids use masonry layout with aspect-ratio based previews', () => {
  assert.match(source, /history-masonry-images/)
  assert.match(source, /history-masonry-videos/)
  assert.match(source, /getImagePreviewAspectStyle/)
  assert.match(source, /getVideoPreviewAspectStyle/)
  assert.doesNotMatch(source, /aspect-video bg-black relative cursor-pointer/)
  assert.doesNotMatch(source, /h-\[220px\] sm:h-\[240px\]/)
})
