import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./NodeContextMenu.vue', import.meta.url), 'utf8')
const zh = readFileSync(new URL('../../i18n/locales/zh-CN.js', import.meta.url), 'utf8')
const en = readFileSync(new URL('../../i18n/locales/en.js', import.meta.url), 'utf8')

test('node context menu conditionally copies normalized media task ids', () => {
  assert.match(source, /getCanvasMediaTaskIds/)
  assert.match(source, /copyableTaskIds\s*=\s*computed/)
  assert.match(source, /copyableTaskIds\.value\.join\(['"]\\n['"]\)/)
  assert.match(source, /navigator\.clipboard\?\.writeText/)
  assert.match(source, /document\.execCommand\(['"]copy['"]\)/)
  assert.match(source, /v-if="copyableTaskIds\.length"/)
  assert.match(source, /@click="copyTaskIds"/)
  assert.match(source, /emit\(['"]close['"]\)/)
})

test('task copy feedback is localized in Chinese and English', () => {
  for (const locale of [zh, en]) {
    assert.match(locale, /copyTaskId:/)
    assert.match(locale, /taskIdCopied:/)
    assert.match(locale, /taskIdCopyFailed:/)
  }
})
