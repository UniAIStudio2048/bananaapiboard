import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoGeneration.vue'), 'utf8')

assert.match(
  source,
  /import \{ useTeamStore \} from '@\/stores\/team'/,
  'VideoGeneration should import the team store'
)

assert.match(
  source,
  /import \{[\s\S]*appendSpaceParamsToFormData[\s\S]*buildSpaceHistoryUrl[\s\S]*getCurrentBeginnerSpaceParams[\s\S]*\} from '@\/utils\/beginnerSpaceParams'/,
  'VideoGeneration should import beginner space helper functions'
)

assert.match(
  source,
  /const teamStore = useTeamStore\(\)/,
  'VideoGeneration should create a team store instance'
)

assert.match(
  source,
  /async function initializeBeginnerSpace\(\)[\s\S]*teamStore\.setCurrentUserId\(me\.value\.id\)[\s\S]*await teamStore\.restoreSpaceState\(\)/,
  'VideoGeneration should restore remembered personal/team space after loading the user'
)

assert.match(
  source,
  /function getBeginnerSpaceParams\(\)[\s\S]*return getCurrentBeginnerSpaceParams\(teamStore\)/,
  'VideoGeneration should derive current space params through the shared helper'
)

assert.match(
  source,
  /appendSpaceParamsToFormData\(formData, getBeginnerSpaceParams\(\)\)/,
  'Video generation FormData should include current space params'
)

assert.match(
  source,
  /const historyUrl = buildSpaceHistoryUrl\('\/api\/videos\/history', \{[\s\S]*limit: VIDEO_PAGE_SIZE,[\s\S]*offset: videoHistoryOffset\.value,[\s\S]*\.\.\.getBeginnerSpaceParams\(\)[\s\S]*\}\)/,
  'Video history loading should include current space params'
)

assert.match(
  source,
  /async function handleBeginnerSpaceSwitched\(\)[\s\S]*gallery\.value = \[\][\s\S]*history\.value = \[\][\s\S]*await loadHistory\(true\)/,
  'VideoGeneration should clear scoped gallery/history and reload when space changes'
)

assert.match(
  source,
  /window\.addEventListener\('space-switched', handleBeginnerSpaceSwitched\)/,
  'VideoGeneration should listen for space-switched'
)

assert.match(
  source,
  /window\.removeEventListener\('space-switched', handleBeginnerSpaceSwitched\)/,
  'VideoGeneration should remove the space-switched listener'
)

console.log('VideoGeneration beginner space source tests passed')
