import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const canvasSource = readFileSync(fileURLToPath(new URL('../../views/Canvas.vue', import.meta.url)), 'utf8')
const boardSource = readFileSync(fileURLToPath(new URL('./CanvasBoard.vue', import.meta.url)), 'utf8')
const panelSource = readFileSync(fileURLToPath(new URL('./AssetPanel.vue', import.meta.url)), 'utf8')
const digitalHumanNodeSource = readFileSync(fileURLToPath(new URL('./nodes/DigitalHumanNode.vue', import.meta.url)), 'utf8')

test('数字人形象图插入的图像节点保留数字人资产标记', () => {
  const canvasImageStart = canvasSource.indexOf("case 'image':")
  const boardImageStart = boardSource.indexOf("case 'image':", boardSource.indexOf("if (data.type === 'asset-insert'"))
  const canvasImageCase = canvasSource.slice(canvasImageStart, canvasSource.indexOf("case 'video':", canvasImageStart))
  const boardImageCase = boardSource.slice(boardImageStart, boardSource.indexOf("case 'video':", boardImageStart))

  assert.match(canvasImageCase, /metadata: asset\.metadata \|\| \{\}/)
  assert.match(canvasImageCase, /digitalHumanAssetId: asset\.digitalHumanAssetId \|\| asset\.metadata\?\.digitalHumanAssetId \|\| ''/)
  assert.match(canvasImageCase, /assetType: asset\.assetType \|\| ''/)
  assert.match(boardImageCase, /metadata: asset\.metadata \|\| \{\}/)
  assert.match(boardImageCase, /digitalHumanAssetId: asset\.digitalHumanAssetId \|\| asset\.metadata\?\.digitalHumanAssetId \|\| ''/)
  assert.match(boardImageCase, /assetType: asset\.assetType \|\| ''/)
  assert.match(panelSource, /assetType: 'digital-human'/)
  assert.match(panelSource, /digitalHumanAssetId: asset\.id/)
})

test('数字人节点选择角色后原地转换为带引用标记的图片节点', () => {
  assert.match(digitalHumanNodeSource, /node\.type = 'image-input'/)
  assert.match(digitalHumanNodeSource, /sourceImages: \[nextPreviewUrl\]/)
  assert.match(digitalHumanNodeSource, /digitalHumanAssetId: asset\.id/)
  assert.match(digitalHumanNodeSource, /assetType: 'digital-human'/)
  assert.match(digitalHumanNodeSource, /edge\.sourceHandle = 'output'/)
})

test('待选择数字人卡片复用 Seedance 的中性空状态和主题变量', () => {
  assert.doesNotMatch(digitalHumanNodeSource, /<Handle/)
  assert.match(digitalHumanNodeSource, /class="digital-human-label">HeyGen 数字人/)
  assert.match(digitalHumanNodeSource, /class="digital-human-empty" @click="openSelector"/)
  assert.match(digitalHumanNodeSource, /\.digital-human-card \{[\s\S]*background: var\(--canvas-bg-tertiary, #1a1a1a\);[\s\S]*border: 1px solid var\(--canvas-border-subtle, #2a2a2a\);/)
  assert.match(digitalHumanNodeSource, /\.digital-human-empty \{[\s\S]*color: var\(--canvas-text-tertiary\);/)
  assert.match(digitalHumanNodeSource, /:root\.canvas-theme-light \.digital-human-node/)
  assert.doesNotMatch(digitalHumanNodeSource, /#38bdf8|#67e8f9|#bae6fd/)
})
