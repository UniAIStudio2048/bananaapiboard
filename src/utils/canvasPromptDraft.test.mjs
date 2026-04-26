import assert from 'node:assert/strict'
import { persistNodePromptDraft } from './canvasPromptDraft.js'

const calls = []
const store = {
  updateNodeData(nodeId, data) {
    calls.push({ nodeId, data })
  },
  markCurrentTabChanged() {
    calls.push({ changed: true })
  }
}

persistNodePromptDraft(store, 'node-1', 'prompt', 'a sunset over water')

assert.deepEqual(calls, [
  { nodeId: 'node-1', data: { prompt: 'a sunset over water' } },
  { changed: true }
])

persistNodePromptDraft(store, 'node-1', 'prompt', 'a sunset over water')
assert.equal(calls.length, 2)

persistNodePromptDraft(store, 'node-1', 'prompt', '')
assert.deepEqual(calls.at(-2), { nodeId: 'node-1', data: { prompt: '' } })

console.log('canvasPromptDraft tests passed')
