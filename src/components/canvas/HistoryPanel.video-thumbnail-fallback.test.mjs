import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, 'HistoryPanel.vue'), 'utf8')

assert.match(
  source,
  /const\s+videoPosterLoadErrors\s*=\s*ref\(\{\}\)/,
  'HistoryPanel should track failed video poster URLs separately from frame extraction failures'
)

assert.match(
  source,
  /if\s*\(\s*item\.thumbnail_url\s*&&\s*!videoPosterLoadErrors\.value\[item\.id\]\s*\)\s*return\s+getMediaUrl\(item\.thumbnail_url\)/,
  'getVideoThumbnail should stop returning a video thumbnail_url after that poster image fails'
)

assert.match(
  source,
  /<CachedImage[\s\S]*v-if="getVideoThumbnail\(item\)"[\s\S]*@error="handleVideoPosterError\(item\)"/,
  'Video poster CachedImage should mark failed poster URLs so the video fallback can render'
)
