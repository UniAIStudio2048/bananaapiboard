import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasThumbnail.js'), 'utf8')

// COS CDN 图片现在走数据万象缩略图（受 VITE_COS_THUMBNAIL_ENABLED 控制，默认开启），
// 失败时通过 onCanvasImageError 回退原图，确保画布节点不会因缩略图失败而空白。
assert.match(
  source,
  /COS_THUMBNAIL_ENABLED/,
  'COS thumbnail behavior should be gated by VITE_COS_THUMBNAIL_ENABLED env switch for emergency rollback'
)

assert.match(
  source,
  /if\s*\(isCosCdn\(url\)\s*&&\s*!isVideoUrl\(url\)\)\s*\{\s*if\s*\(!COS_THUMBNAIL_ENABLED\)\s*return url/s,
  'COS CDN image branch should honor the env switch and fall through to imageMogr2 thumbnail'
)

assert.match(
  source,
  /imageMogr2\/thumbnail\/\$\{width\}x/,
  'COS thumbnail must use imageMogr2 the same way backend cos-storage.js does'
)

assert.match(
  source,
  /export function onCanvasImageError/,
  'Canvas <img> must have a fallback handler that retries with the original URL on thumbnail load failure'
)

console.log('Canvas COS preview tests passed')
