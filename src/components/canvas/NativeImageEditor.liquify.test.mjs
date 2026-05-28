import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NativeImageEditor.vue'), 'utf8')

assert.match(
  source,
  /from '\.\/nativeImageLiquify\.js'/,
  'NativeImageEditor should import the shared liquify utility'
)

assert.match(source, /调色混色器/, 'top toolbar should present the color mixer')
assert.doesNotMatch(source, />滤镜</, 'top toolbar should no longer display 滤镜')
assert.match(source, /液化/, 'mixer panel should expose liquify controls')
assert.match(source, /画笔大小/, 'liquify controls should expose brush size')
assert.match(source, /压力/, 'liquify controls should expose pressure')
assert.match(source, /activeMixerTab = ref\('hue'\)/, 'editor should track mixer tab state')
assert.match(source, /id: 'liquify'/, 'mixer tabs should include a liquify tab')
assert.match(source, /applyLiquifyPush/, 'editor should use the liquify utility')
assert.match(source, /resetLiquify/, 'editor should support resetting liquify changes')

console.log('NativeImageEditor liquify source tests passed')
