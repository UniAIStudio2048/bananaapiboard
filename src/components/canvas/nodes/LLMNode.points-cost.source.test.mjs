import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'LLMNode.vue'), 'utf8')

test('LLM node uses the tenant preset points cost for its balance check', () => {
  assert.match(source, /import \{[^}]*getLLMConfig[^}]*\} from '@\/api\/canvas\/llm'/s)
  assert.match(source, /const configuredPointsCost = ref\(null\)/)
  assert.match(source, /const configuredModelPointsCost = ref\(null\)/)
  assert.match(source, /configuredPreset\?\.pointsCost/)
  assert.match(source, /calculateLLMCost\(/)
  assert.match(source, /configuredModelPointsCost\.value/)
})
