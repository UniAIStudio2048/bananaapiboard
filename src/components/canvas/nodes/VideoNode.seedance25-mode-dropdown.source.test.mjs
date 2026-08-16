import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('Seedance 2.5 independent API models render the SD2 mode dropdown', () => {
  assert.match(
    source,
    /const isSeedance2Model = computed\(\(\) => \{[\s\S]*apiType === 'seedance-2\.5'[\s\S]*\}\)/
  )

  const selectorStart = source.indexOf('const activeVideoModeSelector = computed')
  assert.ok(selectorStart >= 0, 'video mode selector should exist')
  const selectorSource = source.slice(selectorStart, selectorStart + 2600)
  assert.match(selectorSource, /key: 'seedance-2'/)
  assert.match(selectorSource, /options: seedance2Modes\.value/)
})
