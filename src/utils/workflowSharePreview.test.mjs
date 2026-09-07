import { strict as assert } from 'node:assert'
import {
  getWorkflowShareNodePreview,
  isSharePreviewMediaUrl,
  normalizeWorkflowShareEdges,
  normalizeWorkflowSharePayload
} from './workflowSharePreview.js'

const normalized = normalizeWorkflowSharePayload({
  mode: 'clone',
  canClone: true,
  warnings: ['后端提示'],
  sourceRevision: 7,
  workflow: {
    name: '示例工作流',
    nodes: [
      { id: 'known', type: 'text-input', position: { x: 0, y: 0 }, data: { prompt: 'long prompt' } },
      { id: 'unknown', type: 'future-node', position: { x: 300, y: 0 }, data: {} }
    ],
    edges: []
  }
})

assert.equal(normalized.canClone, true)
assert.equal(normalized.workflow.nodes.length, 2)
assert.deepEqual(normalized.warnings, ['后端提示'])
assert.equal(normalizeWorkflowSharePayload({ mode: 'view', canClone: true }).canClone, false)
const normalizedEdges = normalizeWorkflowShareEdges([
  { id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'output', targetHandle: 'input' }
])
assert.equal(normalizedEdges[0].sourceHandle, undefined)
assert.equal(normalizedEdges[0].targetHandle, undefined)
assert.equal(isSharePreviewMediaUrl('data:image/png;base64,abc'), false)
assert.equal(isSharePreviewMediaUrl('https://cdn.example.test/a.png?X-Amz-Signature=secret'), false)
assert.equal(isSharePreviewMediaUrl('https://cdn.example.test/a.png'), true)

const preview = getWorkflowShareNodePreview({
  id: 'node-1',
  type: 'digital-human',
  data: {
    parameters: { nested: { width: 1024 }, apiKey: 'hidden' },
    output: { urls: ['https://cdn.example.test/result.png'] },
    generatedImage: 'https://cdn.example.test/generated.png'
  }
})
assert.match(preview.parameterJson, /"width": 1024/)
assert.match(preview.parameterJson, /已隐藏敏感参数/)
assert.equal(preview.media.length, 2)

console.log('workflowShare preview tests passed')
