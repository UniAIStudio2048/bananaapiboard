import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('video node keeps the submit button inside the prompt panel after adding translation control', () => {
  const configLeft = cssBlock('.config-left')
  const configRight = cssBlock('.config-right')
  const generateButton = cssBlock('.generate-btn')

  assert.match(configLeft, /flex:\s*1\s+1\s+auto;/)
  assert.match(configLeft, /min-width:\s*0;/)
  assert.match(configRight, /flex:\s*0\s+0\s+auto;/)
  assert.match(configRight, /min-width:\s*0;/)
  assert.match(generateButton, /flex-shrink:\s*0;/)
})
