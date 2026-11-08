import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')
const storeSource = readFileSync(join(__dirname, '../../../stores/canvas/canvasStore.js'), 'utf8')

function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = text.indexOf('{', text.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < text.length; index++) {
    if (text[index] === '{') depth++
    if (text[index] === '}') depth--
    if (depth === 0) return text.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

function createStore({ activeTabId, activeNodes, tabs }) {
  const calls = []
  const update = new Function('activeTabId', 'workflowTabs', 'updateNodeData', 'mergeNodeData',
    `${extractFunction(storeSource, 'updateNodeDataForTab')}; return updateNodeDataForTab`
  )(
    { value: activeTabId },
    { value: tabs },
    (nodeId, data) => {
      calls.push(nodeId)
      const node = activeNodes.find(item => item.id === nodeId)
      if (node) node.data = { ...node.data, ...data }
    },
    (current, patch) => ({ ...current, ...patch })
  )
  return { update, calls }
}

test('切换到其他标签后，结果写回发起请求的标签并标记待保存', () => {
  const origin = { id: 'tab-a', hasChanges: false, nodes: [{ id: 'n1', data: { status: 'processing' } }] }
  const activeNodes = [{ id: 'n1', data: { status: 'idle' } }]
  const { update, calls } = createStore({ activeTabId: 'tab-b', activeNodes, tabs: [origin] })

  update('tab-a', 'n1', { status: 'success', llmResponse: 'done' })

  assert.deepEqual(origin.nodes[0].data, { status: 'success', llmResponse: 'done' })
  assert.equal(origin.hasChanges, true)
  assert.equal(activeNodes[0].data.status, 'idle', '不能写到当前标签的同 ID 节点')
  assert.deepEqual(calls, [])
})

test('仍在发起请求的标签时走普通更新', () => {
  const activeNodes = [{ id: 'n1', data: { status: 'processing' } }]
  const { update, calls } = createStore({ activeTabId: 'tab-a', activeNodes, tabs: [{ id: 'tab-a', nodes: [] }] })

  update('tab-a', 'n1', { status: 'success' })

  assert.deepEqual(calls, ['n1'])
  assert.equal(activeNodes[0].data.status, 'success')
})

test('发起请求的标签已关闭时回退到当前画布', () => {
  const activeNodes = [{ id: 'n1', data: { status: 'processing' } }]
  const { update, calls } = createStore({ activeTabId: 'tab-b', activeNodes, tabs: [] })

  update('tab-a', 'n1', { status: 'error' })

  assert.deepEqual(calls, ['n1'])
})

test('store 导出按标签写回的方法', () => {
  assert.match(storeSource, /^\s+updateNodeDataForTab,$/m)
})

test('LLM 请求的所有状态写入都带上发起时的标签', () => {
  const body = extractFunction(source, 'handleLLMGenerate')
  assert.match(body, /const requestTabId = canvasStore\.activeTabId/)
  assert.doesNotMatch(body, /canvasStore\.updateNodeData\(/, '切换标签后普通更新会丢弃结果')
  assert.equal(body.match(/canvasStore\.updateNodeDataForTab\(requestTabId, targetNodeId,/g)?.length, 6)
})

test('LLM 请求从开始到结束都登记为进行中', () => {
  const body = extractFunction(source, 'handleLLMGenerate')
  assert.match(body, /releaseLlmRequest = trackTextNodeLlmRequest\(targetNodeId\)/)
  assert.match(body, /finally \{\s*releaseLlmRequest\?\.\(\)\s*\}\s*\}$/)
})

test('节点挂载时把已失效的请求转为可重试的错误', () => {
  const mounted = source.slice(source.indexOf('onMounted(() => {'), source.indexOf('onUnmounted('))
  assert.match(mounted, /isOrphanedTextNodeLlmRequest\(props\.id, props\.data\)/)
  assert.match(mounted, /status: 'error'/)
  assert.match(mounted, /TEXT_NODE_LLM_INTERRUPTED_ERROR/)
})
