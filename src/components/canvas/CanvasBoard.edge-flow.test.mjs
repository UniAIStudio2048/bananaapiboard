import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

test('unrelated canvas edges have no flowing glow layer', () => {
  assert.doesNotMatch(source, /canvasEdgeFlowPaths/)
  assert.doesNotMatch(source, /function readCanvasEdgePaths\(/)
  assert.doesNotMatch(source, /[."\s]canvas-edge-flow/)
})

test('edges linked to the selected node flow as a tadpole with the brightest head', () => {
  const template = source.match(/<svg class="active-edge-flow[\s\S]*?<\/svg>/)
  assert.ok(template, 'active edge flow layer should exist')
  const layer = template[0]
  assert.match(layer, /v-for="\(edgePath, ei\) in activeFlowPaths"/)
  assert.match(layer, /class="active-edge-flow-base"/)
  assert.match(layer, /pathLength="300"/)
  assert.match(layer, /v-for="\(stroke, si\) in activeEdgeFlowStrokes"/)
  assert.match(layer, /animationDelay: stroke\.delay/)

  const strokes = source.match(/const activeEdgeFlowStrokes = \[([\s\S]*?)\]\.map/)
  assert.ok(strokes, 'tadpole strokes should be declared')
  const widths = [...strokes[1].matchAll(/width: ([\d.]+)/g)].map(m => Number(m[1]))
  const opacities = [...strokes[1].matchAll(/opacity: ([\d.]+)/g)].map(m => Number(m[1]))
  assert.ok(widths.length >= 4, 'tadpole should be built from several layers')
  assert.ok(Math.max(...widths) <= 3, 'head should stay small (no wide halo)')
  assert.deepEqual([...widths].sort((a, b) => a - b), widths, 'layers widen toward the head')
  assert.deepEqual([...opacities].sort((a, b) => a - b), opacities, 'layers brighten toward the head')

  const pathRule = source.match(/\.active-edge-flow-glow path\s*\{[\s\S]*?\n\}/)
  assert.ok(pathRule, 'flow strokes should be animated per path')
  assert.match(pathRule[0], /animation:\s*activeEdgeFlowTravel 3s linear infinite/)
  assert.match(source, /@keyframes activeEdgeFlowTravel\s*\{\s*from \{ stroke-dashoffset: 0; \}\s*to \{ stroke-dashoffset: -300; \}/)
})

test('original strokes of flowing edges are hidden so they do not cover the glow', () => {
  assert.match(source, /const activeFlowEdgeIds = ref\(\[\]\)/)
  assert.match(source, /const activeFlowEdgeHideCss = computed\(/)
  assert.match(source, /<component :is="'style'" v-if="activeFlowEdgeHideCss">/)
})
