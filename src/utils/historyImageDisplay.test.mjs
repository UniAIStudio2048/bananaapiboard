import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getHistoryImageDisplayUrl,
  makeHistoryImagePlaceholder
} from './historyImageDisplay.js'

test('history image display url falls back to a data placeholder when url is missing', () => {
  const url = getHistoryImageDisplayUrl({ prompt: 'broken image' }, value => `/media/${value}`)

  assert.match(url, /^data:image\/svg\+xml;base64,/)
})

test('history image display url resolves available media through provided resolver', () => {
  const url = getHistoryImageDisplayUrl({ url: 'tenant/images/a.png' }, value => `/cdn/${value}`)

  assert.equal(url, '/cdn/tenant/images/a.png')
})

test('history placeholder escapes prompt text before embedding svg', () => {
  const placeholder = makeHistoryImagePlaceholder({ prompt: '<script>alert(1)</script>' })
  const svg = Buffer.from(placeholder.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8')

  assert.doesNotMatch(svg, /<script>/)
  assert.match(svg, /&lt;script&gt;/)
})
