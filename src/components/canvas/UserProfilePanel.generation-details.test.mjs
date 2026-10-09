import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import * as Vue from 'vue'
import * as ledger from '../../utils/pointsLedger.js'

const source = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { bindings } = compileScript(descriptor, { id: 'ledger-generation-test' })
const template = baseParse(descriptor.template.content)

function find(node, match) {
  if (node.type === 1 && match(node)) return node
  for (const child of node.children || []) {
    const found = find(child, match)
    if (found) return found
  }
}

function text(vnode) {
  if (typeof vnode === 'string') return vnode
  if (Array.isArray(vnode)) return vnode.map(text).join('')
  if (!vnode || vnode.type === Vue.Comment) return ''
  return text(vnode.children)
}

function renderCell(item) {
  const node = find(template, node => node.props.some(prop => prop.name === 'data-label' && prop.value?.content === '详细说明'))
  const { code } = compile(node.loc.source, { mode: 'function', prefixIdentifiers: true, bindingMetadata: bindings })
  const render = new Function('Vue', code)(Vue)
  return text(render({ item }, [], {}, { getPointsLedgerGenerationDetailsText: ledger.getPointsLedgerGenerationDetailsText }))
}

test('actual canvas details cell renders image resolution and aspect ratio beside the memo and task', () => {
  const rendered = renderCell({ memo: '生成图片', task_id: 'image-1', generation_details: { kind: 'image', resolution: '2K', aspect_ratio: '3:2' } })
  assert.ok(rendered.includes('分辨率：2K'))
  assert.ok(rendered.includes('尺寸比例：3:2'))
  assert.ok(rendered.includes('生成图片'))
  assert.ok(rendered.includes('image-1'))
})

test('actual canvas details cell renders selected video mode and does not add it to audio', () => {
  const rendered = renderCell({ memo: '视频生成', generation_details: { kind: 'video', resolution: '1080p', aspect_ratio: '9:16', mode: 'image2video_first_last', quality: 'pro' } })
  for (const expected of ['分辨率：1080p', '尺寸比例：9:16', '视频模式：首尾帧 / 专业模式']) assert.ok(rendered.includes(expected))
  assert.equal(renderCell({ memo: '音频生成' }), '音频生成')
})

test('historical image and video records visibly mark missing parameters even without extra API fields', () => {
  assert.ok(renderCell({ type: 'generate_cost_permanent', memo: '旧图片' }).includes('分辨率：未记录 · 尺寸比例：未记录'))
  assert.ok(renderCell({ type: 'video_generation', memo: '旧视频' }).includes('视频模式：未记录'))
})

test('canvas ledger preview also renders generation parameters', () => {
  const preview = find(template, node => node.tag === 'span' && node.loc.source.includes('getPointsLedgerGenerationDetailsText'))
  assert.ok(preview, 'sidebar preview should show the same parameters')
})
