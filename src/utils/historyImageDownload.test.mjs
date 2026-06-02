import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getHistoryImageDownloadFilename,
  getHistoryImageShortcutAction,
  sanitizeHistoryDownloadFilename
} from './historyImageDownload.js'

test('history image download filenames prefer sanitized notes', () => {
  const image = {
    id: 'image-123',
    model: 'nano',
    note: '  red dress / lakeside: portrait  '
  }

  assert.equal(
    getHistoryImageDownloadFilename(image),
    'red_dress_lakeside_portrait.png'
  )
})

test('history image download filenames fall back to model and id', () => {
  assert.equal(
    getHistoryImageDownloadFilename({ id: 'image-123', model: 'nano', note: '' }),
    'nano-image-123.png'
  )
  assert.equal(
    getHistoryImageDownloadFilename({ id: 'image-123', model: '', note: '' }),
    'image-image-123.png'
  )
})

test('history image preview save shortcuts map to actions', () => {
  assert.equal(getHistoryImageShortcutAction({ key: 's', ctrlKey: true }), 'save')
  assert.equal(getHistoryImageShortcutAction({ key: 'S', altKey: true }), 'save')
  assert.equal(getHistoryImageShortcutAction({ key: 'd', ctrlKey: true }), 'saveAs')
  assert.equal(getHistoryImageShortcutAction({ key: 'D', altKey: true }), 'saveAs')
  assert.equal(getHistoryImageShortcutAction({ key: 's' }), null)
  assert.equal(getHistoryImageShortcutAction({ key: 'd', metaKey: true }), null)
})

test('history image download filename sanitizer removes path separators and reserved characters', () => {
  assert.equal(
    sanitizeHistoryDownloadFilename('a/b:c* d?e"f<g>h|i'),
    'a_b_c_d_e_f_g_h_i'
  )
})
