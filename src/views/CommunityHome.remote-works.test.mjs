import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./CommunityHome.vue', import.meta.url), 'utf8')

assert.match(
  source,
  /const works = res\.data\?\.works \|\| res\.works \|\| \[\]\s+landscapeWorks\.value = works/,
  'a successful landscape response must render its real works, including an empty list'
)

assert.doesNotMatch(
  source,
  /if \(reset && works\.length === 0\) \{\s+mixedWorks\.value = generateMockWorks/,
  'a successful empty mixed-work response must not be replaced with demo works'
)

assert.match(
  source,
  /catch \(e\) \{\s+console\.error\('\[CommunityHome\] 加载横屏作品失败:', e\)\s+landscapeWorks\.value = generateMockWorks/,
  'the existing fallback remains limited to a failed request'
)

console.log('CommunityHome remote works source tests passed')
