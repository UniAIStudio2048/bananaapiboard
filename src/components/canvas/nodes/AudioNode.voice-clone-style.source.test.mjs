import { localizedPattern } from '../../../i18n/sourceAssertions.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('voice clone reuses the voice characteristic selector with an empty default', () => {
  assert.match(source, /audioCapability === 'voice_design' \|\| audioCapability === 'voice_clone'/)
  assert.match(source, localizedPattern(/audioCapability\.value === 'voice_clone' \? '声音特征' : '音色设计'/))
  assert.match(source, /voiceCustomDescription = ref\(props\.data\.voiceCustomDescription \|\| ''\)/)
  assert.match(source, /body\.style = voiceDesignStyle\.value\s*body\.reference_audio_url = inheritedAudioUrl\.value/)
})
