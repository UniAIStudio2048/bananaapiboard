import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./ai-assistant.js', import.meta.url), 'utf8')

test('streaming assistant requests accept an abort signal', () => {
  assert.match(source, /const \{ onContent,[\s\S]*signal,[\s\S]*\} = params/)
  assert.match(source, /body: JSON\.stringify\(/)
  assert.match(source, /signal\n\s*\}\)/)
})
