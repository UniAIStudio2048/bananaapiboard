import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { sumPoints } from '../utils/format.js'

const source = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')
const declaration = source.match(/const totalPoints = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0]
assert.ok(declaration, 'Canvas must define its header points computed')

function headerPoints(me) {
  return new Function('computed', 'me', 'sumPoints', `${declaration}\nreturn totalPoints`)(computed, me, sumPoints)
}

test('canvas header preserves permanent points when other balances are zero', () => {
  const me = ref({ team_points: 0, subuser_points: 0, package_points: 0, points: '407834.12' })
  assert.equal(headerPoints(me).value, '407834.12')
})

test('canvas header adds all four point sources numerically', () => {
  const me = ref({ team_points: '300.25', subuser_points: '12.34', package_points: '100.5', points: '50.25' })
  assert.equal(headerPoints(me).value, '463.34')
})

test('canvas header supports users without subuser points', () => {
  assert.equal(headerPoints(ref({ package_points: '43.50', points: '87093.30' })).value, '87136.8')
  assert.equal(headerPoints(ref({ subuser_points: '12.34' })).value, '12.34')
  assert.equal(headerPoints(ref(null)).value, '0')
})

test('canvas header updates after point refresh and space changes', () => {
  const me = ref({ team_points: 0, package_points: 10, points: 50, subuser_points: 5 })
  const total = headerPoints(me)
  assert.equal(total.value, '65')
  me.value.points = 40
  assert.equal(total.value, '55')
  me.value = { team_points: 100, package_points: 10, points: 40, subuser_points: 5 }
  assert.equal(total.value, '155')
  me.value.team_points = 0
  assert.equal(total.value, '55')
})
