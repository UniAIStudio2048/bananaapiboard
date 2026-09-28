import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start, `${name} must exist`)
  return source.slice(start, end)
}

function createNode(aspectRatio, extraData = {}, ratios = ['16:9', '9:16', '1:1', '4:3', 'adaptive']) {
  const props = { id: 'connected-video-result', data: {
    aspectRatio,
    output: { url: 'https://example.test/generated.mp4', cover_url: 'https://example.test/cover.jpg' },
    ...extraData
  } }
  const updates = []
  const state = {
    props,
    selectedAspectRatio: ref(aspectRatio),
    availableAspectRatios: ref(ratios.map(value => ({ value }))),
    detectedVideoDimensions: ref(null),
    nodeWidth: ref(420),
    nodeHeight: ref(280),
    normalizedVideoUrl: ref(props.data.output.url),
    console: { log() {} },
    canvasStore: { updateNodeData(id, patch) {
      assert.equal(id, props.id)
      updates.push(patch)
      Object.assign(props.data, patch)
    } }
  }
  const handleVideoLoaded = runInNewContext([
    extractFunction('parseAspectRatioValue'),
    extractFunction('applyDetectedVideoDimensions'),
    extractFunction('handleVideoLoaded'),
    'handleVideoLoaded'
  ].join('\n'), state)
  return { ...state, updates, load: handleVideoLoaded }
}

for (const [ratio, width, height] of [
  ['9:16', 1920, 1080],
  ['16:9', 1080, 1920],
  ['1:1', 1920, 1080],
  ['4:3', 1080, 1920],
  ['adaptive', 1080, 1920]
]) {
  test(`old video loaded repeatedly preserves the next generation ratio ${ratio}`, () => {
    const node = createNode(ratio)
    for (let i = 0; i < 3; i++) {
      node.load({ target: { videoWidth: width, videoHeight: height, duration: 5, currentTime: 0 } })
      assert.equal(node.selectedAspectRatio.value, ratio)
      assert.equal(node.props.data.aspectRatio, ratio)
    }
    assert.ok(node.updates.every(patch => !Object.hasOwn(patch, 'aspectRatio')))
    assert.equal(node.props.data.videoWidth, width)
    assert.equal(node.props.data.videoHeight, height)
    assert.equal(node.props.data.videoDuration, 5)
    assert.equal(node.props.data.output.duration, 5)
    assert.equal(node.props.data.output.cover_url, 'https://example.test/cover.jpg')
  })
}

test('a pending manual selection is not reset before its persistence watcher runs', () => {
  const node = createNode('9:16')
  node.selectedAspectRatio.value = '16:9'
  node.load({ target: { videoWidth: 1920, videoHeight: 1080, duration: 5, currentTime: 0 } })
  assert.ok(node.updates.every(patch => !Object.hasOwn(patch, 'aspectRatio')))
})

test('models without ratio options retain actual portrait dimensions and clip start', () => {
  const node = createNode('', { isCharacterNode: true, clipStartTime: 2 }, [])
  const video = { videoWidth: 1080, videoHeight: 1920, duration: 5, currentTime: 0 }
  node.load({ target: video })
  assert.equal(node.nodeWidth.value, 280)
  assert.equal(node.nodeHeight.value, Math.round(280 * 1920 / 1080))
  assert.equal(node.props.data.width, 280)
  assert.equal(video.currentTime, 2)
})

test('invalid metadata leaves saved dimensions and duration intact', () => {
  const node = createNode('9:16', { videoWidth: 1080, videoHeight: 1920, videoDuration: 5 })
  const video = { videoWidth: 0, videoHeight: 0, duration: NaN, currentTime: 0 }
  node.load({ target: video })
  assert.equal(node.updates.length, 0)
  assert.equal(node.props.data.videoDuration, 5)
  assert.equal(video.currentTime, 0.1)
})
