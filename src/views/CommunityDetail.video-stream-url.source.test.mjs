import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./CommunityDetail.vue', import.meta.url), 'utf8')

test('community detail full video playback uses the resolved media URL instead of the header-only stream endpoint', () => {
  assert.match(
    source,
    /const videoStreamUrl = computed\(\(\) => \{[\s\S]*return work\.value\?\.media_url \|\| ''[\s\S]*\}\)/,
    'full video playback should use work.media_url because native <video> requests cannot send tenant headers'
  )

  assert.doesNotMatch(
    source,
    /return `\/api\/community\/works\/\$\{work\.value\.id\}\/stream`/,
    'full video playback must not use the stream endpoint without tenant headers'
  )
})
