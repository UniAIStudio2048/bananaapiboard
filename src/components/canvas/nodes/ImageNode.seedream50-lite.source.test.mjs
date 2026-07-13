import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const functionStart = source.indexOf('function checkIsSeedream50Lite(model)')
const functionEnd = source.indexOf('\n}\n\n// 辅助函数：检查是否是 Seedream 4.5', functionStart)

assert.ok(functionStart >= 0, 'checkIsSeedream50Lite should exist')
assert.ok(functionEnd > functionStart, 'checkIsSeedream50Lite should have a readable function body')

const functionSource = source.slice(functionStart, functionEnd + 2)
const checkIsSeedream50Lite = new Function(`${functionSource}; return checkIsSeedream50Lite`)()

test('Seedream 5.0 Lite classifier accepts only the Lite model', () => {
  assert.equal(checkIsSeedream50Lite({ name: 'seedream-5.0-lite' }), true)
  assert.equal(checkIsSeedream50Lite({ actualModel: 'doubao-seedream-5-0-260128' }), true)
  assert.equal(checkIsSeedream50Lite({ name: 'seedream-5.0-pro' }), false)
  assert.equal(checkIsSeedream50Lite({ actualModel: 'doubao-seedream-5-0-pro-260628' }), false)
})
