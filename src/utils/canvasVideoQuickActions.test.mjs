import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const helperPath = join(__dirname, 'canvasVideoQuickActions.js')
const nodeSelectorPath = join(__dirname, '../components/canvas/NodeSelector.vue')
const contextMenuPath = join(__dirname, '../components/canvas/NodeContextMenu.vue')

test('video quick action helper centralizes edit and extend Seedance modes', () => {
  assert.ok(existsSync(helperPath), 'shared video quick action helper should exist')
  const source = readFileSync(helperPath, 'utf8')

  assert.match(source, /export function buildVideoQuickActionNode/, 'helper should export node data builder')
  assert.match(source, /video-edit[\s\S]*seedance2Mode:\s*'video_edit'/, 'video edit should initialize Seedance edit mode')
  assert.match(source, /video-extend[\s\S]*seedance2Mode:\s*'video_extend'/, 'video extend should initialize Seedance extend mode')
  assert.match(source, /export function selectVideoQuickActionModel/, 'helper should export shared model picker')
})

test('right-click menu and node selector use the shared video quick action helper', () => {
  const nodeSelector = readFileSync(nodeSelectorPath, 'utf8')
  const contextMenu = readFileSync(contextMenuPath, 'utf8')

  assert.match(nodeSelector, /buildVideoQuickActionNode/, 'NodeSelector should use shared quick action builder')
  assert.match(contextMenu, /buildVideoQuickActionNode/, 'NodeContextMenu should use shared quick action builder')
  assert.match(contextMenu, /getAvailableVideoModels\(\{ disableVeoMerge: true \}\)/, 'NodeContextMenu should pass available models into the shared picker')
})
