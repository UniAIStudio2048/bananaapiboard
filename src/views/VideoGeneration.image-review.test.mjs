import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoGeneration.vue'), 'utf8')

assert.match(
  source,
  /createQuickSeedanceCharacterAsset[\s\S]*pollAssetStatus/,
  'beginner video generation should reuse the canvas quick-review asset API'
)

assert.match(
  source,
  /\/api\/videos\/review-channel/,
  'beginner video generation should request a server-authorized review channel before reviewing images'
)

assert.match(
  source,
  /async function handleQuickImageReview\([\s\S]*?createQuickSeedanceCharacterAsset\([\s\S]*?pollAssetStatus\(/,
  'one-click review should submit uploaded images and poll the corresponding asset channel'
)

assert.match(
  source,
  /formData\.append\('review_channel_id', reviewSubmission\.channelId\)/,
  'reviewed image generation should lock the reviewed video channel'
)

assert.match(
  source,
  /formData\.append\('image_urls', JSON\.stringify\(reviewSubmission\.assetUris\)\)/,
  'reviewed generic image inputs should be submitted as provider asset references instead of raw files'
)

assert.match(
  source,
  /一键过审/,
  'the beginner image upload UI should expose one-click review'
)

console.log('VideoGeneration image review source tests passed')
