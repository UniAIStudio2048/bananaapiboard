import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const compiled = await build({
  stdin: { contents: `export { BlendModeSelect } from './BlendModeSelect'; export { setLanguage } from '../../../i18n/index.js'`, resolveDir: new URL('.', import.meta.url).pathname },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom']
})
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)

test('video editor controls use the selected language, including options loaded before switching', async () => {
  const previousStorage = globalThis.localStorage, previousDocument = globalThis.document, previousWindow = globalThis.window
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  globalThis.document = { documentElement: {} }
  globalThis.window = { dispatchEvent() {} }
  try {
    await module.exports.setLanguage('en')
    const english = renderToStaticMarkup(React.createElement(module.exports.BlendModeSelect, { onChange() {} }))
    assert.doesNotMatch(english, /混合模式|正片叠底/)
    assert.match(english, /value="multiply"/)
    await module.exports.setLanguage('zh-CN')
    const chinese = renderToStaticMarkup(React.createElement(module.exports.BlendModeSelect, { onChange() {} }))
    assert.match(chinese, /混合模式/)
    assert.match(chinese, /正片叠底/)
  } finally { globalThis.localStorage = previousStorage; globalThis.document = previousDocument; globalThis.window = previousWindow }
})

test('preview hit testing uses stable attributes independent of translated accessibility labels', () => {
  const source = readFileSync(new URL('./preview-hit.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\[aria-label=/)
  for (const [file, kind] of [['VideoLayerTrack.tsx', 'video'], ['ImageTrack.tsx', 'image'], ['TextOverlay.tsx', 'text']]) {
    assert.ok(source.includes(`[data-preview-layer="${kind}"]`))
    assert.ok(readFileSync(new URL(file, import.meta.url), 'utf8').includes(`data-preview-layer="${kind}"`))
  }
})
