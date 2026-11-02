import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const source = readFileSync(new URL('./SeedanceReviewButton.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const render = new Function('Vue', compile(source.match(/<template>([\s\S]*?)<\/template>/)[1], { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const hub = { id: 'tokenhub_asset', label: '天枢 TokenHub 素材', assetTypes: ['Image', 'Video', 'Audio'] }
const official = { id: 'volcengine', label: '火山引擎官方', assetTypes: ['Image', 'Video', 'Audio'] }
const face = { id: 'seedance_openapi_pro', label: 'OpenAPI Pro', assetTypes: ['Image'] }

function setup(options, assetType = 'Video', savedProvider) {
  let available = options
  const props = { nodeId: 'node1', assetType, data: savedProvider ? { seedanceQuickAsset: { providerType: savedProvider } } : {} }
  const ui = new Function('deps', `with (deps) { ${script}; return { enabled, providers, selectedProvider, loadingProviders, status, queryFailed, buttonText, submitting, submit, loadProviders, getProvider, data: props.data } }`)({
    ...Vue, onMounted() {}, onUnmounted() {},
    defineProps: () => props,
    useCanvasStore: () => ({ nodes: [{ id: 'node1', data: props.data }] }),
    useTeamStore: () => ({}), isSeedanceFeaturesEnabled: () => true,
    getAssetReviewProviders: async () => ({ activeProvider: 'volcengine', enabledProviders: available }),
    getSeedanceQuickAssetStatus: () => 'idle',
    createSeedanceReviewController: () => ({ submit() {}, resume() {}, dispose() {} }),
    showToast() {}, pollAssetStatus() {}
  })
  return { ui, setOptions: value => { available = value }, html: () => renderToString(Vue.createSSRApp({ setup: () => ui, render })) }
}

test('single enabled channel submits by default without rendering a dropdown', async () => {
  const f = setup([hub])
  await f.ui.loadProviders()
  assert.equal(f.ui.selectedProvider.value, hub.id)
  assert.equal(await f.ui.getProvider(), hub.id)
  const html = await f.html()
  assert.ok(!html.includes('<select'))
  assert.ok(html.includes('过审'))
})

test('multiple channels render an accessible dropdown and submit the user selection', async () => {
  const f = setup([official, hub])
  await f.ui.loadProviders()
  const html = await f.html()
  assert.ok(html.includes('aria-label="素材审核渠道"'))
  assert.ok(html.includes('天枢 TokenHub 素材'))
  f.ui.selectedProvider.value = hub.id
  assert.equal(await f.ui.getProvider(), hub.id)
})

test('unsupported media channels are excluded; saved channel wins over the default', async () => {
  const f = setup([official, hub, face], 'Audio', hub.id)
  await f.ui.loadProviders()
  assert.deepEqual(f.ui.providers.value.map(p => p.id), [official.id, hub.id])
  assert.equal(f.ui.selectedProvider.value, hub.id)
  const image = setup([official, face], 'Image')
  await image.ui.loadProviders()
  assert.equal(image.ui.providers.value.length, 2)
})

test('stale or missing channel configuration fails before submission instead of falling back to official', async () => {
  const f = setup([official, hub])
  await f.ui.loadProviders()
  f.ui.selectedProvider.value = hub.id
  f.setOptions([official])
  await assert.rejects(f.ui.getProvider(), /已停用/)
  const empty = setup([])
  await assert.rejects(empty.ui.getProvider(), /暂无/)
})
