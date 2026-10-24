import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const menuSource = readFileSync(new URL('./CanvasContextMenu.vue', import.meta.url), 'utf8')
const canvasSource = readFileSync(new URL('../../views/Canvas.vue', import.meta.url), 'utf8')

assert.match(menuSource, /function handleUploadAudio\(\)\s*\{[\s\S]*emit\('upload', 'audio'\)/)
assert.match(menuSource, /@click="handleUploadAudio"[\s\S]*上传音频/)
assert.match(canvasSource, /input\.accept = type === 'image' \? 'image\/\*' : type === 'video' \? 'video\/\*' : 'audio\/\*'/)
assert.match(canvasSource, /input\.multiple = type === 'image'/)

console.log('CanvasContextMenu upload audio source tests passed')
