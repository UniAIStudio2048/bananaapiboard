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
  /import\s+\{\s*toSameOriginUrl,\s*getOriginalImageUrl,\s*getVideoPosterUrl\s*\}\s+from\s+'@\/utils\/canvasThumbnail'/,
  'HistoryPanel should import the shared cloud video poster helper'
)

assert.match(
  source,
  /const\s+generatedPosterUrl\s*=\s*getVideoPosterUrl\(toSameOriginUrl\(item\.url\),\s*400\)[\s\S]*if\s*\(\s*generatedPosterUrl\s*&&\s*!videoPosterLoadErrors\.value\[item\.id\]\s*\)\s*return\s+generatedPosterUrl/,
  'getVideoThumbnail should generate an image poster URL before falling back to an iPad-unfriendly metadata video preview'
)

assert.match(
  source,
  /import\s+\{\s*extractVideoFrame\s*\}\s+from\s+'@\/api\/canvas\/workflow'/,
  'HistoryPanel should use the server-side frame extractor when browser video previews cannot render a cover'
)

assert.match(
  source,
  /function\s+requestServerVideoThumbnail\(item\)[\s\S]*extractVideoFrame\(\{\s*videoUrl:\s*item\.url,\s*time:\s*0\.3,\s*nodeId:\s*`history-\$\{item\.id\}`\s*\}\)/,
  'HistoryPanel should request a server-generated thumbnail for video history items without a usable poster'
)

assert.match(
  source,
  /requestServerVideoThumbnail\(item\)[\s\S]*\/\/ 只有在可见区域内才触发提取/,
  'getVideoThumbnail should start server thumbnail extraction before falling back to browser-side extraction'
)

assert.match(
  source,
  /<CachedImage[\s\S]*v-if="getVideoThumbnail\(item\)"[\s\S]*@error="handleVideoPosterError\(item\)"/,
  'Video poster CachedImage should mark failed poster URLs so the video fallback can render'
)

assert.match(
  source,
  /if\s*\(\s*type\s*===\s*'video'\s*&&\s*match\[1\]\.toLowerCase\(\)\s*===\s*'bin'\s*\)\s*return\s+'\.mp4'/,
  'HistoryPanel should download legacy subtitle erase .bin video records as .mp4'
)
