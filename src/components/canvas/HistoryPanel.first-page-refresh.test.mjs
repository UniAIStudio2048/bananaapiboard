import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

test('history panel renders first server page before full background refresh', () => {
  assert.match(source, /maxPages:\s*1/)
  assert.match(source, /cacheResult:\s*false/)
  assert.match(source, /_refreshHistoryInBackground\(spaceParams, spaceType, teamId/)
})

test('history panel auto refresh checks only the first history page', () => {
  assert.match(source, /getHistory\(\{ \.\.\.spaceParams, noCache: true, maxPages: 1 \}\)/)
  assert.match(source, /function _isHistoryPrefixEqual/)
})

test('history panel background refreshes do not replace the open masonry grid with loading state', () => {
  const autoRefreshBody = source.match(/function startAutoRefresh\(\) \{([\s\S]*?)\n\}\n\nfunction stopAutoRefresh/)?.[1] || ''
  const teamSyncBody = source.match(/async function checkTeamSync\(\) \{([\s\S]*?)\n\}\n\n\/\*\*\n \* 启动团队空间实时同步/)?.[1] || ''
  const invalidateBody = source.match(/function handleCanvasHistoryInvalidate\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.doesNotMatch(autoRefreshBody, /loadHistory\(true\)/, 'auto refresh should not turn on the full loading state while the panel is open')
  assert.doesNotMatch(teamSyncBody, /loadHistory\(true\)/, 'team sync should not turn on the full loading state while the panel is open')
  assert.doesNotMatch(invalidateBody, /loadHistory\(true\)/, 'history invalidation should refresh silently while the panel is open')
  assert.match(autoRefreshBody, /refreshOpenHistorySilently\(\)/, 'auto refresh should update the visible list through the silent path')
  assert.match(teamSyncBody, /refreshOpenHistorySilently\(\)/, 'team sync should update the visible list through the silent path')
  assert.match(invalidateBody, /refreshOpenHistorySilently\(\)/, 'history invalidation should update the visible list through the silent path')
})
