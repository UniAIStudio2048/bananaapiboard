import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('MiniMax H3 duration options are not replaced by Seedance video_edit auto duration', () => {
  assert.match(
    source,
    /if \(isSeedance2Model\.value && selectedSeedance2Mode\.value === 'video_edit'\) \{\s*return \[\{ value: '-1', label: '自动' \}\]/
  )
})

test('MiniMax H3 duration state is not forced to auto by Seedance video_edit migration', () => {
  assert.match(
    source,
    /if \(isSeedance2Model\.value && selectedSeedance2Mode\.value === 'video_edit'\) \{\s*if \(selectedDuration\.value !== '-1'\) selectedDuration\.value = '-1'/
  )
})

test('MiniMax H3 does not inherit Seedance auto-duration capability', () => {
  assert.match(
    source,
    /const supportsAuto = isSeedance2Model\.value && \(\s*seedance25ModeConstraints\.value\?\.duration === -1/
  )
})
