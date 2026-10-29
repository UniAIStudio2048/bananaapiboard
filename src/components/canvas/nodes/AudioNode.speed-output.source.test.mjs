import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('AudioNode submits an applied speed as an audio edit task', () => {
  const apply = source.slice(source.indexOf('async function applyPlaybackRate('), source.indexOf('// 监听编组整组执行触发'))
  assert.match(apply, /const sourceUrl = audioUrl\.value/)
  assert.match(apply, /submitAudioEdit\(\{[\s\S]*?audioUrl:\s*sourceUrl[\s\S]*?speed:\s*rate/)
  assert.match(apply, /metadata:\s*\{[\s\S]*?operation:\s*['"]speed['"]/)
})
test('AudioNode replaces every downstream audio carrier after speed processing', () => {
  assert.match(source, /task\.metadata\?\.operation === ['"]speed['"][\s\S]*?audioUrl:\s*outputUrl[\s\S]*?audioData:\s*outputUrl[\s\S]*?output:\s*\{[\s\S]*?url:\s*outputUrl/)
})
