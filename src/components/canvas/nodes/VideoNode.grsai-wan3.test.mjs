import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'
import { WAN3_MODES, resolveVideoRequestModel } from '../../../utils/videoGenerationMode.js'
const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('Grsai retains internal model routing and four selectable modes', () => {
  assert.equal(resolveVideoRequestModel({ apiType: 'grsai-wan3', actualModel: 'wan-3.0' }, 'grsai-wan3'), 'grsai-wan3')
  const start = source.indexOf('  if (isWan3Model.value) {', source.indexOf('const activeVideoModeSelector'))
  const end = source.indexOf('\n  if (isWanModel.value)', start)
  const selector = runInNewContext(`(() => { ${source.slice(start, end)} })()`, {
    isWan3Model: ref(true), currentModelConfig: ref({ apiType: 'grsai-wan3' }), selectedWan3Mode: ref('multimodal_ref'), WAN3_MODES
  })
  assert.deepEqual(Array.from(selector.options, item => item.value), ['text2video', 'image2video_first', 'image2video_first_last', 'multimodal_ref'])
})

test('Grsai sends captured audio/image references and seed zero without unsupported video', () => {
  const start = source.indexOf("  if (['wan3', 'atlascloud-wan3', 'wavespeed-wan3', 'siray-wan3', 'grsai-wan3'].includes(capturedState.apiType))")
  assert.ok(start > 0)
  const end = source.indexOf("\n  if (capturedState.apiType === 'routerbee-wan3')", start)
  const formData = new FormData()
  runInNewContext(source.slice(start, end), { formData, finalImages: ['https://example.com/cup.png'],
    capturedState: { apiType: 'grsai-wan3', wan3Mode: 'multimodal_ref', grsaiSeed: 0, referenceAudios: ['https://example.com/audio.wav'], referenceVideos: [] },
    currentModelConfig: ref({ apiType: 'grsai-wan3' }), selectedWan3Mode: ref('text2video'), referenceVideos: ref([]), referenceAudios: ref([]), console: { log() {} }
  })
  assert.equal(formData.get('seedance_mode'), 'multimodal_ref')
  assert.equal(formData.get('seed'), '0')
  assert.deepEqual(JSON.parse(formData.get('reference_images')), ['https://example.com/cup.png'])
  assert.deepEqual(JSON.parse(formData.get('reference_audios')), ['https://example.com/audio.wav'])
  assert.equal(formData.has('reference_videos'), false)
})
