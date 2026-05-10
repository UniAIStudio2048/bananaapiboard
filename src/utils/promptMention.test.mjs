import test from 'node:test'
import assert from 'node:assert/strict'

import { getMentionPopupPosition } from './promptMention.js'

test('positions mention popup below caret when there is enough viewport space', () => {
  const result = getMentionPopupPosition({
    caretRect: { top: 420, bottom: 440, left: 100 },
    popupHeight: 120,
    viewportHeight: 700,
    offset: 8
  })

  assert.deepEqual(result, { top: 448, left: 100 })
})

test('positions mention popup above caret when below would overflow viewport', () => {
  const result = getMentionPopupPosition({
    caretRect: { top: 620, bottom: 640, left: 100 },
    popupHeight: 180,
    viewportHeight: 700,
    offset: 8
  })

  assert.deepEqual(result, { top: 432, left: 100 })
})
