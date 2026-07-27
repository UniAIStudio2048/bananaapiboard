import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VoicePresetPicker.vue', import.meta.url), 'utf8')

test('voice picker defaults to simplified Chinese', () => {
  assert.match(source, /const locale = ref\('zh-CN'\)/)
  assert.match(source, /中文（简体）/)
})

test('voice picker paginates the list from the bottom', () => {
  assert.match(source, /const currentPage = ref\(1\)/)
  assert.match(source, /const paginatedVoices = computed\(/)
  assert.match(source, /class="voice-picker-pagination"/)
  assert.match(source, /上一页/)
  assert.match(source, /下一页/)
})

test('voice picker shows each voice type description', () => {
  assert.match(source, /voice\.description/)
})
