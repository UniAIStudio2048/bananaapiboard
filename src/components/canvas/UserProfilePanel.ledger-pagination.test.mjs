import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'UserProfilePanel.vue'), 'utf8')

assert.ok(!source.includes('.slice(0, 20)'), '积分记录不应在前端硬截断为前 20 条')
assert.match(source, /ledgerPageSizeOptions\s*=\s*\[10,\s*20,\s*50\]/, '积分记录应支持 10/20/50 条每页')
assert.match(source, /\/api\/user\/points\?page=\$\{ledgerPage\.value\}&pageSize=\$\{ledgerPageSize\.value\}/, '积分记录请求应携带 page 和 pageSize')
assert.match(source, /ledger-total/, '积分记录分页应显示总条数')
assert.match(source, /ledger-page-size/, '积分记录应提供每页条数切换控件')
