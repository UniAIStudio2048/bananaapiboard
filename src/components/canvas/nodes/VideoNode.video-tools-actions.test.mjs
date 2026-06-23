import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

assert.match(source, /import\s+VideoToolModal\s+from\s+['"]@\/components\/canvas\/VideoToolModal\.vue['"]/, 'VideoNode should import VideoToolModal')
assert.match(source, /import\s+\{[^}]*getSubtitleEraseConfig[^}]*\}\s+from\s+['"]@\/api\/canvas\/video-tools['"]/, 'VideoNode should load subtitle erase config for toolbar availability')
assert.match(source, /<VideoToolModal\b/, 'VideoNode should render VideoToolModal')
assert.match(source, /initialMode:\s*'edit'/, 'VideoNode should open video tool modal in edit mode')
assert.match(source, /initialMode:\s*'subtitle'/, 'VideoNode should open video tool modal in subtitle erase mode')
assert.match(source, /const\s+subtitleEraseToolbarEnabled\s*=\s*ref\(false\)/, 'VideoNode should hide subtitle erase toolbar action until config enables it')
assert.match(source, /subtitleEraseToolbarEnabled\.value\s*=\s*config\?\.enabled\s*===\s*true/, 'VideoNode should show subtitle erase toolbar action only when the master switch is enabled')
assert.match(source, /const\s+showSubtitleEraseToolbarAction\s*=\s*computed\(\(\)\s*=>\s*showToolbar\.value\s*&&\s*subtitleEraseToolbarEnabled\.value\)/, 'VideoNode should bind subtitle erase button visibility to the master switch')
assert.match(source, /mode\s*===\s*VIDEO_TOOL_MODAL_MODES\.subtitle\.initialMode[\s\S]*!subtitleEraseToolbarEnabled\.value[\s\S]*return/, 'VideoNode should block direct subtitle erase modal opening when the master switch is disabled')

for (const label of ['剪辑', '字幕擦除']) {
  assert.match(source, new RegExp(`title="${label}"|title='${label}'|title:\\s*'${label}'`), `VideoNode should expose ${label} as an action title`)
  assert.match(source, new RegExp(label), `VideoNode should render ${label}`)
}

const toolbarBlock = source.match(/<div v-show="showToolbar" class="video-toolbar">[\s\S]*?<\/div>\s*\n\s*<!-- 节点标签 -->/)
assert.ok(toolbarBlock, 'VideoNode should keep video actions inside the node toolbar block')
assert.match(toolbarBlock[0], /title="剪辑"|title='剪辑'/, 'VideoNode should expose edit action in the node toolbar')
assert.match(toolbarBlock[0], /title="字幕擦除"|title='字幕擦除'/, 'VideoNode should expose subtitle erase action in the node toolbar')
assert.match(toolbarBlock[0], /<button\s+v-if=["']showSubtitleEraseToolbarAction["'][\s\S]*title=["']字幕擦除["']/, 'VideoNode should hide the subtitle erase toolbar button when the master switch is disabled')
assert.doesNotMatch(source, /class="video-tool-actions"/, 'VideoNode should not render video tool actions over the video preview')
assert.doesNotMatch(source, /\.video-tool-actions\b/, 'VideoNode should not keep overlay styles for video tool actions')

assert.match(source, /@completed="handleVideoToolCompleted"|@completed='handleVideoToolCompleted'/, 'VideoNode should handle video tool completion')
assert.match(source, /function\s+handleVideoToolCompleted/, 'VideoNode should define completion handler')
assert.match(source, /canvasStore\.addNode\(\{[\s\S]*type:\s*'video'[\s\S]*output:\s*\{[\s\S]*type:\s*'video'[\s\S]*url/s, 'VideoNode should add a video output node with output url')
assert.match(source, /canvasStore\.addEdge\(\{[\s\S]*source:\s*props\.id[\s\S]*target:\s*newNodeId/s, 'VideoNode should connect the source video node to the result node')
assert.match(source, /canvas-history-invalidate/, 'VideoNode should invalidate canvas history after creating a result node')

const pollAttemptsMatch = source.match(/const\s+SUBTITLE_ERASE_POLL_ATTEMPTS\s*=\s*(\d+)/)
const pollIntervalMatch = source.match(/const\s+SUBTITLE_ERASE_POLL_INTERVAL_MS\s*=\s*(\d+)/)
assert.ok(pollAttemptsMatch, 'VideoNode should define subtitle erase poll attempts as a named constant')
assert.ok(pollIntervalMatch, 'VideoNode should define subtitle erase poll interval as a named constant')
const pollWindowMs = Number(pollAttemptsMatch[1]) * Number(pollIntervalMatch[1])
assert.ok(
  pollWindowMs >= 45 * 60 * 1000,
  `VideoNode subtitle erase polling should cover the backend task window; got ${pollWindowMs}ms`
)
