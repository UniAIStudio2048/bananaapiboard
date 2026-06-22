import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readVideoNode() {
  return readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')
}

test('video node has an Omni-only detector that matches omni model names conservatively', () => {
  const source = readVideoNode()

  assert.match(source, /function isOmniVideoModelName\(value\)/)
  assert.match(source, /normalized === 'omni_flash-10s'/)
  assert.match(source, /normalized\.startsWith\('omni_'\)/)
  assert.match(source, /const isOmniVideoModel = computed/)
})

test('video node submits Omni image and video references through omni_references with a 7 item cap', () => {
  const source = readVideoNode()
  const collectorStart = source.indexOf('function buildOmniReferenceUrls')
  assert.ok(collectorStart >= 0, 'Omni reference collector should exist')
  const collector = source.slice(collectorStart, collectorStart + 1200)

  assert.match(collector, /referenceImages\.value/)
  assert.match(collector, /referenceVideos\.value/)
  assert.match(collector, /\.slice\(0,\s*OMNI_MAX_REFERENCES\)/)

  const submitStart = source.indexOf('if (capturedState.isOmniVideoModel)')
  assert.ok(submitStart >= 0, 'Omni submit branch should exist')
  const submitBranch = source.slice(submitStart, submitStart + 900)

  assert.match(submitBranch, /capturedState\.omniReferences/)
  assert.match(submitBranch, /formData\.append\('omni_references',\s*referenceUrl\)/)
})

test('video node uploads blob video references for Omni as well as Seedance', () => {
  const source = readVideoNode()
  const uploadStart = source.indexOf('async function ensureReferenceVideoUrlsAccessible')
  assert.ok(uploadStart >= 0, 'shared reference video accessibility helper should exist')
  const helper = source.slice(uploadStart, uploadStart + 2600)

  assert.match(helper, /\/api\/videos\/upload/)
  assert.match(helper, /sourceVideo/)
  assert.match(helper, /output:\s*\{ \.\.\.sn\.data\.output,\s*url:\s*uploadResult\.url \}/)

  const processStart = source.indexOf('const shouldPrepareReferenceVideos')
  assert.ok(processStart >= 0, 'background generation should opt Omni into reference video preparation')
  const processBranch = source.slice(processStart, processStart + 500)
  assert.match(processBranch, /capturedState\.isSeedance2/)
  assert.match(processBranch, /capturedState\.isOmniVideoModel/)
})
