import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./VideoNode.vue', import.meta.url)), 'utf8')

test('换口型仅在显式选择 HeyGen 模型时触发，不再因普通视频模型连视频+音频而自动切换', () => {
  assert.doesNotMatch(source, /isNativeVideoAudioReferenceModel/)
  assert.match(source, /const isHeygenLipsyncMode = computed\(\(\) => isHeygenModelSelected\.value && !isDigitalHumanMode\.value && referenceVideos\.value\.length > 0 && referenceAudios\.value\.length > 0\)/)
  assert.match(source, /const isHeygenFlow = isHeygenModelSelected\.value \|\| upstreamData\.digitalHumans\.length > 0\n/)
  assert.doesNotMatch(source, /isHeygenFlow = isHeygenModelSelected\.value \|\| upstreamData\.digitalHumans\.length > 0 \|\|/)
})
