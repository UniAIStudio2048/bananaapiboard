import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('directory playback keeps hover playback compatible with canvas interaction', () => {
  assert.match(source, /function activateVideoPreview\(options = \{\}\)/)
  assert.match(source, /const force = options\?\.force === true/)
  assert.match(source, /if \(isCanvasMediaMoving\.value && !force\) return/)
  assert.match(source, /@canvas-directory-play="activateVideoPreview\(\{ force: true \}\)"/)
  assert.match(source, /nextTick\(\(\) => handleVideoMouseEnter\(\)\)/)
})
