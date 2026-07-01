import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const nodesSource = readFileSync(join(__dirname, 'nodes.js'), 'utf8')
const llmSource = readFileSync(join(__dirname, 'llm.js'), 'utf8')
const videoToolsSource = readFileSync(join(__dirname, 'video-tools.js'), 'utf8')

assert.match(llmSource, /useTeamStore\(\)/, 'LLM API should read the current team store')
assert.match(llmSource, /teamStore\.getSpaceParams\('current'\)/, 'LLM API should use current canvas space')
assert.match(llmSource, /spaceType:\s*spaceParams\.spaceType/, 'LLM API should send spaceType')
assert.match(llmSource, /spaceParams\.teamId \? \{ teamId: spaceParams\.teamId \} : \{\}/, 'LLM API should send teamId when present')

assert.match(nodesSource, /export async function deductCropPoints\(cropType\)/, 'deductCropPoints should keep its public signature')
assert.match(nodesSource, /const teamStore = useTeamStore\(\)[\s\S]*const spaceParams = teamStore\.getSpaceParams\('current'\)[\s\S]*body: JSON\.stringify\(\{\s*cropType,\s*spaceType: spaceParams\.spaceType,\s*\.\.\.\(spaceParams\.teamId \? \{ teamId: spaceParams\.teamId \} : \{\}\)\s*\}\)/s, 'deductCropPoints should send current team billing context')

assert.match(videoToolsSource, /import \{ useTeamStore \} from '@\/stores\/team'/, 'video tools API should read the team store')
assert.match(videoToolsSource, /function withCurrentSpaceParams\(payload = \{\}\)/, 'video tools API should centralize current-space payload merging')
assert.match(videoToolsSource, /teamStore\.getSpaceParams\('current'\)/, 'video tools API should use current canvas space')
assert.match(videoToolsSource, /spaceType: spaceParams\.spaceType/, 'video tools API should send spaceType')
assert.match(videoToolsSource, /teamId: spaceParams\.teamId/, 'video tools API should send teamId when present')
assert.match(videoToolsSource, /body: withCurrentSpaceParams\(payload\)/, 'subtitle erase task creation should include current-space params')

console.log('Canvas team billing context source tests passed')
