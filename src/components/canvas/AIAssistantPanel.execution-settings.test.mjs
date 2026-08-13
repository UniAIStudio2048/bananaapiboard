/**
 * AI 灵感助手「齿轮（执行设置）弹层」关闭行为回归测试（bugfix）。
 *
 * 缺陷：点击右下角齿轮展开执行设置弹层（showExecutionSettings）后，
 * 再点击输入框等弹层外部区域，弹层不会自动关闭——因为 handleClickOutside
 * 只处理了附件（attach-selector）、斜杠菜单（slash-menu）、Skill 模式
 * （skill-execution-selector），遗漏了 execution-settings。
 *
 * 期望：handleClickOutside 必须包含 showExecutionSettings 的关闭分支，
 * 且以 `.execution-settings` 为容器边界（点击弹层/齿轮内部不关闭，
 * 点击输入框等外部区域关闭）。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.execution-settings.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('handleClickOutside 必须关闭齿轮（执行设置）弹层', () => {
  const block = panel.match(/function handleClickOutside\(event\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'handleClickOutside 必须存在')
  // 齿轮弹层展开时，点击弹层外部（含输入框）应自动关闭
  assert.match(
    block,
    /showExecutionSettings\.value\s*&&\s*!event\.target\.closest\('\.execution-settings'\)/,
    '应包含 showExecutionSettings 的外部点击关闭分支，容器边界为 .execution-settings'
  )
  assert.match(block, /showExecutionSettings\.value\s*=\s*false/, '外部点击时应将 showExecutionSettings 置为 false')
})
