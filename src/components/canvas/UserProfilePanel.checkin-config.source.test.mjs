import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')

test('user profile derives check-in enabled state from tenant app settings and status', () => {
  assert.match(source, /const isCheckinEnabled = computed/)
  assert.match(source, /appSettings\.value\.checkin_enabled !== false/)
  assert.match(source, /checkinStatus\.value\.enabled !== false/)
})

test('user profile hides check-in card when disabled and uses reward-aware status', () => {
  assert.match(source, /v-if="isCheckinEnabled"/)
  assert.match(source, /reward:\s*1/)
  assert.match(source, /checkinStatus\.value = \{ \.\.\.checkinStatus\.value, \.\.\.data \}/)
})
