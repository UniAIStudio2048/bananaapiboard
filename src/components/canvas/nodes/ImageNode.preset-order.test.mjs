import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'ImageNode.vue'), 'utf8')

function availablePresetsBlock() {
  const start = source.indexOf('const availablePresets = computed(() => {')
  const end = source.indexOf('\n})\n\n// 当前选中预设的显示名称', start)
  assert.ok(start >= 0 && end > start, 'availablePresets computed block should exist')
  return source.slice(start, end)
}

test('image node lists no preset, user presets, then tenant presets', () => {
  const block = availablePresetsBlock()
  const noPresetIndex = block.indexOf("name: '无预设'")
  const userPresetIndex = block.indexOf('presets.push(...userPresets.value.map')
  const tenantPresetIndex = block.indexOf('tenantPresets.value.map')

  assert.ok(noPresetIndex >= 0, 'no preset should be available')
  assert.ok(userPresetIndex >= 0, 'user presets should be included')
  assert.ok(tenantPresetIndex >= 0, 'tenant presets should be included')
  assert.ok(noPresetIndex < userPresetIndex, 'no preset should be first')
  assert.ok(userPresetIndex < tenantPresetIndex, 'user presets should precede tenant presets')
  assert.doesNotMatch(block, /divider-tenant|租户平台预设/, 'tenant presets should not have a visible group heading')
})

test('image node exposes preset management from the no-preset gear popover', () => {
  assert.match(source, /class="preset-dropdown-scroll"[\s\S]*v-for="preset in availablePresets"/)
  assert.match(source, /class="preset-none-option"[\s\S]*togglePresetActions/)
  assert.match(source, /class="preset-actions-popover"[\s\S]*action-manage[\s\S]*action-new/)
  assert.match(source, /class="preset-actions-trigger"[\s\S]*aria-label="预设管理"/)
})

test('image preset panels use the same dark surface as the video ratio panel', () => {
  const presetPanelStart = source.indexOf('.preset-dropdown-list {')
  const presetPanelEnd = source.indexOf('\n}', presetPanelStart)
  const actionsCardStart = source.indexOf('.preset-actions-popover {')
  const actionsCardEnd = source.indexOf('\n}', actionsCardStart)
  assert.ok(presetPanelStart >= 0 && presetPanelEnd > presetPanelStart)
  assert.ok(actionsCardStart >= 0 && actionsCardEnd > actionsCardStart)
  assert.match(source.slice(presetPanelStart, presetPanelEnd), /background:\s*#252525;/)
  assert.match(source.slice(actionsCardStart, actionsCardEnd), /background:\s*#252525;/)
})
