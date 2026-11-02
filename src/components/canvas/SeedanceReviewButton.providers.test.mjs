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

function setup(options, assetType = 'Video', savedProvider, savedStatus = 'idle') {
  let available = options
  const submitted = []
  let outsideClick
  const props = { nodeId: 'node1', assetType, data: savedProvider ? { seedanceQuickAsset: { providerType: savedProvider } } : {} }
  const ui = new Function('deps', `with (deps) { ${script}; return { enabled, providers, selectedProvider, loadingProviders, status, queryFailed, buttonText, submitting, submit, loadProviders, getProvider, reviewControl, reviewButton, menuOpen, handleReviewClick, submitToProvider, closeMenu, providerDisabled, data: props.data } }`)({
    ...Vue, onMounted() {}, onUnmounted() {},
    onClickOutside: (_target, callback) => { outsideClick = callback },
    defineProps: () => props,
    useCanvasStore: () => ({ nodes: [{ id: 'node1', data: props.data }] }),
    useTeamStore: () => ({}), isSeedanceFeaturesEnabled: () => true,
    getAssetReviewProviders: async () => ({ activeProvider: 'volcengine', enabledProviders: available }),
    getSeedanceQuickAssetStatus: () => savedStatus,
    createSeedanceReviewController: config => ({ async submit() { submitted.push(await config.getProvider()) }, resume() {}, dispose() {} }),
    showToast() {}, pollAssetStatus() {}
  })
  return { ui, submitted, outsideClick: () => outsideClick(), setOptions: value => { available = value }, html: () => renderToString(Vue.createSSRApp({ setup: () => ui, render })) }
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

test('multiple channels stay inside the review button and selecting a menu item submits immediately', async () => {
  const f = setup([official, hub])
  await f.ui.loadProviders()
  const html = await f.html()
  assert.ok(!html.includes('<select'))
  assert.ok(!html.includes(hub.label))
  assert.ok(html.includes('aria-haspopup="menu"'))
  await f.ui.handleReviewClick()
  assert.deepEqual(f.submitted, [])
  assert.equal(f.ui.menuOpen.value, true)
  const menuHtml = await f.html()
  assert.ok(menuHtml.includes('role="menu"'))
  assert.ok(menuHtml.includes('aria-label="素材审核渠道"'))
  assert.ok(menuHtml.includes(hub.label))
  await f.ui.submitToProvider(hub.id)
  assert.deepEqual(f.submitted, [hub.id])
  assert.equal(f.ui.menuOpen.value, false)
})

for (const [assetType, nodeFile] of [['Image', 'ImageNode.vue'], ['Video', 'VideoNode.vue'], ['Audio', 'AudioNode.vue']]) {
  test(`${assetType} node uses the shared menu and single-channel review stays one click`, async () => {
    const node = readFileSync(new URL(`./nodes/${nodeFile}`, import.meta.url), 'utf8')
    assert.match(node, new RegExp(`<SeedanceReviewButton[^>]*asset-type="${assetType}"`))
    const single = setup([hub], assetType)
    await single.ui.loadProviders()
    await single.ui.handleReviewClick()
    assert.deepEqual(single.submitted, [hub.id])
    assert.equal(single.ui.menuOpen.value, false)
    const multi = setup([official, hub], assetType)
    await multi.ui.loadProviders()
    await multi.ui.handleReviewClick()
    await multi.ui.submitToProvider(hub.id)
    assert.deepEqual(multi.submitted, [hub.id])
  })
}

for (const savedStatus of ['approved', 'processing']) {
  test(`${savedStatus} review still opens the menu to submit through another channel`, async () => {
    const f = setup([official, hub], 'Video', official.id, savedStatus)
    await f.ui.loadProviders()
    const html = await f.html()
    assert.doesNotMatch(html, /<button[^>]*disabled/)
    await f.ui.handleReviewClick()
    assert.equal(f.ui.menuOpen.value, true)
    assert.equal(f.ui.providerDisabled(official.id), true)
    assert.equal(f.ui.providerDisabled(hub.id), false)
    await f.ui.submitToProvider(official.id)
    assert.deepEqual(f.submitted, [])
    await f.ui.submitToProvider(hub.id)
    assert.deepEqual(f.submitted, [hub.id])
  })
}

test('outside click and Escape close the menu; busy submissions cannot reopen it', async () => {
  const f = setup([official, hub])
  await f.ui.loadProviders()
  await f.ui.handleReviewClick()
  f.outsideClick()
  assert.equal(f.ui.menuOpen.value, false)
  await f.ui.handleReviewClick()
  let focused = false
  f.ui.reviewButton.value = { focus() { focused = true } }
  f.ui.closeMenu()
  assert.equal(f.ui.menuOpen.value, false)
  assert.equal(focused, true)
  f.ui.submitting.value = true
  await f.ui.handleReviewClick()
  await f.ui.submitToProvider(hub.id)
  assert.equal(f.ui.menuOpen.value, false)
  assert.deepEqual(f.submitted, [])
})

test('a channel removed while its menu is open cannot be submitted', async () => {
  const f = setup([official, hub])
  await f.ui.loadProviders()
  await f.ui.handleReviewClick()
  f.ui.providers.value = [official]
  await f.ui.submitToProvider(hub.id)
  assert.deepEqual(f.submitted, [])
})

test('choosing another channel preserves the saved review status until a new review is created', async () => {
  const f = setup([official, hub], 'Image', official.id, 'approved')
  await f.ui.loadProviders()
  await f.ui.handleReviewClick()
  await f.ui.submitToProvider(hub.id)
  assert.equal(f.ui.providerDisabled(official.id), true)
  await f.ui.handleReviewClick()
  assert.match(await f.html(), /已过审/)
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
