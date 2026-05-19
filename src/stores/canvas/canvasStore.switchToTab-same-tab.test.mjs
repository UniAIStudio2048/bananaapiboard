import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

// 修复后：switchToTab 在切换到同一个 tab 时，必须跳过把当前画布写回 currentTab 的步骤，
// 否则 openWorkflowInNewTab 重新加载已绑定 tab 的工作流时会丢失刚刚写入的 freshNodes。
assert.match(
  source,
  /function switchToTab\(tabId\) \{[\s\S]*?if \(activeTabId\.value !== tabId\) \{[\s\S]*?currentTab\.nodes = cloneNodeDataValue\(nodes\.value\)/,
  'switchToTab should only persist current canvas back to the previous tab when switching tabs (not when re-syncing the same tab)'
)

// 验证仍然会同步 targetTab 的数据到画布（保证 freshNodes 生效）
assert.match(
  source,
  /function switchToTab\(tabId\) \{[\s\S]*?nodes\.value = cloneNodeDataValue\(targetTab\.nodes\) \|\| \[\][\s\S]*?\n  \}/,
  'switchToTab should always sync targetTab data to canvas, even when target equals current'
)

// 在 openWorkflowInNewTab 中，仍然先更新 existingTab 再调用 switchToTab
assert.match(
  source,
  /function openWorkflowInNewTab\(workflow\) \{[\s\S]*?existingTab\.nodes = freshNodes[\s\S]*?switchToTab\(existingTab\.id\)/,
  'openWorkflowInNewTab should still update existingTab.nodes before switchToTab so the same-tab path picks up freshNodes'
)

console.log('canvasStore switchToTab same-tab tests passed')
