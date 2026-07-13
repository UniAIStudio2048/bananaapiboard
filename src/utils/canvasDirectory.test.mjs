import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCanvasDirectory,
  getCanvasNodeDisplayName,
  getCanvasNodeMedia,
  isCanvasDirectoryMoveAllowed
} from './canvasDirectory.js'

test('derives visible group folders and root nodes in canvas order', () => {
  const nodes = [
    { id: 'root', type: 'text-input', position: { x: 20, y: 10 }, data: { title: 'Root' } },
    { id: 'child', type: 'video', position: { x: 40, y: 40 }, data: { title: 'Clip', groupId: 'g' } },
    { id: 'g', type: 'group', position: { x: 0, y: 20 }, data: { groupName: 'Scene', nodeIds: ['child'] } }
  ]

  const result = buildCanvasDirectory(nodes)

  assert.deepEqual(result.root.map(row => row.id), ['root'])
  assert.deepEqual(result.folders.map(folder => [folder.id, folder.name]), [['g', 'Scene']])
  assert.deepEqual(result.folders[0].children.map(row => row.id), ['child'])
  assert.equal(result.total, 2)
})

test('keeps a node with a stale group id visible at root and filters by child name', () => {
  const nodes = [
    { id: 'stale', type: 'image', position: { x: 0, y: 0 }, data: { title: 'Poster', groupId: 'missing' } },
    { id: 'g', type: 'group', position: { x: 0, y: 20 }, data: { groupName: 'Scene', nodeIds: ['clip'] } },
    { id: 'clip', type: 'video', position: { x: 0, y: 30 }, data: { title: 'Final clip', groupId: 'g' } }
  ]

  assert.deepEqual(buildCanvasDirectory(nodes).root.map(row => row.id), ['stale'])
  assert.deepEqual(buildCanvasDirectory(nodes, { search: 'final' }).folders.map(folder => folder.id), ['g'])
})

test('normalizes names and resolves downloadable media', () => {
  assert.equal(getCanvasNodeDisplayName({ type: 'image', data: { title: ' Hero ' } }), 'Hero')
  assert.deepEqual(
    getCanvasNodeMedia({ id: 'v', type: 'video', data: { output: { type: 'video', url: '/clip.mp4' } } }),
    { kind: 'video', url: '/clip.mp4', previewUrl: '/clip.mp4', extension: 'mp4' }
  )
  assert.deepEqual(
    getCanvasNodeMedia({ id: 't', type: 'text-input', data: { text: 'hello' } }),
    { kind: 'text', text: 'hello', previewUrl: null, extension: 'txt' }
  )
  assert.equal(getCanvasNodeMedia({ id: 'empty', type: 'llm', data: {} }), null)
})

test('directory rows retain original media URLs for hover previews', () => {
  const directory = buildCanvasDirectory([
    {
      id: 'image-1',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { imageUrl: 'image.png', thumbnailUrl: 'image-thumb.png' }
    },
    {
      id: 'video-1',
      type: 'video',
      position: { x: 0, y: 1 },
      data: { videoUrl: 'video.mp4', thumbnailUrl: 'video-thumb.png' }
    },
    {
      id: 'audio-1',
      type: 'audio',
      position: { x: 0, y: 2 },
      data: { audioUrl: 'audio.mp3' }
    }
  ])

  assert.deepEqual(directory.root.map(row => ({
    id: row.id,
    mediaKind: row.mediaKind,
    mediaUrl: row.mediaUrl,
    previewUrl: row.previewUrl
  })), [
    { id: 'image-1', mediaKind: 'image', mediaUrl: 'image.png', previewUrl: 'image-thumb.png' },
    { id: 'video-1', mediaKind: 'video', mediaUrl: 'video.mp4', previewUrl: 'video-thumb.png' },
    { id: 'audio-1', mediaKind: 'audio', mediaUrl: 'audio.mp3', previewUrl: null }
  ])
})

test('allows normal-node transfers and rejects groups and same-target drops', () => {
  const node = { id: 'n', type: 'image', data: { groupId: 'a' } }
  assert.equal(isCanvasDirectoryMoveAllowed(node, 'b', new Set(['a', 'b'])), true)
  assert.equal(isCanvasDirectoryMoveAllowed(node, 'a', new Set(['a', 'b'])), false)
  assert.equal(isCanvasDirectoryMoveAllowed(node, null, new Set(['a', 'b'])), true)
  assert.equal(isCanvasDirectoryMoveAllowed({ id: 'g', type: 'group', data: {} }, 'b', new Set(['b'])), false)
})
