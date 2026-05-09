import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

assert.match(source, /import\s+VideoToolModal\s+from\s+['"]@\/components\/canvas\/VideoToolModal\.vue['"]/, 'VideoNode should import VideoToolModal')
assert.match(source, /<VideoToolModal\b/, 'VideoNode should render VideoToolModal')
assert.match(source, /initialMode:\s*'edit'/, 'VideoNode should open video tool modal in edit mode')
assert.match(source, /initialMode:\s*'subtitle'/, 'VideoNode should open video tool modal in subtitle erase mode')

for (const label of ['剪辑', '字幕擦除']) {
  assert.match(source, new RegExp(`title="${label}"|title='${label}'|title:\\s*'${label}'`), `VideoNode should expose ${label} as an action title`)
  assert.match(source, new RegExp(label), `VideoNode should render ${label}`)
}

assert.match(source, /@completed="handleVideoToolCompleted"|@completed='handleVideoToolCompleted'/, 'VideoNode should handle video tool completion')
assert.match(source, /function\s+handleVideoToolCompleted/, 'VideoNode should define completion handler')
assert.match(source, /canvasStore\.addNode\(\{[\s\S]*type:\s*'video'[\s\S]*output:\s*\{[\s\S]*type:\s*'video'[\s\S]*url/s, 'VideoNode should add a video output node with output url')
assert.match(source, /canvasStore\.addEdge\(\{[\s\S]*source:\s*props\.id[\s\S]*target:\s*newNodeId/s, 'VideoNode should connect the source video node to the result node')
assert.match(source, /canvas-history-invalidate/, 'VideoNode should invalidate canvas history after creating a result node')
