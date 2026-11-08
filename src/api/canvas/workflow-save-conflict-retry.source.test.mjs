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

test('version conflicts are surfaced without retrying a stale full snapshot', () => {
  const retry = source.match(/async function saveWorkflowWithConflictRetry[\s\S]*?\n\}/)
  assert.ok(retry, 'a conflict-retry wrapper should exist')
  assert.doesNotMatch(retry[0], /merged\.baseNodeVersions = error\.nodeVersions/)
  assert.match(retry[0], /return await requestWorkflowSave\(jsonBody\)/)
  assert.match(
    source,
    /saveWorkflowWithConflictRetry\(jsonBody\)/,
    'both saveWorkflow and saveWorkflowRaw should route through the retry wrapper'
  )
})
