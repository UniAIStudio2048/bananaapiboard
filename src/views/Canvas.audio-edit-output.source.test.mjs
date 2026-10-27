import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')

test('Canvas persists the processed audio URL in all node output fields', () => {
  const audioEditBranch = source.match(/task\.type === 'audio-edit'[\s\S]*?\n    \} else if \(task\.type === 'video'/)?.[0] || ''
  assert.match(audioEditBranch, /audioUrl,/)
  assert.match(audioEditBranch, /audioData: audioUrl/)
  assert.match(audioEditBranch, /url: audioUrl/)
})
