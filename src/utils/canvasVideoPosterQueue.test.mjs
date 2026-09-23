import test from 'node:test'
import assert from 'node:assert/strict'
import { requestCanvasVideoPoster } from './canvasVideoPosterQueue.js'

test('video poster extraction limits concurrency', async () => {
  const releases = []
  let active = 0
  let peak = 0
  const extract = url => new Promise(resolve => {
    active++
    peak = Math.max(peak, active)
    releases.push(() => {
      active--
      resolve({ url: `${url}.jpg` })
    })
  })

  const urls = ['video-a', 'video-b', 'video-c', 'video-d']
  const requests = urls.map(url => requestCanvasVideoPoster(() => extract(url)))
  const flush = () => new Promise(resolve => setImmediate(resolve))
  await flush()
  assert.equal(releases.length, 2)
  for (let i = 0; i < urls.length; i++) {
    assert.ok(releases.length > 0)
    releases.shift()()
    await flush()
  }
  assert.deepEqual((await Promise.all(requests)).map(result => result.url), urls.map(url => `${url}.jpg`))
  assert.equal(peak, 2)
})

test('a failed extraction releases a slot for the next poster', async () => {
  const failed = requestCanvasVideoPoster(async () => { throw new Error('unavailable') })
  await assert.rejects(failed, /unavailable/)
  await assert.rejects(requestCanvasVideoPoster(async () => ({})), /未返回封面/)
  assert.deepEqual(await requestCanvasVideoPoster(async () => ({ url: 'cover.jpg' })), { url: 'cover.jpg' })
})

test('an aborted queued poster never starts extraction', async () => {
  const releases = []
  const hold = () => new Promise(resolve => releases.push(resolve))
  const first = requestCanvasVideoPoster(hold)
  const second = requestCanvasVideoPoster(hold)
  const controller = new AbortController()
  const queued = requestCanvasVideoPoster(() => assert.fail('aborted extraction started'), controller.signal)
  controller.abort()
  await assert.rejects(queued, { name: 'AbortError' })
  await new Promise(resolve => setImmediate(resolve))
  releases.forEach(resolve => resolve({ url: 'cover.jpg' }))
  await Promise.all([first, second])
})
