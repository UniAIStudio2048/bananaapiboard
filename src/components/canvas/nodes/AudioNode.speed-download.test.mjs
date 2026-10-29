import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

function completedHandler(context) {
  const start = source.indexOf('function handleBackgroundTaskComplete(event) {')
  const end = source.indexOf('\nfunction handleBackgroundTaskFailed(event)', start)
  assert.ok(start >= 0 && end > start)
  return new Function(...Object.keys(context), `${source.slice(start, end)}\nreturn handleBackgroundTaskComplete`)(...Object.values(context))
}

function downloadHandler(context) {
  const start = source.indexOf('async function handleToolbarDownload() {')
  const end = source.indexOf('\nasync function downloadAudioFile(', start)
  assert.ok(start >= 0 && end > start, 'download action must select a processed audio result before downloading')
  return new Function(...Object.keys(context), `${source.slice(start, end)}\nreturn handleToolbarDownload`)(...Object.values(context))
}

test('completed speed edit resets the active player and downloads the processed file', () => {
  const updates = [], downloads = [], removed = []
  const context = {
    props: { id: 'audio-1' }, canvasStore: { updateNodeData: (id, data) => updates.push({ id, data }) },
    playbackRate: { value: 1.35 }, pendingPlaybackRate: { value: 1.35 }, audioRef: { value: { playbackRate: 1.35 } },
    downloadAfterSpeedTask: { value: 'speed-task' }, downloadAudioFile: url => downloads.push(url),
    removeCompletedTask: id => removed.push(id)
  }
  completedHandler(context)({ detail: { taskId: 'speed-task', task: { nodeId: 'audio-1', type: 'audio-edit', metadata: { operation: 'speed', sourceUrl: 'original.mp3' }, result: { audio_url: 'processed.mp3', duration: 9 } } } })
  assert.equal(context.playbackRate.value, 1)
  assert.equal(context.pendingPlaybackRate.value, 1)
  assert.equal(context.audioRef.value.playbackRate, 1)
  assert.equal(updates[0].data.audioUrl, 'processed.mp3')
  assert.equal(updates[0].data.playbackRate, 1)
  assert.deepEqual(downloads, ['processed.mp3'])
  assert.equal(context.downloadAfterSpeedTask.value, null)
  assert.deepEqual(removed, ['speed-task'])
})

test('download waits for a pending speed task rather than downloading its source', async () => {
  const downloads = []
  const context = { props: { id: 'audio-1', data: { status: 'processing', taskType: 'audio-edit' } }, audioUrl: { value: 'original.mp3' }, playbackRate: { value: 1.35 }, downloadAfterSpeedTask: { value: null }, speedDownloadStarting: { value: false }, getTasksByNodeId: () => [{ taskId: 'speed-task', type: 'audio-edit', status: 'processing', metadata: { operation: 'speed' } }], downloadAudioFile: url => downloads.push(url), applyPlaybackRate: () => { throw new Error('must not start another task') }, normalizePlaybackRate: Number, showAlert: () => {} }
  await downloadHandler(context)()
  assert.equal(context.downloadAfterSpeedTask.value, 'speed-task')
  assert.deepEqual(downloads, [])
})

test('download applies an uncommitted preview speed before selecting the file', async () => {
  const applied = [], downloads = []
  const context = { props: { id: 'audio-1', data: {} }, audioUrl: { value: 'original.mp3' }, playbackRate: { value: 1.35 }, downloadAfterSpeedTask: { value: null }, speedDownloadStarting: { value: false }, getTasksByNodeId: () => [], downloadAudioFile: url => downloads.push(url), applyPlaybackRate: async autoDownload => applied.push(autoDownload), normalizePlaybackRate: Number, showAlert: () => {} }
  await downloadHandler(context)()
  assert.deepEqual(applied, [true])
  assert.deepEqual(downloads, [])
})

test('normal-speed audio downloads immediately without starting an edit', async () => {
  const downloads = []
  const context = { props: { id: 'audio-1', data: {} }, audioUrl: { value: 'original.mp3' }, playbackRate: { value: 1 }, downloadAfterSpeedTask: { value: null }, speedDownloadStarting: { value: false }, getTasksByNodeId: () => [], downloadAudioFile: url => downloads.push(url), applyPlaybackRate: () => { throw new Error('unexpected edit') }, normalizePlaybackRate: Number, showAlert: () => {} }
  await downloadHandler(context)()
  assert.deepEqual(downloads, ['original.mp3'])
})

test('failed speed task clears the queued download and restores the player', () => {
  const start = source.indexOf('function handleBackgroundTaskFailed(event) {')
  const end = source.indexOf('\nfunction handleBackgroundTaskProgress(event)', start)
  assert.ok(start >= 0 && end > start)
  const updates = [], removed = []
  const context = { props: { id: 'audio-1' }, canvasStore: { updateNodeData: (id, data) => updates.push({ id, data }) }, playbackRate: { value: 1.35 }, pendingPlaybackRate: { value: 1.35 }, audioRef: { value: { playbackRate: 1.35 } }, downloadAfterSpeedTask: { value: 'speed-task' }, formatAudioErrorMessage: value => value, removeCompletedTask: id => removed.push(id) }
  const handle = new Function(...Object.keys(context), `${source.slice(start, end)}\nreturn handleBackgroundTaskFailed`)(...Object.values(context))
  handle({ detail: { taskId: 'speed-task', task: { nodeId: 'audio-1', type: 'audio-edit', metadata: { operation: 'speed' }, error: 'failed' } } })
  assert.equal(context.downloadAfterSpeedTask.value, null)
  assert.equal(context.playbackRate.value, 1)
  assert.equal(context.pendingPlaybackRate.value, 1)
  assert.equal(context.audioRef.value.playbackRate, 1)
  assert.equal(updates[0].data.status, 'error')
  assert.deepEqual(removed, ['speed-task'])
})
