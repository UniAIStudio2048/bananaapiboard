import test from 'node:test'
import assert from 'node:assert/strict'

import { applyOrderedMediaReplacements } from './videoReferenceOrdering.js'
import { normalizeModelImageUrl } from './canvasModelMedia.js'

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

test('replaces in place when ordered url lost transform params but source kept them', () => {
  // VideoNode 捕获 finalImages 时会经 normalizeModelImageUrl 剥掉缩略图参数，
  // 而角色节点收集的 sourceUrls 是原始字符串；两侧按同一归一化规则匹配。
  assert.deepEqual(
    applyOrderedMediaReplacements(
      ['https://cdn.example/character.png'],
      [{
        replacementUrl: 'asset://asset-20260821135956-mwtvq',
        sourceUrls: ['https://cdn.example/character.png?imageView2/1/w/60/h/60']
      }],
      { normalizeUrl: normalizeModelImageUrl }
    ),
    ['asset://asset-20260821135956-mwtvq']
  )
})

test('replaces in place when ordered url was unwrapped from image proxy', () => {
  assert.deepEqual(
    applyOrderedMediaReplacements(
      ['https://cdn.example/character.png'],
      [{
        replacementUrl: 'asset://asset-20260821135956-mwtvq',
        sourceUrls: ['/api/images/proxy?url=https%3A%2F%2Fcdn.example%2Fcharacter.png']
      }],
      { normalizeUrl: normalizeModelImageUrl }
    ),
    ['asset://asset-20260821135956-mwtvq']
  )
})

test('falls back to append when normalized forms still differ', () => {
  // 例如签名 URL 在捕获后被刷新：归一化也无法对上，保持原兜底行为（预览图保留、asset:// 追加）。
  assert.deepEqual(
    applyOrderedMediaReplacements(
      ['https://volc.example/signed-v2.png'],
      [{
        replacementUrl: 'asset://asset-20260821135956-mwtvq',
        sourceUrls: ['https://volc.example/signed-v1.png']
      }],
      { normalizeUrl: normalizeModelImageUrl }
    ),
    ['https://volc.example/signed-v2.png', 'asset://asset-20260821135956-mwtvq']
  )
})
