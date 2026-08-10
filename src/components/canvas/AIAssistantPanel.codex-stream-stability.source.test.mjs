import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('codex stream never rewrites already-output content on turn.completed', () => {
  const block = source.match(/onContent: \(text, isFinal\) => \{[\s\S]*?\n    \},/)?.[0]
  assert.ok(block, 'codex onContent block should exist')
  assert.doesNotMatch(block, /message\.content = text\.slice\(contentOffset\)/)
  assert.match(block, /text\.startsWith\(last\.content \|\| ''\)/)
})

test('codex stream still appends incremental deltas', () => {
  const block = source.match(/onContent: \(text, isFinal\) => \{[\s\S]*?\n    \},/)?.[0]
  assert.match(block, /last\.content \+= text/)
})
