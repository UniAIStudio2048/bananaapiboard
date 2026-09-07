import assert from 'node:assert/strict'
import test from 'node:test'
import { createSeedanceReviewController } from './seedanceReviewController.js'

function setup(overrides = {}) {
  let data = { sourceVideo: 'https://cdn.example/movie.mp4' }
  let sourceUrl = data.sourceVideo
  const calls = []
  let finish
  let rejectPoll
  const pollPromise = new Promise((resolve, reject) => { finish = resolve; rejectPoll = reject })
  const controller = createSeedanceReviewController({
    getData: () => data,
    getSourceUrl: () => sourceUrl,
    assetType: 'Video',
    nodeId: 'node-1',
    update: patch => { data = { ...data, seedanceQuickAsset: { ...data.seedanceQuickAsset, ...patch } } },
    resolveUrl: async url => url,
    getProvider: async () => 'stars_asset',
    create: async body => { calls.push(body); return { quickAsset: { assetId: 'review-1', assetUri: 'asset://review-1', status: 'Processing', providerType: 'stars_asset', groupId: 'group-1' } } },
    poll: (id, options) => { calls.push({ id, options }); return { promise: pollPromise, cancel() {} } },
    notify() {},
    ...overrides
  })
  return { controller, calls, getData: () => data, setData: value => { data = value }, changeSource: value => { sourceUrl = value }, finish, rejectPoll }
}

test('duplicate submission is suppressed and polling keeps the submitted provider', async () => {
  const state = setup()
  await Promise.all([state.controller.submit(), state.controller.submit()])
  assert.equal(state.calls.filter(call => call.URL).length, 1)
  assert.equal(state.calls[0].AssetType, 'Video')
  assert.equal(state.calls[1].options.providerType, 'stars_asset')
  state.finish({ Id: 'review-1', Status: 'Active' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.getData().seedanceQuickAsset.status, 'Active')
})

test('late review response cannot approve a replaced media source', async () => {
  const state = setup()
  await state.controller.submit()
  state.changeSource('https://cdn.example/new.mp4')
  state.finish({ Id: 'review-1', Status: 'Active' })
  await new Promise(resolve => setImmediate(resolve))
  assert.notEqual(state.getData().seedanceQuickAsset.status, 'Active')
})

test('network polling failure preserves processing asset and resumes without creating another', async () => {
  const state = setup()
  await state.controller.submit()
  state.rejectPoll(new Error('轮询超时'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.getData().seedanceQuickAsset.status, 'Processing')
  assert.match(state.getData().seedanceQuickAsset.error, /超时/)
  await state.controller.submit()
  assert.equal(state.calls.filter(call => call.URL).length, 1)
})

test('image-only provider rejects video before uploading or creating', async () => {
  let uploaded = false
  const state = setup({ getProvider: async () => 'seedance_openapi_pro', resolveUrl: async () => { uploaded = true } })
  await state.controller.submit()
  assert.equal(uploaded, false)
  assert.equal(state.calls.length, 0)
})

test('failed upload never creates an asset', async () => {
  const state = setup({ resolveUrl: async () => { throw new Error('上传失败') } })
  await state.controller.submit()
  assert.equal(state.calls.length, 0)
})

test('restored processing assets resume their saved provider without resubmitting', async () => {
  const state = setup()
  state.setData({ seedanceQuickAsset: { assetId: 'saved', assetUri: 'asset://saved', sourceUrl: 'https://cdn.example/movie.mp4', assetType: 'Video', providerType: 'volcengine', status: 'Processing' } })
  state.controller.resume()
  assert.equal(state.calls[0].id, 'saved')
  assert.equal(state.calls[0].options.providerType, 'volcengine')
  state.controller.dispose()
})

test('expired processing assets do not resume polling on mount', () => {
  const state = setup()
  state.setData({ seedanceQuickAsset: { assetId: 'expired', status: 'Processing', expiresAt: '2000-01-01' } })
  state.controller.resume()
  assert.equal(state.calls.length, 0)
})

test('separate nodes can submit concurrently without sharing review state', async () => {
  const video = setup()
  const audio = setup({ assetType: 'Audio', nodeId: 'audio-1' })
  await Promise.all([video.controller.submit(), audio.controller.submit()])
  assert.equal(video.calls[0].AssetType, 'Video')
  assert.equal(audio.calls[0].AssetType, 'Audio')
  video.controller.dispose()
  audio.controller.dispose()
})

test('image review retains the face URI returned by a face-only channel', async () => {
  const state = setup({ assetType: 'Image', getProvider: async () => 'seedance_openapi_pro', create: async () => ({ quickAsset: { assetId: 'face-code', assetUri: 'face:face-code', providerType: 'seedance_openapi_pro', status: 'Active' } }) })
  await state.controller.submit()
  assert.equal(state.getData().seedanceQuickAsset.assetUri, 'face:face-code')
})

test('a replaced source ignores a late CreateAsset response', async () => {
  let finishCreate
  const state = setup({ create: () => new Promise(resolve => { finishCreate = resolve }) })
  const submitting = state.controller.submit()
  await new Promise(resolve => setImmediate(resolve))
  state.changeSource('https://cdn.example/new.mp4')
  finishCreate({ quickAsset: { assetId: 'late', status: 'Active' } })
  await submitting
  assert.equal(state.getData().seedanceQuickAsset, undefined)
})

test('an upstream rejection is displayed as failed rather than a polling error', async () => {
  const state = setup()
  await state.controller.submit()
  state.calls[1].options.onStatusChange('Failed', { FailMessage: '审核不通过' })
  state.rejectPoll(new Error('审核不通过'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.getData().seedanceQuickAsset.status, 'Failed')
  assert.equal(state.getData().seedanceQuickAsset.error, '审核不通过')
})

test('legacy review records bind their current source on mount so future replacements invalidate them', () => {
  const state = setup()
  state.setData({ seedanceQuickAsset: { assetId: 'legacy', assetUri: 'asset://legacy', status: 'Active' } })
  state.controller.resume()
  assert.equal(state.getData().seedanceQuickAsset.sourceUrl, 'https://cdn.example/movie.mp4')
  assert.equal(state.getData().seedanceQuickAsset.assetType, 'Video')
})
