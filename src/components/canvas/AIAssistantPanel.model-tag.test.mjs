import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('shows the selected model as a removable tag above the assistant prompt', () => {
  assert.match(source, /<div v-if="selectedAssistantModel" class="selected-model-tag">/)
  assert.match(source, /<ModelIcon :icon="getAssistantModelIcon\(selectedAssistantModel\)" :label="selectedAssistantModel\.label \|\| selectedAssistantModel\.value" \/>/)
  assert.match(source, /title="移除已选模型"[\s\S]*?@click="clearAssistantModel"/)
  assert.match(source, /const selectedAssistantModel = computed\(\(\) => \{[\s\S]*?modelPickerModels\.value\.find\(model => isAssistantModelSelected\(model\)\)/)
})

test('uses CDN thumbnail URLs for icons in the model picker', () => {
  assert.match(source, /import \{ getAssistantModelIcon \} from '@\/utils\/aiAssistantModels'/)
  assert.match(source, /<ModelIcon :icon="getAssistantModelIcon\(model\)" :label="model\.label \|\| model\.value" \/>/)
})
