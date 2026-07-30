import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./digital-humans.js', import.meta.url), 'utf8')

test('数字人请求携带当前团队空间参数以复用视频节点扣费规则', () => {
  assert.match(source, /import \{ useTeamStore \} from '@\/stores\/team'/)
  assert.match(source, /function withSpaceParams\(input\)/)
  assert.match(source, /return \{[\s\S]*spaceType: spaceParams\.spaceType/)
  assert.match(source, /createDigitalHuman\(input\)[\s\S]*withSpaceParams\(input\)/)
  assert.match(source, /createDigitalHumanVideo\(input\)[\s\S]*withSpaceParams\(input\)/)
  assert.match(source, /createDigitalHumanLipsync\(input\)[\s\S]*withSpaceParams\(input\)/)
})
