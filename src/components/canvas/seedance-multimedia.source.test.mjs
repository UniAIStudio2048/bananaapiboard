import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')

for (const type of ['Image', 'Video', 'Audio']) {
  test(`${type} node uses the shared review control with its actual media type`, () => {
    assert.match(read(`nodes/${type}Node.vue`), new RegExp(`<SeedanceReviewButton[\\s\\S]*?asset-type="${type}"`))
  })
}

test('selector exposes all media tabs and does not render every asset as an image', () => {
  const source = read('SeedanceCharacterSelector.vue')
  for (const label of ['全部', '图片', '视频', '音频']) assert.ok(source.includes(label))
  assert.match(source, /mapLocalSeedanceAsset/)
  assert.match(source, /<video/)
  assert.match(source, /<audio/)
})

test('role node preserves media type and can preview video/audio', () => {
  const source = read('nodes/SeedanceCharacterNode.vue')
  assert.match(source, /buildSeedanceCharacterData/)
  assert.match(source, /<video/)
  assert.match(source, /<audio/)
})

test('video submission replaces each media list independently', () => {
  const source = read('nodes/VideoNode.vue')
  assert.match(source, /applyOrderedMediaReplacements\(finalVideos,/)
  assert.match(source, /applyOrderedMediaReplacements\(finalAudios,/)
  assert.match(source, /mediaType: 'video'/)
  assert.match(source, /mediaType: 'audio'/)
})
