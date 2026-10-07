import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const vue = require('vue')
const { renderToString } = require('@vue/server-renderer')
const { descriptor } = parse(readFileSync(new URL('./VideoSourceRail.vue', import.meta.url), 'utf8'))
const compiled = transformSync(compileScript(descriptor, { id: 'rail-media-budget', inlineTemplate: true }).content, { format: 'cjs' }).code

async function renderRail(canvasVideos) {
  let probes = 0
  const module = { exports: {} }
  const runtimeRequire = id => {
    if (id === 'vue') return vue
    if (id === '@/config/tenant') return { getMediaUrl: url => url }
    if (id === '@/api/canvas/history') return { getHistory: async () => ({ history: [] }) }
    if (id === '@/api/canvas/workflow') return { uploadCanvasMedia: async () => {} }
    throw new Error(`Unexpected import: ${id}`)
  }
  const document = {
    createElement() {
      probes++
      return { removeAttribute() {}, load() {}, set src(value) { queueMicrotask(() => this.onerror?.()) } }
    }
  }
  new Function('require', 'module', 'exports', 'document', 'setTimeout', compiled)(runtimeRequire, module, module.exports, document, () => 0)
  const html = await renderToString(vue.createSSRApp(module.exports.default, { canvasVideos }))
  return { html, probes }
}

for (const count of [1, 5, 8, 50]) {
  test(`${count} canvas sources do not mount thumbnail video players`, async () => {
    const sources = Array.from({ length: count }, (_, i) => ({ id: `video-${i}`, url: `https://media.example/${i}.mp4`, duration: 3 }))
    const { html, probes } = await renderRail(sources)
    assert.equal((html.match(/class="video-source-rail__item"/g) || []).length, count)
    assert.equal((html.match(/<video\b/g) || []).length, 0, 'thumbnail requests must not occupy the active preview connections')
    assert.equal(probes, 0)
  })
}

test('sources with missing durations do not probe media until selected', async () => {
  const sources = Array.from({ length: 8 }, (_, i) => ({ id: `video-${i}`, url: `https://media.example/${i}.mp4` }))
  const { probes } = await renderRail(sources)
  assert.equal(probes, 0, 'listing videos must not start background metadata requests')
})

test('saved video posters remain visible without mounting a player', async () => {
  const { html } = await renderRail([{ id: 'poster', url: 'https://media.example/video.mp4', thumbnailUrl: 'https://media.example/poster.jpg', duration: 3 }])
  assert.match(html, /<img[^>]+src="https:\/\/media.example\/poster.jpg"/)
  assert.doesNotMatch(html, /<video\b/)
})
