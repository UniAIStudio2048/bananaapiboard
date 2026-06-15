import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

test('text node renders mixed reference media from one ordered list above the prompt input', () => {
  const referenceSectionIndex = source.indexOf('class="reference-section"')
  const inputAreaIndex = source.indexOf('class="llm-input-area nodrag"')

  assert.ok(referenceSectionIndex !== -1, 'TextNode should render a reference section')
  assert.ok(inputAreaIndex !== -1, 'TextNode should render the LLM input area')
  assert.ok(
    referenceSectionIndex < inputAreaIndex,
    'reference thumbnails should render above the prompt input area'
  )

  assert.match(
    source,
    /v-for="\(\s*media,\s*idx\s*\)\s+in\s+referenceMediaList"/,
    'reference thumbnails should use the ordered mixed media list'
  )
  assert.doesNotMatch(
    source,
    /v-for="\(\s*videoUrl,\s*idx\s*\)\s+in\s+upstreamVideoUrls"/,
    'video thumbnails should not be rendered in a separate grouped loop'
  )
  assert.doesNotMatch(
    source,
    /v-for="\(\s*img,\s*idx\s*\)\s+in\s+upstreamImageUrls"/,
    'image thumbnails should not be rendered in a separate grouped loop'
  )
  assert.doesNotMatch(
    source,
    /v-for="\(\s*audioUrl,\s*idx\s*\)\s+in\s+upstreamAudioUrls"/,
    'audio thumbnails should not be rendered in a separate grouped loop'
  )
})

test('text node video reference thumbnails use the same poster fallback as image node', () => {
  assert.match(
    source,
    /getVideoPosterUrl/,
    'TextNode should import/use getVideoPosterUrl for video thumbnails'
  )
  assert.match(
    source,
    /toSameOriginUrl/,
    'TextNode should normalize video preview URLs through toSameOriginUrl'
  )
  assert.match(
    source,
    /shouldShowReferenceVideoImage\([^)]*\)/,
    'TextNode should prefer image poster/thumbnail previews before falling back to video'
  )
})

test('text node hover preview plays the normalized upstream video URL', () => {
  assert.match(
    source,
    /function\s+handleReferenceMediaHover\(media,\s*event\)\s*\{[\s\S]*?media\?\.type\s*===\s*['"]video['"][\s\S]*?onVideoHoverStart\(toSameOriginUrl\(media\.url\),\s*event\)/,
    'thumbnail hover should play the normalized video URL, not the poster or raw cross-origin URL'
  )
})

test('text node reference thumbnails can remove upstream media inputs like image node', () => {
  assert.match(
    source,
    /function\s+removeReferenceMedia\(media\)\s*\{/,
    'TextNode should provide a media removal handler'
  )
  assert.match(
    source,
    /class="reference-media-remove"[\s\S]*?@click\.stop="removeReferenceMedia\(media\)"/,
    'each reference thumbnail should expose a top-right remove button'
  )
  assert.match(
    source,
    /canvasStore\.removeEdge\(edgeId\)/,
    'removing a reference should disconnect the upstream edge instead of deleting the source node'
  )
})

test('text node shows an empty reference thumbnail placeholder when there is no upstream media', () => {
  assert.doesNotMatch(
    source,
    /<div\s+v-if="inheritedImages\.length\s*>\s*0"\s+class="reference-section"/,
    'reference section should remain visible even when no reference media exists'
  )
  assert.match(
    source,
    /v-if="referenceMediaList\.length\s*===\s*0"[\s\S]*class="reference-empty-item"/,
    'TextNode should render an empty thumbnail placeholder when the reference list is empty'
  )
  assert.match(
    source,
    /class="reference-empty-icon"[\s\S]*\+/,
    'empty thumbnail placeholder should visually match the image node add tile'
  )
})
