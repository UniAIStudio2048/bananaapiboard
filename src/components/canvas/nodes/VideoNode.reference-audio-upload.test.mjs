import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

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

assert.match(
  source,
  /async function uploadAudioFileAsync\(file, blobUrl, nodeId\) \{[\s\S]*?uploadCanvasMedia\(file, 'audio'\)[\s\S]*?uploadManager\.registerFailedUpload/,
  'Video node should upload added reference audio through the canvas media uploader and register failed uploads'
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
