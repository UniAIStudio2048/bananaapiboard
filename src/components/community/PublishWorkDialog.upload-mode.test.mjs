import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./PublishWorkDialog.vue', import.meta.url), 'utf8')

test('both mode initial picker accepts multiple images before media type is chosen', () => {
  const bothModeStart = source.indexOf('<!-- both模式 -->')
  const genericPickerStart = source.indexOf('<!-- 否则显示通用上传 -->', bothModeStart)
  const inputStart = source.indexOf('<input ref="workInput"', genericPickerStart)
  const inputEnd = source.indexOf('/>', inputStart)
  const inputMarkup = source.slice(inputStart, inputEnd)

  assert.match(inputMarkup, /accept="[^"]*image\/png[^"]*video\/mp4[^"]*"/)
  assert.match(inputMarkup, /\bmultiple\b/)
})
