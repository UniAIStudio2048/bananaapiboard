import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('AudioNode submits an applied speed as an audio edit task', () => {
  assert.match(source, /function applyPlaybackRate\(\)[\s\S]*?submitAudioEdit\(/)
  assert.match(source, /submitAudioEdit\(\{[\s\S]*?audioUrl:\s*audioUrl\.value[\s\S]*?speed:\s*rate/)
  assert.match(source, /metadata:\s*\{[\s\S]*?operation:\s*['"]speed['"]/)
})
test('AudioNode replaces every downstream audio carrier after speed processing', () => {
  assert.match(source, /task\.metadata\?\.operation === ['"]speed['"][\s\S]*?audioUrl:\s*outputUrl[\s\S]*?audioData:\s*outputUrl[\s\S]*?output:\s*\{[\s\S]*?url:\s*outputUrl/)
})
