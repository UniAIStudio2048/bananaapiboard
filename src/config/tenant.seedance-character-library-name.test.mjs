import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./tenant.js', import.meta.url), 'utf8')
const assetPanel = readFileSync(new URL('../components/canvas/AssetPanel.vue', import.meta.url), 'utf8')
const contextMenu = readFileSync(new URL('../components/canvas/NodeContextMenu.vue', import.meta.url), 'utf8')

test('tenant config exposes a Seedance character library name helper', () => {
  assert.match(source, /seedanceCharacterLibraryName/)
  assert.match(source, /getSeedanceCharacterLibraryName/)
})

test('asset panel and context menu use the same configurable Seedance name', () => {
  assert.match(assetPanel, /getSeedanceCharacterLibraryName/)
  assert.match(contextMenu, /getSeedanceCharacterLibraryName/)
})
