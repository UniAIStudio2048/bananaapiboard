import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./SeedanceCharacterPanel.vue', import.meta.url), 'utf8')
test('CDance polling persists the local group and originating provider after a channel switch', async () => {
  const start = source.indexOf('function startPolling(')
  const end = source.indexOf('\nfunction ', start + 1)
  let resolvePoll
  const writes = []
  const state = {
    activeProvider: { value: 'ctyun_asset' }, requestedProviderType: { value: undefined },
    pollAssetStatus: (_, options) => {
      assert.equal(options.providerType, 'ctyun_asset')
      return { promise: new Promise(resolve => { resolvePoll = resolve }), cancel() {} }
    },
    pollers: { value: {} }, allAssets: { value: [] }, updateAsset: async (id, data) => { writes.push({ id, data }) },
    loadAssets() {}, emit() {}, isByteforLibrary: { value: false }, props: { libraryType: 'seedance' },
    console: { error() {}, log() {} }
  }
  const startPolling = new Function('sandbox', `with (sandbox) { ${source.slice(start, end)}; return startPolling }`)(state)
  startPolling('123', 'ctyun-local-one', 'https://example.com/image.png', 'name', 'local-asset')
  state.activeProvider.value = 'stars_asset'
  resolvePoll({ Id: '123', GroupId: 'remote-shared-group', Status: 'Active', AssetType: 'Image' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes[0].data.metadata.groupId, 'ctyun-local-one')
  assert.equal(writes[0].data.metadata.providerType, 'ctyun_asset')
})

test('failed polling retains CDance origin for later recovery', async () => {
  const start = source.indexOf('function startPolling(')
  const end = source.indexOf('\nfunction ', start + 1)
  const writes = []
  const state = {
    activeProvider: { value: 'stars_asset' }, requestedProviderType: { value: undefined },
    pollAssetStatus: (_, options) => {
      assert.equal(options.providerType, 'ctyun_asset')
      return { promise: Promise.reject(new Error('轮询超时')), cancel() {} }
    },
    pollers: { value: {} }, allAssets: { value: [] }, updateAsset: async (_, data) => { writes.push(data) },
    loadAssets() {}, console: { error() {} }
  }
  const startPolling = new Function('sandbox', `with (sandbox) { ${source.slice(start, end)}; return startPolling }`)(state)
  startPolling('123', 'ctyun-local-one', 'https://example.com/image.png', 'name', 'local', 'ctyun_asset')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes[0].metadata.providerType, 'ctyun_asset')
  assert.equal(writes[0].metadata.status, 'Processing')
  assert.equal(writes[0].metadata.originalUrl, 'https://example.com/image.png')
})
