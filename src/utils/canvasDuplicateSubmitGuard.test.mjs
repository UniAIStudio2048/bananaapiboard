import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createCanvasDuplicateSubmitGuard,
  buildCanvasSubmitFingerprint
} from './canvasDuplicateSubmitGuard.js'

test('blocks identical canvas generation submits inside the duplicate window', () => {
  const guard = createCanvasDuplicateSubmitGuard({ windowMs: 2000, now: () => 1000 })
  const fingerprint = buildCanvasSubmitFingerprint({
    nodeId: 'image-1',
    nodeType: 'image',
    prompt: 'a banana robot',
    model: 'nano-banana-2',
    aspectRatio: '1:1',
    imageSize: '2K',
    selectedCount: 1,
    referenceImages: ['https://files.example/a.png']
  })

  assert.equal(guard.check(fingerprint).blocked, false)
  assert.deepEqual(guard.check(fingerprint), {
    blocked: true,
    message: '检测到重复提交，请稍后再试'
  })
})

test('allows identical submits after the duplicate window expires', () => {
  let currentTime = 1000
  const guard = createCanvasDuplicateSubmitGuard({ windowMs: 2000, now: () => currentTime })
  const fingerprint = buildCanvasSubmitFingerprint({
    nodeId: 'video-1',
    nodeType: 'video',
    prompt: 'slow camera push',
    model: 'sora-2',
    aspectRatio: '16:9',
    duration: '10',
    selectedCount: 1,
    referenceImages: ['https://files.example/a.png']
  })

  assert.equal(guard.check(fingerprint).blocked, false)
  currentTime = 3101
  assert.equal(guard.check(fingerprint).blocked, false)
})

test('blocks identical submits while a canvas request is still in flight after the duplicate window expires', () => {
  let currentTime = 1000
  const guard = createCanvasDuplicateSubmitGuard({ windowMs: 2000, now: () => currentTime })
  const fingerprint = buildCanvasSubmitFingerprint({
    nodeId: 'video-1',
    nodeType: 'video',
    prompt: 'slow camera push',
    model: 'sora-2',
    aspectRatio: '16:9',
    duration: '10',
    selectedCount: 1,
    referenceImages: ['https://files.example/a.png']
  })

  assert.equal(guard.check(fingerprint).blocked, false)
  guard.hold(fingerprint)

  currentTime = 7000
  assert.deepEqual(guard.check(fingerprint), {
    blocked: true,
    message: '检测到重复提交，请稍后再试'
  })

  guard.release(fingerprint)
  assert.equal(guard.check(fingerprint).blocked, false)
})

test('does not treat different batch counts or prompts as duplicate submits', () => {
  const guard = createCanvasDuplicateSubmitGuard({ windowMs: 2000, now: () => 1000 })
  const base = {
    nodeId: 'image-1',
    nodeType: 'image',
    prompt: 'a banana robot',
    model: 'nano-banana-2',
    aspectRatio: '1:1',
    imageSize: '2K',
    selectedCount: 1,
    referenceImages: ['https://files.example/a.png']
  }

  assert.equal(guard.check(buildCanvasSubmitFingerprint(base)).blocked, false)
  assert.equal(guard.check(buildCanvasSubmitFingerprint({ ...base, selectedCount: 4 })).blocked, false)
  assert.equal(guard.check(buildCanvasSubmitFingerprint({ ...base, prompt: 'a banana astronaut' })).blocked, false)
})

test('preserves reference ordering because first and last frame inputs are order-sensitive', () => {
  assert.equal(
    buildCanvasSubmitFingerprint({
      nodeId: 'video-1',
      nodeType: 'video',
      prompt: 'test',
      referenceImages: ['a', 'b'],
      referenceVideos: ['v1', 'v2'],
      referenceAudios: ['a1', 'a2']
    }),
    buildCanvasSubmitFingerprint({
      nodeId: 'video-1',
      nodeType: 'video',
      prompt: 'test',
      referenceImages: ['a', 'b'],
      referenceVideos: ['v1', 'v2'],
      referenceAudios: ['a1', 'a2']
    })
  )

  assert.notEqual(
    buildCanvasSubmitFingerprint({
      nodeId: 'video-1',
      nodeType: 'video',
      prompt: 'test',
      referenceImages: ['b', 'a']
    }),
    buildCanvasSubmitFingerprint({
      nodeId: 'video-1',
      nodeType: 'video',
      prompt: 'test',
      referenceImages: ['a', 'b']
    })
  )
})
