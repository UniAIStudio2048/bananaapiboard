import assert from 'node:assert/strict'
import { buildDirectorStudioPrompt, dedupeDirectorReferenceUrls } from './directorStudioPrompt.js'

assert.deepEqual(dedupeDirectorReferenceUrls(['a', 'b', 'a', null, undefined, '']), ['a', 'b'])
assert.deepEqual(dedupeDirectorReferenceUrls({ bad: true }), [])
assert.deepEqual(dedupeDirectorReferenceUrls('https://cdn/not-an-array.png'), [])

const prompt = buildDirectorStudioPrompt({
  mode: 'flat',
  backgroundImageUrl: null,
  items: [
    {
      id: 'item-1',
      label: '角色A',
      category: 'person',
      color: '#ff0000',
      refImageUrl: 'https://cdn/ref-a.png',
      pos3d: { x: -1.5, y: 0, z: -3 },
      rotation3d: { x: 0, y: 0.5, z: 0 },
      scale3d: { x: 1, y: 1.2, z: 1 },
      action: '行走',
      note: '看向镜头'
    },
    {
      id: 'item-2',
      label: '桌子',
      category: 'object',
      color: '#00ff00',
      pos3d: { x: 2, y: 0, z: -4 },
      relation: '在角色A右侧'
    }
  ],
  referenceImages: [{ id: 'ref-a', url: 'https://cdn/ref-a.png', label: '角色A', color: '#ff0000' }],
  basePrompt: '电影感室内场景',
  referenceTokenStartIndex: 2,
  referenceTokenPrefix: '图'
})

assert.match(prompt, /3D staging floor plan/)
assert.match(prompt, /@图2/)
assert.match(prompt, /角色A/)
assert.match(prompt, /depth-from-camera/)
assert.match(prompt, /电影感室内场景/)

const panoramaPrompt = buildDirectorStudioPrompt({
  mode: 'panorama',
  items: [
    {
      id: 'scene-1',
      label: '咖啡店',
      category: 'scene',
      presetId: 'scene-shop-cafe',
      refImageName: '咖啡店参考',
      note: '暖色灯光',
      rotation3d: { x: 0, y: 0.25, z: 0 }
    },
    {
      id: 'person-1',
      label: '成年男性',
      category: 'person',
      presetId: 'person-adult-male-strong',
      bodyControls: { style: 'strong' },
      pos3d: { x: 2, y: 1, z: -2 }
    }
  ],
  referenceImages: [{ id: 'scene-ref', url: 'https://cdn/cafe.png', label: '咖啡店参考' }],
  basePrompt: ''
})

assert.match(panoramaPrompt, /360-degree panorama/)
assert.match(panoramaPrompt, /scene \/ environment references/)
assert.match(panoramaPrompt, /店铺\/咖啡店/)
assert.match(panoramaPrompt, /body controls: body style strong/)
assert.doesNotMatch(panoramaPrompt, /available identity references/)

const labelFallbackPrompt = buildDirectorStudioPrompt({
  items: [
    {
      id: 'person-label-fallback',
      label: '角色B',
      category: 'person',
      refImageUrl: 'https://cdn/stale-url.png',
      refImageName: '角色B参考',
      pos3d: { x: 0, y: 0, z: -2 }
    }
  ],
  referenceImages: [{ id: 'ref-b', url: 'https://cdn/ref-b.png', label: '角色B参考' }],
  referenceTokenStartIndex: 4,
  referenceTokenPrefix: '图'
})

assert.match(labelFallbackPrompt, /use reference image @图4 for identity/)
assert.doesNotMatch(labelFallbackPrompt, /reference image named "角色B参考"/)

const nullConfigPrompt = buildDirectorStudioPrompt(null)
assert.equal(typeof nullConfigPrompt, 'string')
assert.match(nullConfigPrompt, /Use the Director Studio screenshot as the primary composition reference/)

const malformedConfigPrompt = buildDirectorStudioPrompt({
  referenceImages: {},
  items: 'bad',
  basePrompt: 42,
  referenceTokenPrefix: { bad: true }
})
assert.equal(typeof malformedConfigPrompt, 'string')
assert.match(malformedConfigPrompt, /Use the Director Studio screenshot as the primary composition reference/)

const unknownPresetPrompt = buildDirectorStudioPrompt({
  items: [
    {
      id: 'unknown-preset',
      label: '未知模型',
      category: 'object',
      presetId: 'unknown-preset-id',
      pos3d: { x: 0, y: 0, z: -1 }
    }
  ]
})
assert.doesNotMatch(unknownPresetPrompt, /visual type \/ model preset/)

const neutralBodyPrompt = buildDirectorStudioPrompt({
  items: [
    {
      id: 'neutral-body',
      label: '中性角色',
      category: 'person',
      bodyControls: { showControls: true },
      pos3d: { x: 0, y: 0, z: -1 }
    }
  ]
})
assert.doesNotMatch(neutralBodyPrompt, /body controls:/)

console.log('directorStudioPrompt tests passed')
