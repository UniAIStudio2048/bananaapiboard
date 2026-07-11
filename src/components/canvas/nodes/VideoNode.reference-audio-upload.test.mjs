import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

assert.match(
  source,
  /accept="image\/\*,video\/\*,audio\/\*"/,
  'Video node reference add input should allow audio files from the + tile'
)

assert.match(
  source,
  /function createUpstreamAudioNode\(audioUrl, metadata = \{\}\) \{[\s\S]*?type: 'audio-input'[\s\S]*?audioUrl[\s\S]*?output:\s*\{[\s\S]*?type: 'audio'[\s\S]*?url: audioUrl/,
  'Video node should create an upstream audio node when users add reference audio'
)

const uploadAudioSource = extractFunction('uploadAudioFileAsync')
assert.match(uploadAudioSource, /const tabId = canvasStore\.activeTabId/)
assert.match(uploadAudioSource, /uploadCanvasMedia\(file, 'audio', \{ nodeId, tabId \}\)/)
assert.match(uploadAudioSource, /commitMediaUpload\(\{ nodeId, blobUrl, mediaType: 'audio', uploaded: result, tabId \}\)/)
assert.match(
  uploadAudioSource,
  /uploadManager\.registerFailedUpload\([^,]+, \{[\s\S]*?nodeId, tabId, file, type: 'audio'/,
  'Video node should preserve tab identity when registering failed reference audio uploads'
)
assert.ok(
  uploadAudioSource.indexOf("if (error?.name === 'AbortError') return") <
    uploadAudioSource.indexOf('uploadManager.registerFailedUpload'),
  'Intentional reference audio upload aborts must not register a retry'
)

assert.match(
  source,
  /function handleFrameFileChange\([\s\S]*?file\.type\.startsWith\('audio\/'\)[\s\S]*?createUpstreamAudioNode\(blobUrl/,
  'The reference + file picker should route selected audio files into upstream audio nodes'
)

assert.match(
  source,
  /function handleFrameDrop\([\s\S]*?file\.type\.startsWith\('audio\/'\)[\s\S]*?createUpstreamAudioNode\(blobUrl/,
  'Dropping audio files on the reference strip should also create upstream audio nodes'
)

assert.match(
  source,
  /拖拽图片\/视频\/音频到此处/,
  'The reference strip hint should advertise audio support'
)

console.log('VideoNode reference audio upload tests passed')
