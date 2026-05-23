import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const imageSource = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const videoSource = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

function getDownloadButton(source, nodeName) {
  const match = source.match(/<button\b(?=[^>]*title="下载")[^>]*>/)
  assert.ok(match, `${nodeName} should render a toolbar download button`)
  return match[0]
}

test('image and video toolbar downloads are triggered by click events', () => {
  for (const [nodeName, source] of [
    ['ImageNode', imageSource],
    ['VideoNode', videoSource]
  ]) {
    const button = getDownloadButton(source, nodeName)

    assert.match(
      button,
      /@click\.stop\.prevent="handleToolbarDownload"/,
      `${nodeName} download should run from the click event so browser download activation is preserved`
    )
    assert.doesNotMatch(
      button,
      /@mousedown\.stop\.prevent="handleToolbarDownload"/,
      `${nodeName} download should not rely on mousedown for browser download activation`
    )
  }
})
