import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { buildWorkflowShareUrl } from '../../utils/workflowShare.js'

const source = readFileSync(new URL('./WorkflowShareDialog.vue', import.meta.url), 'utf8')
const shareUrlSource = source.match(/const shareUrl = computed\([\s\S]*?\n\)\)/)?.[0]
const copySource = source.match(/async function copyShareLink\([^]*?\n\}/)?.[0]
assert.ok(shareUrlSource)
assert.ok(copySource)

function createHarness(baseUrl) {
  const copiedUrls = []
  const shareState = ref({ baseUrl, token: 'original-token' })
  const values = {
    computed, shareState, buildWorkflowShareUrl,
    window: { location: { origin: 'https://test.nananobanana.cn' }, setTimeout() {} },
    navigator: { clipboard: { writeText: async value => copiedUrls.push(value) } },
    copied: ref(false), errorMessage: ref('')
  }
  const api = new Function(...Object.keys(values), `${shareUrlSource}\n${copySource}\nreturn { shareUrl, copyShareLink }`)(...Object.values(values))
  return { ...api, shareState, copiedUrls }
}

test('preview and copying use the configured tenant domain rather than the development domain', async () => {
  const harness = createHarness('https://canvas.tenant.example')
  const expected = 'https://canvas.tenant.example/share/workflows/original-token'
  assert.equal(harness.shareUrl.value, expected)
  await harness.copyShareLink()
  assert.deepEqual(harness.copiedUrls, [expected])
})

test('reset copying and updated settings retain the latest tenant domain', async () => {
  const harness = createHarness('https://canvas.tenant.example')
  harness.shareState.value = { baseUrl: 'https://updated.tenant.example', token: 'reset-token' }
  await harness.copyShareLink('reset-token')
  assert.equal(harness.shareUrl.value, 'https://updated.tenant.example/share/workflows/reset-token')
  assert.deepEqual(harness.copiedUrls, [harness.shareUrl.value])
})

test('unconfigured domains fall back to the current address and absent tokens never produce links', async () => {
  const harness = createHarness('')
  assert.equal(harness.shareUrl.value, 'https://test.nananobanana.cn/share/workflows/original-token')
  harness.shareState.value.token = null
  assert.equal(harness.shareUrl.value, '')
  assert.equal(await harness.copyShareLink(), false)
  assert.deepEqual(harness.copiedUrls, [])
})
