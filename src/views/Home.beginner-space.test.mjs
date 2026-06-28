import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Home.vue'), 'utf8')

assert.match(
  source,
  /import \{ useTeamStore \} from '@\/stores\/team'/,
  'Home should import the team store'
)

assert.match(
  source,
  /import \{[\s\S]*buildSpaceHistoryUrl[\s\S]*getCurrentBeginnerSpaceParams[\s\S]*\} from '@\/utils\/beginnerSpaceParams'/,
  'Home should import beginner space helper functions'
)

assert.match(
  source,
  /const teamStore = useTeamStore\(\)/,
  'Home should create a team store instance'
)

assert.match(
  source,
  /async function initializeBeginnerSpace\(\)[\s\S]*teamStore\.setCurrentUserId\(me\.value\.id\)[\s\S]*await teamStore\.restoreSpaceState\(\)/,
  'Home should restore remembered personal/team space after loading the user'
)

assert.match(
  source,
  /function getBeginnerSpaceParams\(\)[\s\S]*return getCurrentBeginnerSpaceParams\(teamStore\)/,
  'Home should derive current space params through the shared helper'
)

assert.match(
  source,
  /const historyUrl = buildSpaceHistoryUrl\('\/api\/images\/history', \{[\s\S]*limit: HISTORY_PAGE_SIZE,[\s\S]*offset: historyOffset\.value,[\s\S]*\.\.\.getBeginnerSpaceParams\(\)[\s\S]*\}\)/,
  'Home history loading should include current space params'
)

assert.match(
  source,
  /const historyUrl = buildSpaceHistoryUrl\('\/api\/images\/history', \{[\s\S]*limit: HISTORY_PAGE_SIZE,[\s\S]*offset: 0,[\s\S]*\.\.\.getBeginnerSpaceParams\(\)[\s\S]*\}\)/,
  'Home background refresh should include current space params'
)

assert.match(
  source,
  /const spaceParams = getBeginnerSpaceParams\(\)[\s\S]*Object\.assign\(payload, spaceParams\)/,
  'Home image generation payload should include current space params'
)

assert.match(
  source,
  /async function handleBeginnerSpaceSwitched\(\)[\s\S]*historyMemoryCache\.value = null[\s\S]*items\.value = \[\][\s\S]*await loadHistory\(true\)/,
  'Home should clear scoped cache/gallery and reload history when space changes'
)

assert.match(
  source,
  /window\.addEventListener\('space-switched', handleBeginnerSpaceSwitched\)/,
  'Home should listen for space-switched'
)

assert.match(
  source,
  /window\.removeEventListener\('space-switched', handleBeginnerSpaceSwitched\)/,
  'Home should remove the space-switched listener'
)

console.log('Home beginner space source tests passed')
