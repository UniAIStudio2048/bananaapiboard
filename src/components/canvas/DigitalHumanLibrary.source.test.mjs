import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const canvasDir = import.meta.dirname
const assetPanel = readFileSync(new URL('./AssetPanel.vue', import.meta.url), 'utf8')
const digitalHumanPanel = readFileSync(new URL('./DigitalHumanPanel.vue', import.meta.url), 'utf8')
const digitalHumanNode = readFileSync(new URL('./nodes/DigitalHumanNode.vue', import.meta.url), 'utf8')
const digitalHumanSelector = readFileSync(new URL('./DigitalHumanSelector.vue', import.meta.url), 'utf8')
const nodeSelector = readFileSync(new URL('./NodeSelector.vue', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('../../views/Canvas.vue', import.meta.url), 'utf8')
const canvasBoard = readFileSync(new URL('./CanvasBoard.vue', import.meta.url), 'utf8')
const nodeContextMenu = readFileSync(new URL('./NodeContextMenu.vue', import.meta.url), 'utf8')
const tenantConfig = readFileSync(new URL('../../config/tenant.js', import.meta.url), 'utf8')

test('租户配置默认关闭 HeyGen 数字人资产库', () => {
  assert.match(tenantConfig, /enableDigitalHumanLibrary = false/)
  assert.match(tenantConfig, /isDigitalHumanLibraryEnabled/)
  assert.match(tenantConfig, /config\.enableDigitalHumanLibrary === true/)
  assert.match(tenantConfig, /enableDigitalHumanLibrary:\s*data\.enableDigitalHumanLibrary === true/)
})

test('资产面板仅在数字人资产库开启时显示数字人选项卡', () => {
  assert.match(assetPanel, /digitalHumanLibraryEnabled/)
  assert.match(assetPanel, /if \(ft\.key === 'digital-human'\) return digitalHumanLibraryEnabled\.value/)
})

test('资产面板不再将数字人资产插入为独立画布节点', () => {
  assert.doesNotMatch(assetPanel, /function handleDigitalHumanInsert\(asset\)/)
  assert.doesNotMatch(assetPanel, /@insert="handleDigitalHumanInsert"/)
  assert.doesNotMatch(digitalHumanPanel, /添加到画布/)
  assert.doesNotMatch(canvas, /case 'digital-human':\s*nodeType = 'digital-human'/)
  assert.doesNotMatch(canvasBoard, /case 'digital-human':\s*canvasStore\.addNode/)
})

test('已有数字人节点可双击或点击选择角色以更新 HeyGen 绑定', () => {
  assert.match(digitalHumanNode, /import DigitalHumanSelector from '\.\.\/DigitalHumanSelector\.vue'/)
  assert.match(digitalHumanNode, /@dblclick\.stop="openSelector"/)
  assert.match(digitalHumanNode, /点击选择角色/)
  assert.match(digitalHumanNode, /@select="handleSelect"/)
  assert.match(digitalHumanNode, /canvasStore\.updateNodeData\(props\.id, \{[\s\S]*assetId: asset\.id/)
  assert.match(digitalHumanSelector, /getAssets\(\{[\s\S]*type: 'digital-human'/)
  assert.match(digitalHumanSelector, /metadata\(asset\)\.status === 'completed'/)
})

test('HeyGen 数字人显示在画布的功能节点菜单中，并跟随租户开关', () => {
  assert.match(nodeSelector, /isDigitalHumanLibraryEnabled/)
  assert.match(nodeSelector, /v-if="isDigitalHumanLibraryEnabled\(\)" class="node-selector-item" @click="selectNodeType\(NODE_TYPES\.DIGITAL_HUMAN\)"/)
})

test('画布图片和视频右键菜单提供一键创建 HeyGen 数字人资产', () => {
  assert.match(nodeContextMenu, /isDigitalHumanLibraryEnabled/)
  assert.match(nodeContextMenu, /createDigitalHumanFromNode/)
  assert.match(nodeContextMenu, /isImageNodeWithOutput\.value \|\| isVideoNodeWithOutput\.value/)
  assert.match(nodeContextMenu, /一键创建 HeyGen 数字人/)
})
