import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')

function createHarness({ spaceType = 'personal', workflowId = 'saved-workflow', saved = true } = {}) {
  const currentTab = { id: 'tab-local-only', workflowId, name: '新建工作流', workflowSpaceType: spaceType, workflowTeamId: spaceType === 'team' ? 'team-one' : null }
  const state = {
    canvasStore: { getCurrentTab: () => currentTab, workflowMeta: {} },
    teamStore: { globalSpaceType: { value: 'team' }, globalTeamId: { value: 'other-team' } },
    workflowToShare: { value: null },
    showWorkflowShareDialog: { value: false },
    shareAfterSave: { value: false },
    showSaveDialog: { value: false },
    quickSaveWorkflow: async () => saved
  }
  const functions = ['getEditorShareWorkflow', 'openWorkflowShareDialog', 'openShareWorkflow'].map(name => {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))
    assert.ok(match, `${name} must exist`)
    return match[0]
  }).join('\n')
  return { ...state, open: new Function(...Object.keys(state), `${functions}\nreturn openShareWorkflow`)(...Object.values(state)) }
}

for (const spaceType of ['personal', 'team']) {
  test(`${spaceType} sharing uses the persisted workflow ID, never the local tab ID`, async () => {
    const harness = createHarness({ spaceType })
    await harness.open()
    assert.equal(harness.showWorkflowShareDialog.value, true)
    assert.equal(harness.workflowToShare.value.id, 'saved-workflow')
    assert.equal(harness.workflowToShare.value.space_type, spaceType)
    await harness.open()
    assert.equal(harness.workflowToShare.value.id, 'saved-workflow')
  })
}

test('unsaved workflows must be saved before opening sharing', async () => {
  const harness = createHarness({ workflowId: null })
  await harness.open()
  assert.equal(harness.showSaveDialog.value, true)
  assert.equal(harness.shareAfterSave.value, true)
  assert.equal(harness.showWorkflowShareDialog.value, false)
})

test('failed saves do not open sharing', async () => {
  const harness = createHarness({ saved: false })
  await harness.open()
  assert.equal(harness.showWorkflowShareDialog.value, false)
})
