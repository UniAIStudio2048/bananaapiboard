/**
 * workflowSerializer 集成契约：autosave 必须走 Worker 序列化
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')
const canvasSrc = readFileSync(join(repoRoot, 'src', 'views', 'Canvas.vue'), 'utf8')
const apiSrc = readFileSync(join(repoRoot, 'src', 'api', 'canvas', 'workflow.js'), 'utf8')
const workerSrc = readFileSync(join(repoRoot, 'src', 'workers', 'workflowSerializer.worker.js'), 'utf8')

// autosave 必须使用 serializeWorkflow + saveWorkflowRaw
assert.match(canvasSrc, /serializeWorkflow/, 'autoSaveWorkflow 必须调用 serializeWorkflow')
assert.match(canvasSrc, /saveWorkflowRaw/, 'autoSaveWorkflow 必须走 saveWorkflowRaw 通道')
assert.match(canvasSrc, /@\/utils\/workflowSerializer/, '必须从 utils/workflowSerializer 引入')

// 旧的"主线程 stringify 预检"必须被移除
assert.equal(
  /JSON\.stringify\(workflowData\.nodes\b/.test(canvasSrc),
  false,
  '不允许在 autosave 主线程直接 JSON.stringify(workflowData.nodes)'
)
assert.equal(
  /JSON\.stringify\(workflowData\.edges\b/.test(canvasSrc),
  false,
  '不允许在 autosave 主线程直接 JSON.stringify(workflowData.edges)'
)

// API 必须新增 saveWorkflowRaw 且要求字符串入参
assert.match(apiSrc, /export\s+async\s+function\s+saveWorkflowRaw\s*\(\s*jsonBody\s*\)/, '必须导出 saveWorkflowRaw')
assert.match(apiSrc, /typeof\s+jsonBody\s*!==\s*['"]string['"]/, 'saveWorkflowRaw 必须校验入参类型')

// Worker 主线程消息协议
assert.match(workerSrc, /addEventListener\(\s*['"]message['"]/, 'worker 必须监听 message')
assert.match(workerSrc, /type\s*!==\s*['"]serialize['"]/, 'worker 必须处理 serialize 类型')
assert.match(workerSrc, /postMessage\(\s*\{\s*id,\s*ok:\s*true,\s*json,\s*size/, 'worker 必须按 {id, ok, json, size} 协议回复')

console.log('workflowSerializer contract tests passed')
