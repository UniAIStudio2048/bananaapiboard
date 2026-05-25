import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('./community.js', import.meta.url), 'utf8')

test('forkProject sends target space payload to backend', () => {
  assert.match(source, /export function forkProject\(workId,\s*data\s*=\s*\{\}\)/)
  assert.match(
    source,
    /request\(`\/api\/community\/works\/\$\{workId\}\/fork-project`,\s*\{\s*method:\s*'POST',\s*body:\s*data\s*\}\)/s
  )
})
