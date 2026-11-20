import { localizedPattern } from '../../../i18n/sourceAssertions.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

function functionBody(sourceText, functionName) {
  const start = sourceText.indexOf(`function ${functionName}(`) >= 0
    ? sourceText.indexOf(`function ${functionName}(`)
    : sourceText.indexOf(`async function ${functionName}(`)
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

test('video node failed preview does not expose a regenerate retry button', () => {
  const errorPreviewMatch = source.match(/<!-- 错误状态 -->[\s\S]*?<!-- 有上游连接时/)
  assert.ok(errorPreviewMatch, 'Expected video error preview template block')

  assert.doesNotMatch(errorPreviewMatch[0], /@click="handleRegenerate"/)
  assert.doesNotMatch(errorPreviewMatch[0], localizedPattern(/>\s*重试\s*<\/button>/))
  assert.match(errorPreviewMatch[0], /handleManualRetryFetch/)
})

test('video submit fetch failures keep the pending submission recoverable', () => {
  const sendStart = source.indexOf('async function sendGenerateRequest')
  const executeStart = source.indexOf('async function executeNodeGeneration')
  assert.ok(sendStart >= 0, 'sendGenerateRequest should exist')
  assert.ok(executeStart > sendStart, 'executeNodeGeneration should follow sendGenerateRequest')

  const sendSource = source.slice(sendStart, executeStart)
  assert.match(sendSource, /error\.clientSubmissionId\s*=\s*submission\.submissionId/)
  assert.match(sendSource, /error\.isVideoSubmissionNetworkError\s*=\s*true/)

  const executeBody = functionBody(source, 'executeNodeGeneration')
  const catchIndex = executeBody.indexOf('} catch (error) {')
  assert.ok(catchIndex >= 0, 'executeNodeGeneration should have a catch block')
  const catchBody = executeBody.slice(catchIndex)
  const transientIndex = catchBody.indexOf('isTransientVideoSubmissionError(error)')
  const removeIndex = catchBody.indexOf('if (submissionId) removeGenerationSubmission(submissionId)', transientIndex)
  assert.ok(transientIndex >= 0, 'executeNodeGeneration should branch on transient submission errors')
  assert.ok(removeIndex > transientIndex, 'transient submission errors must be handled before removing recovery records')
  assert.match(catchBody, /status:\s*'processing'/)
  assert.match(catchBody, localizedPattern(/网络异常，正在确认任务状态/))
  assert.match(catchBody, /requestPendingVideoSubmissionRecovery\(submissionId\)/)
  assert.match(catchBody, /return submissionId/)
})

test('a MySQL timeout from video submission checks the original submission without sending another request', async () => {
  const patches = []
  const marked = []
  const recoveryRequests = []
  let requests = 0
  const dependencies = {
    canvasStore: { getCurrentTab: () => ({ id: 'tab-a' }) },
    updateVideoSubmissionNode: async (_id, patch) => patches.push(patch),
    sendGenerateRequest: async () => {
      requests += 1
      throw Object.assign(new Error('generation_failed'), {
        clientSubmissionId: 'submission-a',
        payload: { error: 'generation_failed', message: 'Query inactivity timeout' }
      })
    },
    selectedModel: { value: 'seedance' },
    isPromptSafetyBlockedError: () => false,
    isTransientVideoSubmissionError: () => false,
    markVideoSubmissionResponseTimedOut: id => marked.push(id),
    requestPendingVideoSubmissionRecovery: id => recoveryRequests.push(id),
    removeGenerationSubmission: () => assert.fail('the submission must remain recoverable'),
    translateUi: key => key,
    console: { error() {} }
  }
  const execute = new Function(...Object.keys(dependencies), `
    return async function executeNodeGeneration(nodeId, finalPrompt, finalImages, taskIndex, capturedState = {}) {
      ${functionBody(source, 'executeNodeGeneration')}
    }
  `)(...Object.values(dependencies))

  assert.equal(await execute('video-a', 'prompt', [], 0), 'submission-a')
  assert.equal(requests, 1)
  assert.deepEqual(marked, ['submission-a'])
  assert.deepEqual(recoveryRequests, ['submission-a'])
  assert.equal(patches.at(-1).status, 'processing')
  assert.equal(patches.at(-1).clientSubmissionId, 'submission-a')
  assert.equal(patches.at(-1).error, null)
})
