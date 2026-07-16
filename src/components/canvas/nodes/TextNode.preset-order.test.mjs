import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

test('text node lists user presets before tenant presets', () => {
  const availablePresetsBlock = source.match(
    /const availablePresets = computed\(\(\) => \{([\s\S]*?)\n\}\)\n\n\/\/ \u5f53\u524d\u9009\u4e2d\u9884\u8bbe/
  )?.[1]

  assert.ok(availablePresetsBlock, 'availablePresets computed block should exist')

  const userPresetIndex = availablePresetsBlock.indexOf('presets.push(...userPresets.value.map')
  const tenantPresetIndex = availablePresetsBlock.indexOf('presets.push(...llmConfig.value.presets)')

  assert.notEqual(userPresetIndex, -1, 'user presets should be included')
  assert.notEqual(tenantPresetIndex, -1, 'tenant presets should be included')
  assert.ok(userPresetIndex < tenantPresetIndex, 'user presets should appear first')
})
