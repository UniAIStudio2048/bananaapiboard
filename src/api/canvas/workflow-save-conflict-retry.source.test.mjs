import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./workflow.js', import.meta.url), 'utf8')

test('save failures expose server error code and node versions for conflict recovery', () => {
  assert.match(
    source,
    /err\.code = data\.code/,
    'non-2xx saves should surface the backend error code (e.g. version_conflict)'
  )
  assert.match(
    source,
    /err\.nodeVersions = data\.node_versions/,
    'non-2xx saves should carry node_versions when the server reports them'
  )
})

test('raw and structured saves use the shared conflict-retry wrapper', () => {
  assert.match(
    source,
    /export async function saveWorkflowRaw\(jsonBody\)[\s\S]*?await saveWorkflowWithConflictRetry\(jsonBody\)/
  )
  assert.match(
    source,
    /export async function saveWorkflow\(\w+\)[\s\S]*?await saveWorkflowWithConflictRetry\(JSON\.stringify\(\w+\)\)/
  )
})
