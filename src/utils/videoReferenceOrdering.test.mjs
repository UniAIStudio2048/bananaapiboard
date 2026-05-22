import test from 'node:test'
import assert from 'node:assert/strict'

import { applyOrderedMediaReplacements } from './videoReferenceOrdering.js'

test('replaces asset-backed preview urls in place without moving plain image urls', () => {
  const orderedImages = [
    'https://filescos.example/ref-images/background.png',
    'https://cdn.example/character-junxuan.png',
    'https://cdn.example/character-muyang.png',
    'https://cdn.example/character-yususu.png'
  ]

  assert.deepEqual(
    applyOrderedMediaReplacements(orderedImages, [
      { replacementUrl: 'asset://junxuan', sourceUrls: ['https://cdn.example/character-junxuan.png'] },
      { replacementUrl: 'asset://muyang', sourceUrls: ['https://cdn.example/character-muyang.png'] },
      { replacementUrl: 'asset://yususu', sourceUrls: ['https://cdn.example/character-yususu.png'] }
    ]),
    [
      'https://filescos.example/ref-images/background.png',
      'asset://junxuan',
      'asset://muyang',
      'asset://yususu'
    ]
  )
})

test('keeps unmatched replacement urls after ordered images for compatibility', () => {
  assert.deepEqual(
    applyOrderedMediaReplacements(
      ['https://filescos.example/ref-images/background.png'],
      [{ replacementUrl: 'asset://missing-preview', sourceUrls: [] }]
    ),
    [
      'https://filescos.example/ref-images/background.png',
      'asset://missing-preview'
    ]
  )
})
