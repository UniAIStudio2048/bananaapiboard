import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./canvas.css', import.meta.url), 'utf8')

test('配置面板所在节点必须覆盖其他重叠节点以接收缩略图点击', () => {
  assert.match(
    source,
    /\.canvas-board\s+\.vue-flow__node:not\(\[data-type="group"\]\):has\(\.config-panel\)\s*\{[\s\S]*?z-index:\s*1000\s*!important/
  )
})
