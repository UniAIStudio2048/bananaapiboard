import assert from 'node:assert/strict'
import {
  chooseEditorExportFormat,
  clampSessionHistory,
  isRestorableEditSession,
  buildSavedSessionPayload
} from './imageEditSession.js'

assert.deepEqual(chooseEditorExportFormat('https://cdn.example.com/demo.jpg'), {
  mimeType: 'image/jpeg',
  format: 'jpeg',
  quality: 1,
  extension: 'jpg'
})

assert.deepEqual(chooseEditorExportFormat('https://cdn.example.com/demo.jpeg'), {
  mimeType: 'image/jpeg',
  format: 'jpeg',
  quality: 1,
  extension: 'jpg'
})

assert.deepEqual(chooseEditorExportFormat('https://cdn.example.com/demo.png'), {
  mimeType: 'image/png',
  format: 'png',
  quality: 1,
  extension: 'png'
})

assert.deepEqual(chooseEditorExportFormat('https://cdn.example.com/demo.webp'), {
  mimeType: 'image/png',
  format: 'png',
  quality: 1,
  extension: 'png'
})

const trimmed = clampSessionHistory({
  historyIndex: 11,
  history: Array.from({ length: 12 }, (_, index) => ({
    snapshotUrl: `https://cdn.example.com/${index}.png`
  }))
}, 10)

assert.equal(trimmed.history.length, 10)
assert.equal(trimmed.history[0].snapshotUrl, 'https://cdn.example.com/2.png')
assert.equal(trimmed.historyIndex, 9)

assert.equal(isRestorableEditSession(null), false)
assert.equal(isRestorableEditSession({ version: 1, history: [], historyIndex: 0 }), false)
assert.equal(isRestorableEditSession({
  version: 1,
  historyIndex: 1,
  history: [{ snapshotUrl: 'https://cdn.example.com/0.png' }]
}), false)
assert.equal(isRestorableEditSession({
  version: 1,
  historyIndex: 0,
  history: [{ snapshotUrl: 'https://cdn.example.com/0.png' }]
}), true)

const payload = buildSavedSessionPayload({
  baseImageUrl: 'https://cdn.example.com/base.png',
  currentImageUrl: 'https://cdn.example.com/final.png',
  exportFormat: 'png',
  exportQuality: 1,
  imageMimeType: 'image/png',
  originalWidth: 2048,
  originalHeight: 1024,
  displayWidth: 1200,
  displayHeight: 600,
  historyIndex: 0,
  history: [{ snapshotUrl: 'https://cdn.example.com/0.png' }],
  filters: { brightness: 100 },
  rotation: 0,
  flipX: false,
  flipY: false,
  brushSize: 10,
  brushColor: '#FF0000',
  currentMode: 'crop'
})

assert.equal(payload.version, 1)
assert.equal(payload.currentImageUrl, 'https://cdn.example.com/final.png')
assert.equal(payload.history.length, 1)
assert.equal(payload.displayWidth, 1200)
assert.equal(typeof payload.updatedAt, 'number')

console.log('imageEditSession tests passed')
