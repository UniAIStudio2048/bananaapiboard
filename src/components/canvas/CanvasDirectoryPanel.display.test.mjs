import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./CanvasDirectoryPanel.vue', import.meta.url), 'utf8')

function createHarness() {
  const state = {
    props: { nodes: [{ id: 'g1', type: 'group' }, { id: 'g2', type: 'group' }, { id: 'n', type: 'image' }] },
    displayMode: { value: 'grid' },
    showDisplaySettings: { value: true },
    expandedFolderIds: { value: new Set(['g1']) },
    openMenuId: { value: 'n' },
    closeHoverPreview: () => { state.previewClosed = true }
  }
  const names = ['setDisplayMode', 'setAllFoldersExpanded']
  const functions = names.map(name => {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))
    assert.ok(match, `${name} must exist`)
    return match[0]
  }).join('\n')
  return { state, ...new Function(...Object.keys(state), `${functions}\nreturn { ${names.join(', ')} }`)(...Object.values(state)) }
}

test('switching display mode preserves folder state and closes overlays', () => {
  const { state, setDisplayMode } = createHarness()
  setDisplayMode('list')
  assert.equal(state.displayMode.value, 'list')
  assert.deepEqual([...state.expandedFolderIds.value], ['g1'])
  assert.equal(state.openMenuId.value, null)
  assert.equal(state.showDisplaySettings.value, false)
  assert.equal(state.previewClosed, true)
  setDisplayMode('grid')
  assert.equal(state.displayMode.value, 'grid')
})

test('expand all includes groups outside the search results and excludes nodes', () => {
  const { state, setAllFoldersExpanded } = createHarness()
  setAllFoldersExpanded(true)
  assert.deepEqual([...state.expandedFolderIds.value], ['g1', 'g2'])
  assert.equal(state.showDisplaySettings.value, false)
  setAllFoldersExpanded(true)
  assert.deepEqual([...state.expandedFolderIds.value], ['g1', 'g2'])
})

test('collapse all is repeatable and later expansion restores every group', () => {
  const { state, setAllFoldersExpanded } = createHarness()
  setAllFoldersExpanded(false)
  setAllFoldersExpanded(false)
  assert.equal(state.expandedFolderIds.value.size, 0)
  setAllFoldersExpanded(true)
  assert.equal(state.expandedFolderIds.value.size, 2)
})

test('grid renders root and folder cards using the same thumbnails and actions', () => {
  assert.match(source, /directory-grid/)
  assert.match(source, /directory-root-nodes/)
  assert.match(source, /grid-template-columns:\s*repeat\(auto-fill,/)
  assert.match(source, /aspect-ratio:\s*1/)
  assert.match(source, /loading="lazy"/)
  assert.match(source, /role="menuitemradio"/)
  assert.match(source, /:aria-checked="displayMode === 'grid'"/)
  assert.match(source, /\.directory-grid \.directory-more-button[\s\S]*?position:\s*absolute/)
  assert.match(source, /<Teleport to="body">[\s\S]*?ref="nodeMenuRef"/)
})

function createPublishHarness() {
  const state = {
    props: { nodes: [{ id: 'image', type: 'image', data: {} }] },
    canvasStore: { getCurrentTab: () => ({ workflowId: 'persisted-id' }), workflowMeta: { id: 'fallback-id', project_id: 'project-id' } },
    publishContext: { value: null },
    showPublishDialog: { value: false },
    openMenuId: { value: 'image' },
    getRowPreviewUrl: () => '/poster.jpg',
    closeHoverPreview: () => {}
  }
  const match = source.match(/function addToInspiration\([^]*?\n\}/)
  assert.ok(match, 'addToInspiration must exist')
  return { state, add: new Function(...Object.keys(state), `${match[0]}\nreturn addToInspiration`)(...Object.values(state)) }
}

test('inspiration opens the existing publication dialog with original media and persisted workflow ID', () => {
  const { state, add } = createPublishHarness()
  add({ id: 'image', name: '原节点名称', mediaKind: 'image', mediaUrl: '/full-image.png' })
  assert.equal(state.showPublishDialog.value, true)
  assert.equal(state.publishContext.value.workflowId, 'persisted-id')
  assert.equal(state.publishContext.value.workflowName, '原节点名称')
  assert.equal(state.publishContext.value.initialMediaUrl, '/full-image.png')
  assert.equal(state.publishContext.value.initialCoverUrl, '/full-image.png')
  assert.equal(state.publishContext.value.initialMediaType, 'image')
  assert.equal(state.openMenuId.value, null)
  assert.match(source, /<PublishWorkDialog[\s\S]*?v-model="showPublishDialog"/)
})

test('video publication uses an image poster and an unsaved canvas does not pass the local tab ID', () => {
  const { state, add } = createPublishHarness()
  state.canvasStore.getCurrentTab = () => ({ id: 'local-tab', workflowId: null })
  state.canvasStore.workflowMeta = {}
  add({ id: 'image', name: 'Clip', mediaKind: 'video', mediaUrl: '/clip.mp4' })
  assert.equal(state.publishContext.value.workflowId, '')
  assert.equal(state.publishContext.value.initialCoverUrl, '/poster.jpg')
  assert.equal(state.publishContext.value.initialMediaUrl, '/clip.mp4')
  assert.equal(state.publishContext.value.initialMediaType, 'video')
})

test('empty, unsupported and deleted nodes cannot open publication', () => {
  const { state, add } = createPublishHarness()
  for (const row of [null, { id: 'image', mediaKind: 'audio', mediaUrl: '/audio.mp3' }, { id: 'image', mediaKind: 'image' }, { id: 'deleted', mediaKind: 'image', mediaUrl: '/full.png' }]) add(row)
  assert.equal(state.showPublishDialog.value, false)
  assert.equal(state.publishContext.value, null)
})

test('pointerdown on a folder menu keeps it mounted until the rename click runs', () => {
  const state = {
    displaySettingsRef: { value: null },
    nodeMenuRef: { value: null },
    panelRef: { value: { contains: () => true } },
    showDisplaySettings: { value: false },
    openMenuId: { value: 'folder' },
    cancelRename: () => {}
  }
  const handler = source.match(/function handleDocumentPointerDown\([^]*?\n\}/)[0]
  const pointerDown = new Function(...Object.keys(state), `${handler}\nreturn handleDocumentPointerDown`)(...Object.values(state))
  pointerDown({ target: { closest: selector => selector.includes('.directory-menu') ? {} : null } })
  assert.equal(state.openMenuId.value, 'folder')
  pointerDown({ target: { closest: () => null } })
  assert.equal(state.openMenuId.value, null)
})
