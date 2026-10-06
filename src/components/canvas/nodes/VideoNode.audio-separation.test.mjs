import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

function harness({ result, saveError, processError } = {}) {
  const body = source.match(/async function handleToolbarAudioSeparate\(\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(body, 'video toolbar must implement audio separation')
  const calls = []
  const tab = { id: 'tab-a', workflowId: 'workflow-a' }
  const node = { id: 'source', position: { x: 10, y: 20 }, data: { width: 640, height: 360 } }
  const store = {
    nodes: [node], getCurrentTab: () => tab,
    closeNodeSelector() { calls.push('close-selector') },
    addNode(value) { calls.push(['display', value]); this.nodes.push(value) }
  }
  const busy = { value: false }
  const dependencies = {
    isAudioSeparating: busy, props: { id: 'source', data: { output: { url: 'https://media.test/source.mp4' } } },
    normalizedVideoUrl: { value: '' }, canvasStore: store,
    nodeWidth: { value: 640 }, nodeHeight: { value: 360 },
    ensureCanvasWorkflowForVideoSubmission: async () => ({ workflowId: 'workflow-a' }),
    separateVideoAudio: async payload => {
      calls.push(['process', payload])
      if (processError) throw new Error(processError)
      return result || { audioUrl: 'https://media.test/audio.mp3', videoUrl: 'https://media.test/silent.mp4', duration: 4, width: 640, height: 360 }
    },
    postWorkflowOps: async (id, ops) => {
      calls.push(['save', id, ops])
      if (saveError) throw new Error(saveError)
    },
    showToast: (message, kind) => calls.push(['toast', message, kind]),
    uploadCanvasMedia: async () => { throw new Error('unexpected upload') }
  }
  const handle = new Function(...Object.keys(dependencies), `${body}; return handleToolbarAudioSeparate`)(...Object.values(dependencies))
  return { handle, calls, store, tab, busy, dependencies }
}

test('toolbar exposes an accessible click action with a busy state', () => {
  assert.ok(/<button[^>]*title="音频分离"[\s\S]*?@click\.stop\.prevent="handleToolbarAudioSeparate"[\s\S]*?<\/button>/.test(source))
  assert.ok(source.includes(':disabled="isAudioSeparating"'))
})

test('separation saves an audio node above a silent video to the right before displaying, without edges', async () => {
  const h = harness()
  await h.handle()
  const save = h.calls.find(call => call[0] === 'save')
  assert.equal(save[1], 'workflow-a')
  assert.equal(save[2].length, 2)
  assert.ok(save[2].every(op => op.op === 'add' && op.target === 'node'))
  const [audio, video] = save[2].map(op => op.payload)
  assert.equal(audio.type, 'audio')
  assert.equal(video.type, 'video')
  assert.equal(audio.position.x, 770)
  assert.equal(video.position.x, audio.position.x)
  assert.ok(video.position.y >= audio.position.y + audio.data.height + 80)
  assert.equal(audio.data.output.url, 'https://media.test/audio.mp3')
  assert.equal(video.data.output.url, 'https://media.test/silent.mp4')
  assert.equal(video.data.duration, 4)
  assert.equal(h.store.nodes[0].data.output, undefined, 'source stays unchanged')
  assert.ok(h.calls.indexOf(save) < h.calls.findIndex(call => call[0] === 'display'))
  assert.ok(h.calls.indexOf('close-selector') < h.calls.findIndex(call => call[0] === 'display'), 'pending selector connections must be cleared')
  assert.equal(h.busy.value, false)
})

test('failed processing, incomplete output and failed persistence never create result nodes', async () => {
  for (const options of [{ processError: '视频没有音轨' }, { result: { audioUrl: 'audio' } }, { saveError: '数据库不可用' }]) {
    const h = harness(options)
    await h.handle()
    assert.equal(h.store.nodes.length, 1)
    assert.equal(h.busy.value, false)
    assert.ok(h.calls.some(call => call[0] === 'toast' && call[2] === 'error'))
  }
})

test('duplicate clicks during processing submit once', async () => {
  const h = harness()
  await Promise.all([h.handle(), h.handle(), h.handle()])
  assert.equal(h.calls.filter(call => call[0] === 'process').length, 1)
  assert.equal(h.store.nodes.length, 3)
})

test('switching tabs while processing saves into the original workflow without displaying on the new tab', async () => {
  const h = harness()
  const running = h.handle()
  h.tab.id = 'tab-b'
  await running
  assert.equal(h.store.nodes.length, 1)
  assert.ok(h.calls.some(call => call[0] === 'save' && call[1] === 'workflow-a'))
})

test('repeated completed actions produce distinct node IDs', async () => {
  const h = harness()
  await h.handle()
  await h.handle()
  const ids = h.store.nodes.map(node => node.id)
  assert.equal(new Set(ids).size, 5)
  assert.ok(ids.every(id => id.length <= 64))
})
