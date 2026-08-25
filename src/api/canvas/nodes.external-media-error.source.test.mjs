import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const nodesSource = await readFile(new URL('./nodes.js', import.meta.url), 'utf8')
const videoNodeSource = await readFile(new URL('../../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')

test('canvas task queries localize backend external media errors before task normalization', () => {
  assert.match(nodesSource, /import \{ localizeExternalMediaErrorPayload \} from '@\/utils\/externalMediaError'/)
  assert.match(nodesSource, /return localizeExternalMediaErrorPayload\(data\)/)
})

test('canvas video submission displays the localized backend error contract', () => {
  assert.match(videoNodeSource, /resolveExternalMediaErrorMessage\(data, '生成失败'\)/)
})
