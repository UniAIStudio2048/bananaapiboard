import test from 'node:test'
import assert from 'node:assert/strict'

import { loadStoryboardImageForCanvas } from './storyboardCanvasImage.js'

test('loads remote storyboard images through the provided proxy resolver before drawing to canvas', async () => {
  const requestedUrls = []
  const revokedUrls = []

  class MockImage {
    set src(value) {
      this._src = value
      queueMicrotask(() => this.onload?.())
    }

    get src() {
      return this._src
    }
  }

  const image = await loadStoryboardImageForCanvas('https://cdn.example.com/a.png', {
    fetch: async (url) => {
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        blob: async () => ({ type: 'image/png' })
      }
    },
    createObjectURL: () => 'blob:storyboard-test',
    revokeObjectURL: (url) => revokedUrls.push(url),
    ImageCtor: MockImage,
    resolveCanvasUrl: (url) => `/api/images/proxy?url=${encodeURIComponent(url)}`
  })

  assert.equal(requestedUrls[0], '/api/images/proxy?url=https%3A%2F%2Fcdn.example.com%2Fa.png')
  assert.equal(image.src, 'blob:storyboard-test')
  assert.deepEqual(revokedUrls, ['blob:storyboard-test'])
})
