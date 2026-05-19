import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AdminBoard.vue', import.meta.url), 'utf8')

assert.doesNotMatch(
  source,
  /网站备案设置|settings\.icp_config|icp_config/,
  'board admin should no longer expose or save ICP settings'
)

assert.match(
  source,
  /voucher_external_link:\s*settings\.value\.voucher_external_link/,
  'board admin should still save voucher settings'
)

console.log('AdminBoard ICP removal source tests passed')
