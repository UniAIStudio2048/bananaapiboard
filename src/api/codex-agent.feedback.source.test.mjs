import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('Codex API exposes turn feedback helper', () => {
  const source = fs.readFileSync(new URL('./codex-agent.js', import.meta.url), 'utf8')
  assert.match(source, /export async function submitCodexTurnFeedback/)
  assert.match(source, /\/feedback/)
})
