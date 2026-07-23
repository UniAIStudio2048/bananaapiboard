import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateLLMCost } from './llmCost.js'

test('LLM template cost of zero keeps the model base cost', () => {
  assert.equal(calculateLLMCost(5, 0), 5)
})

test('LLM cost is the model base cost plus the template cost', () => {
  assert.equal(calculateLLMCost('2.5', '1.5'), 4)
})

test('LLM cost uses safe defaults for missing costs', () => {
  assert.equal(calculateLLMCost(undefined, undefined), 1)
})
