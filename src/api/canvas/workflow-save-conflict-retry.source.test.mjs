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

test('version conflicts refresh the save baseline and retry once', () => {
  const retry = source.match(/async function saveWorkflowWithConflictRetry[\s\S]*?\n\}/)
  assert.ok(retry, 'a conflict-retry wrapper should exist')
  assert.match(
    retry[0],
    /error\.code === 'version_conflict' && error\.nodeVersions/,
    'retry must be gated on server-reported version conflicts with fresh versions'
  )
  assert.match(
    retry[0],
    /merged\.baseNodeVersions = error\.nodeVersions/,
    'retry must replace the stale baseline with the server versions'
  )
  assert.match(
    source,
    /saveWorkflowWithConflictRetry\(jsonBody\)/,
    'both saveWorkflow and saveWorkflowRaw should route through the retry wrapper'
  )
})
