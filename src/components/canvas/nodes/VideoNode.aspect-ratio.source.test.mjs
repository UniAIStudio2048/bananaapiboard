import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('VideoNode base aspect ratio list includes 21:9 ultra-wide', () => {
  assert.match(source, /\{ value: '21:9', label: '21:9 超宽' \}/)
})
