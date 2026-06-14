import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function styleBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `${selector} should exist`)
  return match[1]
}

function assertReadableControlBlock(source, selector) {
  const block = styleBlock(source, selector)
  assert.match(block, /min-height:\s*(?:var\(--director-control-height(?:,\s*3[2-9]px)?\)|3[2-9]px)/, `${selector} should use a readable min-height`)
  assert.doesNotMatch(block, /(?:^|\n)\s*height:\s*(?:2[4-9]|30|32)px;/, `${selector} should not force compact fixed text height`)
  assert.match(block, /line-height:\s*(?:var\(--director-control-line-height(?:,\s*1\.(?:3|35|4|45))?\)|1\.(?:3|35|4|45))/, `${selector} should set a readable line-height`)
}

test('director studio localized controls avoid fixed-height text clipping', () => {
  const toolbar = read('./DirectorStudioToolbar.vue')
  const inspector = read('./DirectorStudioInspector.vue')
  const library = read('./DirectorStudioModelLibrary.vue')
  const shell = read('./DirectorStudioShell.vue')
  const projectPanel = read('./DirectorStudioProjectPanel.vue')
  const snapshotPanel = read('./DirectorStudioSnapshotPanel.vue')

  assertReadableControlBlock(toolbar, '.director-icon-button,\n.director-tool-button,\n.director-command')
  assertReadableControlBlock(toolbar, '.director-toolbar-select')
  assertReadableControlBlock(inspector, 'input,\nselect')
  assertReadableControlBlock(inspector, '.director-transform-tabs button,\n.director-action-row button,\n.director-wide-button')
  assertReadableControlBlock(library, '.director-library-search,\n.director-field-row select,\n.director-field-grid input')
  assertReadableControlBlock(library, '.director-add-pedestrians')
  assertReadableControlBlock(shell, '.director-mini-button')
  assertReadableControlBlock(projectPanel, '.director-mini-button')
  assertReadableControlBlock(snapshotPanel, '.director-mini-button')
})
