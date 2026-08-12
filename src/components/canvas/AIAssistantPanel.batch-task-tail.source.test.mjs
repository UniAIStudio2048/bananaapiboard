/**
 * AIAssistantPanel image-gen-batch 多任务追尾补拉源码断言测试。
 *
 * 背景：image-gen-batch 并发提交 N 个图片任务后 agent 可能提前结束回合，
 * 前端此前只按单任务 activeTurn.taskId 追尾补拉，批量生图只补回 1 张，
 * 其余图片在历史记录里存在、对话里却丢失（且不实时显示）。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.batch-task-tail.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('activeTurn 定义包含 taskIds 数组字段（批量多任务追尾集合）', () => {
  const block = source.match(/const activeTurn = ref\(\{[\s\S]*?\n\}\)/)?.[0]
  assert.ok(block, 'activeTurn ref must exist')
  assert.match(block, /taskIds: \[\],/)
})

test('resetActiveTurn 清空 taskIds', () => {
  const block = source.match(/function resetActiveTurn\(\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'resetActiveTurn must exist')
  assert.match(block, /taskIds: \[\],/)
})

test('extractTaskIdsFromToolCompletedResult 提取 batch 全部 task_id', () => {
  const block = source.match(/function extractTaskIdsFromToolCompletedResult\(result\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'extractTaskIdsFromToolCompletedResult must exist')
  assert.match(block, /parsed\?\.result\?\.tasks \|\| parsed\?\.tasks/)
  assert.match(block, /tasks\.map\(extractOne\)\.filter\(Boolean\)/)
  assert.match(block, /const single = extractOne\(parsed\?\.result \|\| parsed\)/)
})

test('tool.completed 分支对 image-gen-batch 收集全部 task_id 到 activeTurn.taskIds', () => {
  const block = source.match(/\/\/ 提交成功（tool\.completed 含 task_id）：通知画布创建 processing 节点[\s\S]*?\n        \}\n        if \(event\?\.tool\) \{/)?.[0]
  assert.ok(block, 'tool.completed processing-node block must exist')
  assert.match(block, /event\.tool === 'image-gen-batch'/)
  assert.match(block, /extractTaskIdsFromToolCompletedResult\(event\.result\)/)
  assert.match(block, /activeTurn\.value\.taskIds\.push\(tid\)/)
  assert.match(block, /for \(const tid of batchTaskIds\)/)
})

test('onTaskEvent 收集全部 task_id 到 activeTurn.taskIds（sendEnhancedMessage 主流程）', () => {
  const block = source.match(/onTaskEvent: \(event\) => \{\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'sendEnhancedMessage onTaskEvent must exist')
  assert.match(block, /activeTurn\.value\.taskIds\.push\(event\.task_id\)/)
  assert.match(block, /activeTurn\.value\.taskId = activeTurn\.value\.taskId \|\| event\.task_id/)
  assert.match(block, /applyGeneratedResult/)
})

test('maybeLatePullTaskResult 基于 taskIds 集合追尾补拉全部任务', () => {
  const block = source.match(/function maybeLatePullTaskResult\(assistantMessageIndex\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'maybeLatePullTaskResult must exist')
  assert.match(block, /Array\.isArray\(activeTurn\.value\.taskIds\) \? activeTurn\.value\.taskIds : \[\]/)
  assert.match(block, /pendingTaskIds\.every\(tid => finishedTaskIds\.has\(tid\) \|\| arrivedTaskIds\.has\(tid\)\)/)
  assert.match(block, /finishedTaskIds\.add\(doneTaskId\)/)
  assert.match(block, /applyAgentResultToMessage\(assistantMessageIndex, \{/)
})

test('maybeLatePullTaskResult 不以 hasMediaResult 短路（部分图片已实时到达时仍补拉缺失任务）', () => {
  // 回归：image-gen-batch 前 N 张实时到达后 message.attachments 非空，
  // 若用 hasMediaResult 早退会把缺失任务（回合结束后完成）永远漏掉。
  const block = source.match(/function maybeLatePullTaskResult\(assistantMessageIndex\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'maybeLatePullTaskResult must exist')
  assert.doesNotMatch(block, /hasMediaResult/)
  // 已到达任务（attachments 中的 task_id）从待补拉集合剔除，仅补拉缺失项
  assert.match(block, /message\?\.attachments/)
  assert.match(block, /\.filter\(Boolean\)/)
})

test('onAccepted 新回合重置 taskIds 避免旧回合任务污染追尾', () => {
  const block = source.match(/onAccepted: \(json\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'onAccepted must exist')
  assert.match(block, /taskIds: \[\],/)
})
