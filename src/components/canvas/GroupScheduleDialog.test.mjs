import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'GroupScheduleDialog.vue'), 'utf8')
const groupNodeSrc = readFileSync(join(__dirname, 'nodes/GroupNode.vue'), 'utf8')

assert.match(src, /const\s+batchCount\s*=\s*ref\(1\)/, '批次数默认值必须是 1')
assert.match(src, /Math\.min\(100,\s*Math\.max\(1,/, '批次数必须限制在 1-100')
assert.match(src, /defineEmits\(\['close',\s*'submit'\]\)/, '弹窗必须声明 close 和 submit 事件')
assert.match(src, /emit\('submit',\s*\{[\s\S]*scheduledAt[\s\S]*batchCount/s, 'submit 事件必须包含 scheduledAt 和 batchCount')
assert.match(src, /type="datetime-local"/, '弹窗必须提供日期时间选择')
assert.match(src, /type="number"/, '弹窗必须提供批次数输入')

assert.match(groupNodeSrc, /GroupScheduleDialog/, 'GroupNode 必须挂载 GroupScheduleDialog')
assert.match(groupNodeSrc, /createGroupSchedule/, 'GroupNode 必须调用 createGroupSchedule')
assert.match(groupNodeSrc, /getScheduleSnapshot/, 'GroupNode 必须从当前画布创建快照')
assert.match(groupNodeSrc, /定时执行/, 'GroupNode 工具栏必须出现定时执行入口')

console.log('GroupScheduleDialog contract tests passed')
