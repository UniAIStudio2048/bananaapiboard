import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

test('image node renders upstream video references as video thumbnails instead of image thumbnails', () => {
  assert.match(
    source,
    /const\s+VIDEO_NODE_TYPES\s*=\s*\[/,
    'ImageNode should classify upstream video node types separately'
  )

  assert.match(
    source,
    /const\s+referenceVideos\s*=\s*computed\(\(\)\s*=>/,
    'ImageNode should collect upstream video URLs separately from referenceImages'
  )

  assert.match(
    source,
    /if\s*\(VIDEO_NODE_TYPES\.includes\(node\.type\)\)\s*continue/,
    'referenceImages should skip video nodes so video URLs are not rendered through image thumbnails'
  )

  assert.match(
    source,
    /v-for="\(\s*video,\s*index\s*\)\s+in\s+referenceVideos"[\s\S]*?<video[\s\S]*?:src="toSameOriginUrl\(video\)"/,
    'ImageNode should render video references with a video fallback like VideoNode'
  )
})

test('image node video reference thumbnails use the same square rounded frame as images', () => {
  assert.match(
    source,
    /\.panel-frame-item\s*\{[\s\S]*width:\s*60px;[\s\S]*height:\s*60px;[\s\S]*border-radius:\s*8px;[\s\S]*overflow:\s*hidden;/,
    'reference media frames should be fixed square rounded thumbnails'
  )

  assert.match(
    source,
    /\.panel-frame-video\s+\.video-thumb\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*cover;/,
    'video reference media should fill the square frame with cover cropping'
  )
})

test('image node video reference thumbnails do not show a play icon overlay', () => {
  const match = source.match(/v-for="\(\s*video,\s*index\s*\)\s+in\s+referenceVideos"[\s\S]*?<button class="panel-frame-remove"/)
  assert.ok(match, 'ImageNode should render a video reference thumbnail block')
  assert.doesNotMatch(
    match[0],
    /panel-frame-play-icon/,
    'video references in ImageNode should be plain thumbnails without the blue play triangle overlay'
  )
})
