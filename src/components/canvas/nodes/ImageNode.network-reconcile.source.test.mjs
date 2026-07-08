import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')

function functionBody(sourceText, functionName) {
  const start = sourceText.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `Expected ${functionName} to exist`)

  const paramsEnd = sourceText.indexOf(')', start)
  assert.ok(paramsEnd > start, `Expected ${functionName} parameter list to close`)
  const bodyStart = sourceText.indexOf('{', paramsEnd)
  let depth = 0
  for (let i = bodyStart; i < sourceText.length; i += 1) {
    if (sourceText[i] === '{') depth += 1
    if (sourceText[i] === '}') depth -= 1
    if (depth === 0) return sourceText.slice(bodyStart + 1, i)
  }

  throw new Error(`Could not parse ${functionName}`)
}

test('native fetch failures enter image history reconciliation instead of terminal error', () => {
  const executeBody = functionBody(source, 'executeNodeGeneration')

  assert.match(source, /import \{ getHistory \} from '@\/api\/canvas\/history'/)
  assert.match(source, /function isNativeFetchNetworkError\(error\)/)
  assert.match(source, /async function reconcileNodeFromHistory\(nodeId,\s*\{\s*prompt,\s*userPrompt,\s*submittedAt,\s*model\s*\}\)/)
  assert.match(executeBody, /const targetNode = canvasStore\.nodes\.find\(n => n\.id === nodeId\)/)
  assert.match(executeBody, /const submittedAt = targetNode\?\.data\?\.processingStartedAt \|\| Date\.now\(\)/)
  assert.match(executeBody, /if \(!isNativeFetchNetworkError\(error\)\) \{[\s\S]*?status: 'error'[\s\S]*?return \{ error: error\.message, detail: errorDetail \}[\s\S]*?\}/)
  assert.match(executeBody, /status: 'processing'[\s\S]*progress: '网络波动，正在核对结果\.\.\.'[\s\S]*_reconciling: true/)
  assert.match(executeBody, /await reconcileNodeFromHistory\(nodeId,\s*\{\s*prompt: finalPrompt,\s*userPrompt,\s*submittedAt,\s*model: selectedModel\.value\s*\}\)/)
})

test('history reconciliation uses current space, tolerant prompt matching, and success fallback updates', () => {
  const reconcileBody = functionBody(source, 'reconcileNodeFromHistory')
  const matchBody = functionBody(source, 'pickBestHistoryMatch')
  const networkErrorBody = functionBody(source, 'isNativeFetchNetworkError')

  assert.match(networkErrorBody, /error\?\.name === 'TypeError'/)
  assert.match(networkErrorBody, /if \(error\?\.code\) return false/)
  assert.match(networkErrorBody, /Failed to fetch/)
  assert.match(networkErrorBody, /NetworkError/)
  assert.match(networkErrorBody, /Load failed/)

  assert.match(reconcileBody, /const maxAttempts = 6/)
  assert.match(reconcileBody, /const intervalMs = 5000/)
  assert.match(reconcileBody, /teamStore\.getSpaceParams\('current'\)/)
  assert.match(reconcileBody, /getHistory\(\{[\s\S]*type: 'image'[\s\S]*limit: 20[\s\S]*noCache: true/)
  assert.match(matchBody, /submittedAt - 60000/)
  assert.match(matchBody, /isHistoryPromptMatch\(item,\s*\{\s*prompt,\s*userPrompt\s*\}\)/)
  assert.match(matchBody, /isHistoryModelMatch\(a\.item\.model,\s*model\)/)
  assert.match(reconcileBody, /status: 'success'[\s\S]*_reconciling: false[\s\S]*output:\s*\{ type: 'image', urls: \[matched\.url\], url: matched\.url \}/)
  assert.match(reconcileBody, /invalidateCanvasHistory\(\)/)
  assert.match(reconcileBody, /网络异常，未能确认生成结果，请查看历史记录/)
})

test('successful reconciliation returns a non-error result to avoid aggregate failure overwrite', () => {
  const executeBody = functionBody(source, 'executeNodeGeneration')

  assert.match(executeBody, /const reconciled = await reconcileNodeFromHistory\(nodeId,/)
  assert.match(executeBody, /return reconciled\s*\?\s*\{ reconciled: true \}\s*:\s*\{ error: '网络异常，未能确认生成结果，请查看历史记录', detail: errorDetail \}/)
})
