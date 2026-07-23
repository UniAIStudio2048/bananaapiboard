import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'TextNode.vue'), 'utf8')

test('Text node uses the selected tenant preset cost for display and balance checks', () => {
  const costStart = source.indexOf('// 当前 LLM 调用积分消耗')
  const costEnd = source.indexOf('const formattedModelCost', costStart)
  const costBlock = source.slice(costStart, costEnd)

  assert.match(costBlock, /llmConfig\.value\.presets\?\.find\(preset => preset\.id === selectedPreset\.value\)/)
  assert.match(costBlock, /preset\?\.pointsCost/)
  assert.match(costBlock, /Number\.isFinite/)
  assert.match(costBlock, /calculateLLMCost\(model\?\.pointsCost, templateExtra\)/)
  assert.match(source, /userPoints\.value < currentModelCost\.value/)
})
