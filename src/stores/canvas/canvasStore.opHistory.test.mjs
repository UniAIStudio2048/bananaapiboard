/**
 * canvasStore × opHistory 集成契约测试
 * node bananaapiboard/src/stores/canvas/canvasStore.opHistory.test.mjs
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const storeSrc = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

assert.match(storeSrc, /import\s*\{\s*createOpHistory\s*\}\s*from\s*['"]\.\/opHistory['"]/, 'canvasStore 必须导入 createOpHistory')
assert.match(storeSrc, /const\s+opHistory\s*=\s*createOpHistory/, 'canvasStore 必须实例化 opHistory')
assert.match(storeSrc, /opHistory\.record\(/, 'saveHistory 必须调用 opHistory.record')
assert.match(storeSrc, /opHistory\.undo\(/, 'undo 必须委托给 opHistory')
assert.match(storeSrc, /opHistory\.redo\(/, 'redo 必须委托给 opHistory')
assert.match(storeSrc, /opHistory\.clear\(\)/, 'clearHistory 必须调用 opHistory.clear')
assert.match(storeSrc, /opHistory\.trim\(/, 'trimHistory 必须调用 opHistory.trim')

// canUndo 必须是 >= 0（op-based 语义）
assert.match(
  storeSrc,
  /canUndo\s*=\s*computed\(\(\)\s*=>\s*historyIndex\.value\s*>=\s*0\)/,
  'canUndo 必须使用 op-based 语义（historyIndex >= 0）'
)

// 旧的全量快照入栈逻辑必须被移除
assert.equal(
  /historyStack\.value\.push\(state\)/.test(storeSrc),
  false,
  '不允许再向 historyStack 直接 push 全量 state'
)

// syncHistoryRefs 必须存在且被 record/undo/redo/clear/trim 后调用
assert.match(storeSrc, /function\s+syncHistoryRefs/, '必须定义 syncHistoryRefs 同步函数')
const syncCalls = storeSrc.match(/syncHistoryRefs\(\)/g) || []
assert.ok(syncCalls.length >= 4, 'syncHistoryRefs 至少在 saveHistory/undo/redo/clear/trim 五处调用一处')

console.log('canvasStore op-history integration contract tests passed')
