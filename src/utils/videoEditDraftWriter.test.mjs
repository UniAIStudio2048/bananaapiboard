import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoEditDraftWriter } from './videoEditDraftWriter.js'

test('draft writes serialize and flush waits for all acknowledged changes', async () => {
  const writes = []
  let concurrent = 0
  const writer = createVideoEditDraftWriter(async draft => {
    assert.equal(++concurrent, 1)
    await new Promise(resolve => setTimeout(resolve, 5))
    writes.push(draft)
    concurrent--
  })
  const first = { clips: [1] }
  writer.save(first)
  first.clips.push(9)
  writer.save({ clips: [2] })
  await writer.flush()
  assert.deepEqual(writes, [{ clips: [1] }, { clips: [2] }])
})

test('failed writes retain changes and retry without silently reporting success', async () => {
  let fail = true
  const writes = []
  const states = []
  const writer = createVideoEditDraftWriter(async draft => {
    if (fail) throw new Error('offline')
    writes.push(draft)
  }, state => states.push(state))
  writer.save({ clips: [1] })
  await assert.rejects(writer.flush(), /offline/)
  writer.save({ clips: [2] })
  fail = false
  await writer.retry()
  assert.deepEqual(writes, [{ clips: [1] }, { clips: [2] }])
  assert.equal(states.at(-1), 'saved')
})

test('version conflicts never auto retry or overwrite the remote revision', async () => {
  let attempts = 0
  const writer = createVideoEditDraftWriter(async () => {
    attempts++
    throw Object.assign(new Error('conflict'), { code: 'VERSION_CONFLICT' })
  })
  writer.save({ clips: [1] })
  await assert.rejects(writer.flush(), /conflict/)
  writer.save({ clips: [2] })
  await assert.rejects(writer.retry(), /conflict/)
  assert.equal(attempts, 1)
})
