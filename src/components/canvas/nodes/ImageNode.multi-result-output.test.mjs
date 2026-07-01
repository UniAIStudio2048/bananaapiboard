import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const canvasSource = readFileSync(new URL('../../../views/Canvas.vue', import.meta.url), 'utf8')

function assertSourceContains(haystack, pattern, message) {
  assert.ok(pattern.test(haystack), message)
}

test('ImageNode renders multi-result image tasks as adjacent sibling nodes', () => {
  assertSourceContains(
    source,
    /const outputUrls = collectImageTaskOutputUrls\(task\.result\)/,
    'ImageNode should normalize all completed image result URLs before updating the canvas node'
  )
  assertSourceContains(
    source,
    /output:\s*\{\s*type:\s*'image',\s*urls:\s*\[outputUrls\[0\]\],\s*url:\s*outputUrls\[0\]\s*\}/,
    'The source task node should display only the first generated image'
  )
  assertSourceContains(
    source,
    /const extraImageUrls = collectExtraImageNodeUrls\(task\.result,\s*outputUrls\)/,
    'ImageNode should derive extra sibling node URLs from direct result.urls and backend group image URLs'
  )
  assertSourceContains(
    source,
    /createGroupImageNodes\(extraImageUrls,\s*task\)/,
    'ImageNode should create separate canvas nodes for additional generated images'
  )
  assertSourceContains(
    source,
    /function checkAndRestoreBackgroundTasks\(\)[\s\S]*?collectExtraImageNodeUrls\(task\.result,\s*outputUrls\)[\s\S]*?createGroupImageNodes\(extraImageUrls,\s*task\)/,
    'ImageNode should also restore completed multi-result tasks as separate sibling nodes after a refresh'
  )
  assertSourceContains(
    source,
    /x:\s*startX \+ i \* \(nodeWidth \+ nodeGap\),\s*y:\s*startY/s,
    'Extra image nodes should be laid out horizontally next to the first image node'
  )
})

test('Canvas task completion keeps the original image node to the first result', () => {
  assertSourceContains(
    canvasSource,
    /const urls = collectImageTaskOutputUrls\(result\)/,
    'Canvas task completion should normalize all returned image URLs'
  )
  assertSourceContains(
    canvasSource,
    /output:\s*\{\s*type:\s*'image',\s*urls:\s*\[urls\[0\]\],\s*url:\s*urls\[0\]\s*\}/,
    'Canvas task completion should not render multiple image results inside one node'
  )
})
