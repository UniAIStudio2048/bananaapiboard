import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('按秒计费时画布显示每秒积分而不是预扣总积分', () => {
  assert.match(source, /const perSecondBillingCostPerSecond = computed/)
  assert.match(source, /v-else-if="isPerSecondBilling"[\s\S]*formatPoints\(perSecondBillingCostPerSecond\)\s*\}\}\s*积分\/s/)
})

test('按秒计费默认不自动选择固定时长', () => {
  assert.match(source, /const selectedDuration = ref\(props\.data\.duration \|\| ''\)/)
  assert.match(source, /isPerSecondBilling\.value && !isRunningHubAiAppVideoV31Model\.value && !hasExplicitDurationSelection\.value[\s\S]*selectedDuration\.value = ''/)
  assert.match(source, /function selectVideoDuration\(value\)[\s\S]*hasExplicitDurationSelection\.value = true/)
  assert.match(source, /!isPerSecondBilling\.value && availableDurations\.value\.length > 0/)
})

test('通用按秒计费模型不显示固定时长和主栏计费说明', () => {
  assert.match(source, /const showVideoParameterDuration = computed\(\(\) => \{[\s\S]*?isRunningHubAiAppVideoV31Model\.value \|\| !isPerSecondBilling\.value[\s\S]*?durations\.value\.length > 0/)
  assert.match(source, /:show-duration="showVideoParameterDuration"/)
  assert.doesNotMatch(source, /class="duration-billing-hint"/)
})
