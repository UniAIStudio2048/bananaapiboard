import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PREVIEW_CLASS = 'community-workflow-preview-flow'

const modalSource = readFileSync(
  join(__dirname, '../../components/community/WorkflowPreviewModal.vue'),
  'utf8'
)
const pageSource = readFileSync(
  join(__dirname, '../../views/CommunityWorkflow.vue'),
  'utf8'
)
const cssSource = readFileSync(
  join(__dirname, '../../styles/canvas.css'),
  'utf8'
)

// 1) 弹窗与页面的预览 VueFlow（或外层容器）必须挂上专用 class
assert.match(
  modalSource,
  new RegExp(`class="[^"]*\\b${PREVIEW_CLASS}\\b[^"]*"`),
  `WorkflowPreviewModal.vue 的预览 VueFlow 或外层容器必须包含 ${PREVIEW_CLASS} class，便于覆盖 group 层级`
)

assert.match(
  pageSource,
  new RegExp(`class="[^"]*\\b${PREVIEW_CLASS}\\b[^"]*"`),
  `CommunityWorkflow.vue 的预览 VueFlow 或外层容器必须包含 ${PREVIEW_CLASS} class，便于覆盖 group 层级`
)

// 2) 正式画布的 group 负层级规则不能被破坏
assert.match(
  cssSource,
  /\.vue-flow__node\[data-type="group"\][\s\S]*?\.vue-flow__node\.vue-flow__node-group\s*\{[\s\S]*?z-index:\s*-1000\s*!important/,
  'canvas.css 必须保留普通画布 group 节点 z-index: -1000 !important 的全局规则'
)

// 3) 针对预览专用 class 必须覆盖 group 节点 + .group-node 为可见层级，
//    且普通非 group 节点仍高于 group
const previewGroupOverride = new RegExp(
  `\\.${PREVIEW_CLASS}[\\s\\S]{0,400}?\\.vue-flow__node[\\s\\S]{0,200}?z-index:\\s*0\\s*!important`
)
assert.match(
  cssSource,
  previewGroupOverride,
  `canvas.css 必须在 .${PREVIEW_CLASS} 作用域下把 group 节点 z-index 覆盖为 0 !important`
)

const previewGroupNodeOverride = new RegExp(
  `\\.${PREVIEW_CLASS}[\\s\\S]{0,400}?\\.group-node[\\s\\S]{0,200}?z-index:\\s*0\\s*!important`
)
assert.match(
  cssSource,
  previewGroupNodeOverride,
  `canvas.css 必须在 .${PREVIEW_CLASS} 作用域下把 .group-node 自身 z-index 覆盖为 0 !important`
)

const previewNonGroupOverride = new RegExp(
  `\\.${PREVIEW_CLASS}[\\s\\S]{0,400}?\\.vue-flow__node:not\\(\\[data-type="group"\\]\\):not\\(\\.vue-flow__node-group\\)[\\s\\S]{0,200}?z-index:\\s*1\\s*!important`
)
assert.match(
  cssSource,
  previewNonGroupOverride,
  `canvas.css 必须在 .${PREVIEW_CLASS} 作用域下保证非 group 节点 z-index: 1 !important（高于 group）`
)

console.log('Community workflow preview group visibility tests passed')
