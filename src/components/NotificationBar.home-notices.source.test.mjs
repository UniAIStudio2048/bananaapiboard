import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const componentSource = readFileSync(new URL('./NotificationBar.vue', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../api/community.js', import.meta.url), 'utf8')

test('community API exposes home notices endpoint', () => {
  assert.match(apiSource, /export function getHomeNotices\(\)/)
  assert.match(apiSource, /request\('\/api\/community\/home-notices'\)/)
})

test('notification bar loads and rotates home notices', () => {
  assert.match(componentSource, /import \{ getHomeNotices \} from '@\/api\/community'/)
  assert.match(componentSource, /const ROTATION_INTERVAL_MS = 8000/)
  assert.match(componentSource, /setInterval\([^)]*showNextNotice[^)]*ROTATION_INTERVAL_MS/s)
  assert.match(componentSource, /const badgeText = computed\(\(\) => activeNotice\.value\?\.badge_text \|\| '📣 通知'\)/)
  assert.match(componentSource, /<span class="home-notice-badge">\{\{ badgeText \}\}<\/span>/)
  assert.doesNotMatch(componentSource, /activeNotice\.preset === 'maintenance' \? '维护' : '通知'/)
  assert.match(componentSource, /home-notice-bar/)
  assert.match(componentSource, /home-notice-card/)
})

test('notification text uses content-sized centered single-line layout', () => {
  assert.match(componentSource, /\.home-notice-copy/)
  assert.match(componentSource, /\.home-notice-viewport[\s\S]*max-width: min\(1680px, calc\(100vw - 80px\)\)/)
  assert.match(componentSource, /\.home-notice-card[\s\S]*width: max-content/)
  assert.doesNotMatch(componentSource, /max-width: calc\(100% - 58px\)/)
  assert.match(componentSource, /\.home-notice-copy[\s\S]*justify-content: center/)
  assert.match(componentSource, /\.home-notice-title[\s\S]*white-space: nowrap/)
  assert.match(componentSource, /\.home-notice-content[\s\S]*white-space: nowrap/)
})

test('multiple notices auto paginate with downward scroll and no selector tabs', () => {
  assert.match(componentSource, /<Transition name="home-notice-page" mode="out-in">/)
  assert.match(componentSource, /:key="activeNotice\.id \|\| activeIndex"/)
  assert.match(componentSource, /\.home-notice-page-enter-from[\s\S]*translateY\(-110%\)/)
  assert.match(componentSource, /\.home-notice-page-leave-to[\s\S]*translateY\(110%\)/)
  assert.doesNotMatch(componentSource, /home-notice-dots/)
  assert.doesNotMatch(componentSource, /function selectNotice/)
})

test('notification bar close behavior differs for logged in and anonymous users', () => {
  assert.match(componentSource, /const CLOSE_SUPPRESSION_MS = 24 \* 60 \* 60 \* 1000/)
  assert.match(componentSource, /localStorage\.setItem\(getDismissStorageKey\(\), String\(Date\.now\(\)\)/)
  assert.match(componentSource, /sessionStorage\.setItem\(getAnonymousDismissKey\(\), '1'\)/)
  assert.match(componentSource, /localStorage\.getItem\('token'\)/)
  assert.match(componentSource, /localStorage\.getItem\('user_id'\)/)
})

test('app mounts home notice bar only on landing and community home surfaces', () => {
  assert.match(appSource, /const isHomeNoticeVisible = computed/)
  assert.match(appSource, /route\.path === '\/community'/)
  assert.match(appSource, /route\.path === '\/'/)
  assert.match(appSource, /<NotificationBar v-if="isHomeNoticeVisible" \/>/)
})
