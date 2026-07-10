import assert from 'node:assert/strict'

import { createMemoryCanvasUploadCheckpointStore } from './canvasUploadCheckpoint.js'

const store = createMemoryCanvasUploadCheckpointStore()
const checkpoint = {
  fingerprint: 'large.mp4:52428800:video/mp4:1',
  uploadId: 'up-1',
  completedParts: [{ partNumber: 1, etag: '"e1"', size: 8388608 }]
}

await store.set(checkpoint.fingerprint, checkpoint)
const loaded = await store.get(checkpoint.fingerprint)
assert.deepEqual(loaded, checkpoint)

loaded.completedParts.push({ partNumber: 2, etag: '"e2"', size: 1 })
assert.equal((await store.get(checkpoint.fingerprint)).completedParts.length, 1)

await store.delete(checkpoint.fingerprint)
assert.equal(await store.get(checkpoint.fingerprint), null)

console.log('canvasUploadCheckpoint tests passed')
