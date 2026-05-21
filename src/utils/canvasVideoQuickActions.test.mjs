import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildVideoQuickActionNode, selectVideoQuickActionModel, VIDEO_QUICK_ACTION_TYPES } from './canvasVideoQuickActions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const helperPath = join(__dirname, 'canvasVideoQuickActions.js')
const nodeSelectorPath = join(__dirname, '../components/canvas/NodeSelector.vue')
const contextMenuPath = join(__dirname, '../components/canvas/NodeContextMenu.vue')

test('video quick action helper centralizes edit and extend Seedance modes', () => {
  assert.ok(existsSync(helperPath), 'shared video quick action helper should exist')
  const source = readFileSync(helperPath, 'utf8')

  assert.match(source, /export function buildVideoQuickActionNode/, 'helper should export node data builder')
  assert.match(source, /export function selectVideoQuickActionModel/, 'helper should export shared model picker')

  const seedanceModel = {
    value: 'seedance-2.0',
    label: '豆包 Seedance 2.0',
    apiType: 'seedance-2.0'
  }
  assert.equal(
    buildVideoQuickActionNode(VIDEO_QUICK_ACTION_TYPES.EDIT, {}, { models: [seedanceModel] }).nodeData.seedance2Mode,
    'video_edit',
    'video edit should initialize Seedance edit mode for real SD2 models'
  )
  assert.equal(
    buildVideoQuickActionNode(VIDEO_QUICK_ACTION_TYPES.EXTEND, {}, { models: [seedanceModel] }).nodeData.seedance2Mode,
    'video_extend',
    'video extend should initialize Seedance extend mode for real SD2 models'
  )
})

test('right-click menu and node selector use the shared video quick action helper', () => {
  const nodeSelector = readFileSync(nodeSelectorPath, 'utf8')
  const contextMenu = readFileSync(contextMenuPath, 'utf8')

  assert.match(nodeSelector, /buildVideoQuickActionNode/, 'NodeSelector should use shared quick action builder')
  assert.match(contextMenu, /buildVideoQuickActionNode/, 'NodeContextMenu should use shared quick action builder')
  assert.match(contextMenu, /getAvailableVideoModels\(\{ disableVeoMerge: true \}\)/, 'NodeContextMenu should pass available models into the shared picker')
  assert.doesNotMatch(nodeSelector, /name\.includes\('seedance'\)/, 'NodeSelector should not infer SD2 mode from model names')
})

test('Bytefor Seedance models are treated as normal video models, not SD2 mode models', () => {
  const byteforModel = {
    value: 'bytefor-seedance-2.0',
    label: 'Bytefor Seedance 2.0',
    apiType: 'seedance-2.0',
    provider: 'bytefor',
    name: 'Bytefor Seedance 2.0',
    displayName: 'Bytefor API Seedance 2.0',
    actualModel: 'byteforapi/seedance-2.0-pro',
    apiBase: 'https://api.byteforapi.com/v1'
  }
  const realSeedanceModel = {
    value: 'seedance-2.0',
    label: '豆包 Seedance 2.0',
    apiType: 'seedance-2.0',
    seedanceConfig: { supportedModes: { video_edit: true } }
  }

  assert.equal(
    selectVideoQuickActionModel([byteforModel, realSeedanceModel], VIDEO_QUICK_ACTION_TYPES.EDIT),
    realSeedanceModel
  )

  const { nodeData } = buildVideoQuickActionNode(VIDEO_QUICK_ACTION_TYPES.EDIT, {
    data: { output: { url: 'https://cdn.example.com/source.mp4' } }
  }, {
    models: [byteforModel]
  })

  assert.equal(nodeData.model, 'bytefor-seedance-2.0')
  assert.equal(nodeData.seedance2Mode, undefined)
  assert.equal(nodeData.klingO1Mode, undefined)
})

test('Bytefor wrapped HappyHorse models are not selected as Seedance quick action candidates', () => {
  const byteforHappyHorseModel = {
    value: 'bytefor-happyhorse',
    label: 'Bytefor HappyHorse',
    apiType: 'happyhorse',
    provider: 'byteforapi',
    actualModel: 'byteforapi/happyhorse-video'
  }
  const fallbackModel = {
    value: 'plain-video',
    label: 'Plain Video',
    apiType: 'grok'
  }

  assert.equal(
    selectVideoQuickActionModel([byteforHappyHorseModel, fallbackModel], VIDEO_QUICK_ACTION_TYPES.EXTEND),
    byteforHappyHorseModel,
    'Bytefor HappyHorse can remain the fallback model but must not be treated as SD2'
  )

  const { nodeData } = buildVideoQuickActionNode(VIDEO_QUICK_ACTION_TYPES.EXTEND, {}, {
    models: [byteforHappyHorseModel, fallbackModel]
  })

  assert.equal(nodeData.model, 'bytefor-happyhorse')
  assert.equal(nodeData.seedance2Mode, undefined)
})

test('canvas video quick actions and node selector rely on shared SD2 model detection', () => {
  const helper = readFileSync(helperPath, 'utf8')
  const nodeSelector = readFileSync(nodeSelectorPath, 'utf8')

  assert.match(helper, /isSeedanceSd2VideoModel/, 'quick action helper should use shared SD2 detector')
  assert.match(nodeSelector, /isSeedanceSd2VideoModel|buildVideoQuickActionNode/, 'NodeSelector should use shared SD2 detection or quick action helper')
  assert.doesNotMatch(
    helper,
    /apiType === 'seedance-2\.0'\s*\|\|\s*apiType === 'ant'\s*\|\|\s*apiType === 'happyhorse'/,
    'quick action helper should not keep a local SD2 apiType triple check'
  )
  assert.doesNotMatch(
    nodeSelector,
    /apiType === 'seedance-2\.0'\s*\|\|\s*apiType === 'ant'\s*\|\|\s*apiType === 'happyhorse'/,
    'NodeSelector should not keep a local SD2 apiType triple check'
  )
})
