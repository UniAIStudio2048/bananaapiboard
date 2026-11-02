import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref, reactive } from 'vue'
import { getAutoReviewMaterials, isAutoReviewConnected } from '../../../utils/seedanceAutoReview.js'
const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
test('bound model defaults on, explicit off survives reload, switching model defaults on', () => {
  const start = source.indexOf('const autoReviewConnected = computed(')
  const end = source.indexOf('\nasync function setAutoReviewMaterials', start)
  assert.ok(start > 0 && end > start, 'auto review availability and setting computeds should exist')
  const props = reactive({ data: {} }), selectedModel = ref('sd'), assetReviewProvider = ref('volcengine')
  const setting = runInNewContext(`${source.slice(start, end)}\nautoReviewMaterials`, { computed, props, selectedModel, assetReviewProvider, getAutoReviewMaterials, isAutoReviewConnected, userInfo: ref(null) })
  assert.equal(setting.value, true)
  props.data = { autoReviewMaterials: { sd: false } }; selectedModel.value = 'other'; selectedModel.value = 'sd'
  assert.equal(setting.value, false)
  selectedModel.value = 'other'
  assert.equal(setting.value, true)
  assetReviewProvider.value = ''
  assert.equal(setting.value, false)
  assetReviewProvider.value = 'stars_asset'
  assert.equal(setting.value, true, 'stars binding defaults on for Seedance 2.0 / 2.5 channels')
  assetReviewProvider.value = 'thirdparty'
  assert.equal(setting.value, false, 'pending providers stay off')
})

test('switch saves user preferences before updating UI, preserves other habits and survives a new node', async () => {
  const start = source.indexOf('async function setAutoReviewMaterials(')
  const end = source.indexOf('\nconst showSeedanceAdvancedOptions', start)
  const userInfo = ref({ preferences: { theme: 'dark', canvas: { gridSnap: true, autoReviewMaterials: { other: false } } } })
  const calls = [], savingAutoReview = ref(false), selectedModel = ref('sd')
  const autoReviewMaterials = computed(() => getAutoReviewMaterials('tokenhub_asset', selectedModel.value, {}, userInfo.value.preferences))
  let resolveSave
  const set = runInNewContext(`${source.slice(start, end)}\nsetAutoReviewMaterials`, {
    userInfo, savingAutoReview, selectedModel, autoReviewMaterials,
    updateUserPreferences: preferences => { calls.push(JSON.parse(JSON.stringify(preferences))); return new Promise(resolve => { resolveSave = resolve }) },
    showToast: message => calls.push(message)
  })
  const event = { target: { checked: false } }
  const saving = set(event)
  assert.equal(savingAutoReview.value, true)
  assert.equal(autoReviewMaterials.value, true, 'keep database value while saving')
  assert.equal(calls[0].theme, 'dark')
  assert.equal(calls[0].canvas.gridSnap, true)
  assert.deepEqual(calls[0].canvas.autoReviewMaterials, { other: false, sd: false })
  resolveSave({ success: true }); await saving
  assert.equal(autoReviewMaterials.value, false)
  assert.equal(getAutoReviewMaterials('tokenhub_asset', 'sd', {}, JSON.parse(JSON.stringify(userInfo.value.preferences))), false)
  event.target.checked = true
  const failed = set(event)
  resolveSave(null); await failed
  assert.equal(autoReviewMaterials.value, false, 'failed write must not change persisted setting')
  assert.equal(savingAutoReview.value, false)
})
test('submission captures the toggle and sends its value to the backend', () => {
  assert.match(source, /autoReviewMaterials: autoReviewMaterials.value/)
  assert.match(source, /formData.append\('auto_review_materials', String\(capturedState.autoReviewMaterials\)\)/)
  assert.match(source, /自动校验素材/)
  assert.match(source, /高级设置/)
})
test('stars asset review toggle is enabled for Seedance 2.5 and pending providers keep the hint', () => {
  assert.match(source, /:disabled="savingAutoReview \|\| isGenerating \|\| !autoReviewConnected"/)
  assert.match(source, /v-if="assetReviewProvider && !autoReviewConnected"/)
})
