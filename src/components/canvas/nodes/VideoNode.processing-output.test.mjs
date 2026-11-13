import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { computed, reactive, ref } from 'vue'
import { formatVideoNodeErrorMessage } from './video-error-message.js'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(script, { sourceType: 'module' })

function createPreview(data) {
  const names = ['isGenerationInProgress', 'hasOutput', 'shouldRenderVideoOutput', 'readonlyPreviewVideoFailed']
  const declarations = ast.program.body.filter(node =>
    node.type === 'VariableDeclaration' && names.includes(node.declarations[0].id.name)
  )
  return runInNewContext(
    `${declarations.map(node => script.slice(node.start, node.end)).join('\n')}\n;({ hasOutput, shouldRenderVideoOutput })`,
    { props: { data }, computed, ref }
  )
}

test('copied video hides old output during generation and after failure, then shows the new result', () => {
  const data = reactive({ status: 'success', output: { type: 'video', url: 'old.mp4' } })
  const preview = createPreview(data)
  assert.equal(preview.shouldRenderVideoOutput.value, true)
  for (const status of ['pending', 'processing', 'error']) {
    data.status = status
    assert.equal(preview.hasOutput.value, false, `${status} must not expose old output`)
    assert.equal(preview.shouldRenderVideoOutput.value, false)
  }
  assert.equal(data.output.url, 'old.mp4', 'failure must not delete the previous media')
  data.output = { type: 'video', url: 'new.mp4' }
  data.status = 'success'
  assert.equal(preview.shouldRenderVideoOutput.value, true)
})

test('imported idle videos remain visible and failed empty nodes have no video preview', () => {
  assert.equal(createPreview(reactive({ status: 'idle', output: { url: 'upload.mp4' } })).hasOutput.value, true)
  assert.equal(createPreview(reactive({ status: 'error', error: '生成失败' })).hasOutput.value, false)
})

test('rejected submission on a copied node exposes its Chinese error instead of the copied video', async () => {
  const data = reactive({ status: 'success', output: { type: 'video', url: 'copied.mp4' } })
  const preview = createPreview(data)
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'executeNodeGeneration')
  const execute = runInNewContext(`(${script.slice(declaration.start, declaration.end)})`, {
    canvasStore: { updateNodeData: (_id, patch) => Object.assign(data, patch) },
    updateVideoSubmissionNode: async (_id, patch) => Object.assign(data, patch),
    sendGenerateRequest: async () => {
      assert.equal(preview.shouldRenderVideoOutput.value, false)
      throw new Error("The request failed because the input image 'content[4]' may contain real person.")
    },
    selectedModel: ref('seedance-2'),
    isPromptSafetyBlockedError: () => false,
    formatVideoNodeErrorMessage,
    console: { error() {} }
  })
  assert.equal(await execute('copied-node', 'prompt', [], 0), null)
  assert.equal(data.status, 'error')
  assert.match(data.error, /输入图片可能包含真人.*不接受真人素材/)
  assert.equal(preview.shouldRenderVideoOutput.value, false)
  assert.match(source, /v-if="shouldRenderVideoOutput && isNodeVisible"/)
  assert.match(source, /v-else-if="data.status === 'error'"/)
})
