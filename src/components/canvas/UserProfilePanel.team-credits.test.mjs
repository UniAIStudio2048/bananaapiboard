import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')

test('quick-stats section has team points stat-item gated by team space', () => {
  assert.match(
    source,
    /v-if="teamStore\.globalSpaceType\.value\s*===\s*'team'[\s\S]*?stat-item[\s\S]*?team_points/
  )
})

test('team points stat displays formatPoints of userInfo team_points', () => {
  assert.match(
    source,
    /formatPoints\(userInfo\?\.team_points\s*\|\|\s*0\)/
  )
})

test('team points stat uses teamPoints i18n key', () => {
  assert.match(source, /t\('user\.teamPoints'\)/)
})

test('total balance stat exists gated by team space', () => {
  assert.match(
    source,
    /v-if="teamStore\.globalSpaceType\.value\s*===\s*'team'[\s\S]*?total-balance/
  )
})

test('total balance stat uses totalBalance i18n key', () => {
  assert.match(source, /t\('user\.totalBalance'\)/)
})

test('totalTeamBalance computed sums team + package + permanent points', () => {
  assert.match(source, /const totalTeamBalance\s*=\s*computed/)
  const computedStart = source.indexOf('const totalTeamBalance = computed')
  const window = source.slice(computedStart, computedStart + 500)
  assert.match(window, /team_points/)
  assert.match(window, /package_points/)
  assert.match(window, /points\b/)
})

test('icons object includes team icon', () => {
  assert.match(source, /team:\s*`<svg/)
})

test('icons object includes total icon', () => {
  assert.match(source, /total:\s*`<svg/)
})