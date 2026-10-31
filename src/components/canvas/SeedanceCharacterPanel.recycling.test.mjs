import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./SeedanceCharacterPanel.vue', import.meta.url), 'utf8')
test('upload after cloud cleanup keeps the recreated group for all files and local records', async () => {
  const body = source.slice(source.indexOf('async function handleFileUpload('), source.indexOf('\nfunction startPolling('))
  const requested = [], saved = [], polled = [], emitted = []
  const env = {
    props: { selectedGroupId: 'old', spaceFilter: 'current' }, groups: { value: [{ Id: 'old' }] },
    errorMessage: { value: '' }, uploadLoading: { value: false }, fileInputRef: { value: null },
    uploadImages: async () => ['https://media/1', 'https://media/2'], teamStore: { getSpaceParams: () => ({ spaceType: 'personal' }) },
    createAsset: async params => { requested.push(params.GroupId); return { asset: { Id: `asset-${requested.length}`, GroupId: 'new' } } },
    requestedProviderType: { value: undefined }, activeProvider: { value: 'volcengine' },
    isSeedanceOpenApiProProvider: { value: false }, seedanceAssetType: { value: 'seedance-character' },
    saveAsset: async value => { saved.push(value); return { id: saved.length } },
    startPolling: (...args) => polled.push(args), emit: (...args) => emitted.push(args),
    loadAssets: async () => {}, loadGroups: async () => {}
  }
  const upload = new Function(...Object.keys(env), `${body}; return handleFileUpload`)(...Object.values(env))
  await upload({ target: { files: [{ name: 'one.png' }, { name: 'two.png' }] } })
  assert.equal(env.errorMessage.value, '')
  assert.deepEqual(requested, ['old', 'new'])
  assert.deepEqual(saved.map(item => item.metadata.groupId), ['new', 'new'])
  assert.deepEqual(polled.map(args => args[1]), ['new', 'new'])
  assert.ok(emitted.some(args => args[0] === 'clear-group'))
})
