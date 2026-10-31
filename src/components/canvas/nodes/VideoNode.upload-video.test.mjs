import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

function fixture(data = {}) {
  const calls = { updates: [], uploads: [], alerts: [], blobs: [] }
  const props = { id: 'current-video', data }
  const match = source.match(/async function handleSourceVideoChange\(event\) \{[\s\S]*?\n\}/)
  assert.ok(match, 'Source video upload handler must exist')
  const bindings = {
    props,
    isGenerating: { value: false },
    canvasStore: { updateNodeData: (...args) => calls.updates.push(args) },
    uploadVideoFileAsync: (...args) => calls.uploads.push(args),
    showAlert: async message => calls.alerts.push(message),
    URL: { createObjectURL: file => { calls.blobs.push(file); return 'blob:video' } }
  }
  const run = new Function(...Object.keys(bindings), `${match[0]}; return handleSourceVideoChange`)(...Object.values(bindings))
  return { calls, run }
}

test('video quick actions start with an upload button and video-only file picker', () => {
  assert.match(source, /const quickActions = \[\s*\{\s*icon: Upload,\s*labelKey: 'canvas.videoNode.uploadVideo',\s*action: \(\) => sourceVideoInputRef.value\?\.click\(\)/)
  assert.match(source, /<input\s+ref="sourceVideoInputRef"\s+type="file"\s+accept="video\/\*"[\s\S]*?@change="handleSourceVideoChange"/)
})

test('selected video previews in the current node and uses the existing durable upload flow', async () => {
  const { calls, run } = fixture()
  const file = { name: 'sample.mp4', type: 'video/mp4', size: 1024 }
  const event = { target: { files: [file], value: 'sample.mp4' } }
  await run(event)
  assert.equal(event.target.value, '')
  const [nodeId, patch] = calls.updates[0]
  assert.equal(nodeId, 'current-video')
  assert.equal(patch.sourceVideo, 'blob:video')
  assert.deepEqual(patch.output, { type: 'video', url: 'blob:video' })
  assert.equal(patch.isUploading, true)
  assert.equal(patch.nodeRole, 'source')
  assert.deepEqual(calls.uploads, [[file, 'blob:video', 'current-video']])
})

for (const [name, file] of [
  ['non-video', { name: 'image.png', type: 'image/png', size: 100 }],
  ['over 500 MB', { name: 'large.mp4', type: 'video/mp4', size: 500 * 1024 * 1024 + 1 }]
]) {
  test(`${name} files are rejected before node changes or upload`, async () => {
    const { calls, run } = fixture()
    await run({ target: { files: [file], value: 'selected' } })
    assert.equal(calls.alerts.length, 1)
    assert.deepEqual(calls.updates, [])
    assert.deepEqual(calls.uploads, [])
    assert.deepEqual(calls.blobs, [])
  })
}

test('cancelled selection and readonly nodes do not start uploads', async () => {
  for (const [data, files] of [[{}, []], [{ readonly: true }, [{ type: 'video/mp4', size: 100 }]]]) {
    const { calls, run } = fixture(data)
    await run({ target: { files, value: '' } })
    assert.deepEqual(calls.uploads, [])
    assert.deepEqual(calls.updates, [])
  }
})
