import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const body = source.match(/const canvasVideoToolSources = computed\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1]
assert.ok(body, 'video tool source catalog must be available')
const readSources = new Function('canvasStore', 'videoToolInitialSource', body)

test('video tools list all eight video outputs and exclude image and audio outputs', () => {
  const videos = Array.from({ length: 8 }, (_, i) => ({ id: `video-${i}`, type: 'video', data: { output: { url: `https://media.example/${i}.mp4` } } }))
  const sources = readSources({ nodes: [...videos,
    { id: 'image', type: 'image', data: { output: { type: 'image', url: 'https://media.example/image.png' } } },
    { id: 'audio', type: 'audio', data: { output: { type: 'audio', url: 'https://media.example/audio.mp3' } } }
  ] }, { value: null })
  assert.deepEqual(sources.map(entry => entry.id), videos.map(entry => entry.id))
})

test('video tool sources reuse saved posters and retain the current source', () => {
  const sources = readSources({ nodes: [
    { id: 'generated', type: 'video', data: { output: { url: 'https://media.example/video.mp4', thumbnailUrl: 'https://media.example/poster.jpg' } } },
    { id: 'imported', type: 'video-input', data: { cover_url: 'https://media.example/imported.jpg', output: { url: 'https://media.example/imported.mp4' } } }
  ] }, { value: { id: 'current', url: 'https://media.example/current.mp4' } })
  assert.equal(sources[0].id, 'current')
  assert.equal(sources[1].thumbnailUrl, 'https://media.example/poster.jpg')
  assert.equal(sources[2].thumbnailUrl, 'https://media.example/imported.jpg')
})
