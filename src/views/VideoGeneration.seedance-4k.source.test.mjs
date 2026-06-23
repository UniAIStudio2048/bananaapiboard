import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

test('VideoGeneration exposes 4k for Seedance resolution selection', () => {
  assert.match(source, /@click="seedanceResolution = '4k'"/)
  assert.match(source, /seedanceResolution === '4k'/)
})
