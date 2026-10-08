import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./workflow.js', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module' })
let prepareWorkflowSaveBody = body => body
try { ({ prepareWorkflowSaveBody } = await import('../../utils/workflowMediaUpload.js')) } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
}

function harness({ uploadFails = false, responseError = null, conflictOnce = false } = {}) {
  const uploads = [], requests = []
  const context = {
    prepareWorkflowSaveBody, getApiUrl: path => path, getAuthHeaders: () => ({}),
    syncSavedWorkflowVersions: async () => {},
    uploadCanvasFile: async (file, type, options) => {
      uploads.push({ file, type, options })
      if (uploadFails) throw new Error('storage unavailable')
      return { url: `https://cdn.example.com/${type}-${uploads.length}`, isCloud: true }
    },
    fetch: async (_, options) => {
      requests.push(JSON.parse(options.body))
      if (conflictOnce && requests.length === 1) {
        return { ok: false, status: 409, text: async () => JSON.stringify({ error: 'conflict', code: 'version_conflict', node_versions: { v: 4 } }) }
      }
      return { ok: !responseError, status: responseError ? 413 : 200, text: async () => JSON.stringify(responseError || { success: true }) }
    }
  }
  for (const name of ['requestWorkflowSave', 'saveWorkflowWithConflictRetry']) {
    const node = ast.program.body.find(item => item.type === 'FunctionDeclaration' && item.id.name === name)
    context[name] = runInNewContext(`(${source.slice(node.start, node.end)})`, context)
  }
  return { save: context.saveWorkflowWithConflictRetry, uploads, requests }
}

test('the shared save entry uploads repeated nested media first and sends only durable URLs', async () => {
  const h = harness()
  const inline = 'data:video/mp4;base64,dmlkZW8='
  const payload = { id: 'wf', name: 'test', spaceType: 'team', teamId: 'team-1', clientTabId: 'tab', baseNodeVersions: { v: 3 },
    nodes: [{ id: 'v', data: { referenceVideos: [{ url: inline }], inheritedData: { videoUrl: inline }, videoData: 'A'.repeat(1024 * 1024) } }], edges: [] }
  await h.save(JSON.stringify(payload))
  assert.equal(h.uploads.length, 1)
  assert.equal(h.uploads[0].type, 'video')
  assert.equal(h.uploads[0].file.type, 'video/mp4')
  assert.equal(await h.uploads[0].file.text(), 'video')
  assert.equal(h.uploads[0].options.teamId, 'team-1')
  assert.equal(h.requests[0].nodes[0].data.referenceVideos[0].url, 'https://cdn.example.com/video-1')
  assert.equal(h.requests[0].nodes[0].data.inheritedData.videoUrl, 'https://cdn.example.com/video-1')
  assert.equal(h.requests[0].nodes[0].data.videoData, undefined)
  assert.deepEqual(h.requests[0].baseNodeVersions, { v: 3 })
  assert.equal(h.requests[0].clientTabId, 'tab')
  assert.ok(JSON.stringify(h.requests[0]).length < 2048)
})

test('upload failure stops the database save request and leaves the input available for retry', async () => {
  const h = harness({ uploadFails: true })
  const payload = JSON.stringify({ nodes: [{ id: 'v', data: { output: { url: 'data:image/png;base64,aW1hZ2U=' } } }] })
  await assert.rejects(h.save(payload), /上传/)
  assert.equal(h.requests.length, 0)
  assert.ok(payload.includes('data:image/png'))
})

test('database size failures show the server explanation and retain the error code', async () => {
  const h = harness({ responseError: { error: 'data_too_large', message: '工作流结构数据超过数据库限制，请联系管理员。' } })
  await assert.rejects(h.save('{"nodes":[],"edges":[]}'), error => {
    assert.equal(error.message, '工作流结构数据超过数据库限制，请联系管理员。')
    assert.equal(error.code, 'data_too_large')
    assert.equal(error.status, 413)
    return true
  })
})

test('a version-conflict retry reuses the uploaded media and preserves the refreshed baseline', async () => {
  const h = harness({ conflictOnce: true })
  await h.save(JSON.stringify({ nodes: [{ id: 'v', data: { output: { url: 'data:image/png;base64,aW1hZ2U=' } } }], baseNodeVersions: { v: 3 } }))
  assert.equal(h.uploads.length, 1)
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[0].nodes[0].data.output.url, h.requests[1].nodes[0].data.output.url)
  assert.deepEqual(h.requests[1].baseNodeVersions, { v: 4 })
})

test('a live browser blob is uploaded as a file before its temporary URL is saved', async () => {
  const h = harness()
  const temporaryUrl = URL.createObjectURL(new Blob(['audio bytes'], { type: 'audio/wav' }))
  try {
    await h.save(JSON.stringify({ nodes: [{ id: 'audio', data: { audioUrl: temporaryUrl, output: { url: temporaryUrl } } }] }))
    assert.equal(h.uploads.length, 1)
    assert.equal(h.uploads[0].type, 'audio')
    assert.equal(await h.uploads[0].file.text(), 'audio bytes')
    assert.equal(h.requests[0].nodes[0].data.audioUrl, 'https://cdn.example.com/audio-1')
    assert.equal(h.requests[0].nodes[0].data.output.url, 'https://cdn.example.com/audio-1')
  } finally {
    URL.revokeObjectURL(temporaryUrl)
  }
})
