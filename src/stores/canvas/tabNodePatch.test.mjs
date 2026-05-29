import test from 'node:test'
import assert from 'node:assert/strict'

import { applyNodeDataPatchToTabs } from './tabNodePatch.js'

test('applies task result patches to an inactive workflow tab node', () => {
  const tabs = [
    {
      id: 'tab-active',
      nodes: [
        { id: 'active-node', data: { status: 'idle' } }
      ],
      hasChanges: false
    },
    {
      id: 'tab-background',
      nodes: [
        {
          id: 'image-node',
          data: {
            status: 'processing',
            taskId: 'task-1',
            output: null,
            _mediaLoading: true,
            _originalMedia: {
              output: { type: 'image', urls: ['https://cdn.example.com/stale.png'] }
            },
            prompt: 'keep me'
          }
        }
      ],
      hasChanges: false
    }
  ]

  const result = applyNodeDataPatchToTabs(tabs, 'tab-active', 'image-node', {
    status: 'success',
    progress: null,
    output: {
      type: 'image',
      urls: ['https://cdn.example.com/final.png']
    }
  })

  assert.equal(result?.tabId, 'tab-background')
  assert.equal(result?.nodeId, 'image-node')
  assert.equal(tabs[1].hasChanges, true)
  assert.equal(tabs[1].nodes[0].data.status, 'success')
  assert.equal(tabs[1].nodes[0].data.prompt, 'keep me')
  assert.equal(tabs[1].nodes[0].data._mediaLoading, false)
  assert.equal(tabs[1].nodes[0].data._originalMedia, null)
  assert.deepEqual(tabs[1].nodes[0].data.output.urls, ['https://cdn.example.com/final.png'])
})

test('does not patch the active tab when excludeActive is enabled', () => {
  const tabs = [
    {
      id: 'tab-active',
      nodes: [
        { id: 'image-node', data: { status: 'processing' } }
      ],
      hasChanges: false
    }
  ]

  const result = applyNodeDataPatchToTabs(tabs, 'tab-active', 'image-node', {
    status: 'success'
  })

  assert.equal(result, null)
  assert.equal(tabs[0].nodes[0].data.status, 'processing')
  assert.equal(tabs[0].hasChanges, false)
})
