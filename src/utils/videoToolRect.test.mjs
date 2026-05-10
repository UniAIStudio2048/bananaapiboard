import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePreviewRectToVideo } from './videoToolRect.js'

test('normalizes selected rect inside displayed video bounds', () => {
  const rect = normalizePreviewRectToVideo({
    selection: { x: 150, y: 300, width: 300, height: 60 },
    videoBox: { x: 100, y: 200, width: 500, height: 800 }
  })

  assert.deepEqual(rect, { x: 0.1, y: 0.125, width: 0.6, height: 0.075 })
})

test('clamps selected rect to displayed video bounds', () => {
  const rect = normalizePreviewRectToVideo({
    selection: { x: 50, y: 180, width: 700, height: 900 },
    videoBox: { x: 100, y: 200, width: 500, height: 800 }
  })

  assert.deepEqual(rect, { x: 0, y: 0, width: 1, height: 1 })
})
