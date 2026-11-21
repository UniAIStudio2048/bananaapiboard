import { localizedPattern } from '../../../i18n/sourceAssertions.mjs'
import * as i18nTestRuntime from '../../../i18n/index.js'
const { t: translateUi, currentLanguage: uiLanguage } = i18nTestRuntime
uiLanguage.value = 'zh-CN'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const start = source.indexOf("  if (['wan3', 'atlascloud-wan3', 'wavespeed-wan3', 'siray-wan3', 'grsai-wan3'].includes(capturedState.apiType))")
const end = source.indexOf("    console.log('[VideoNode] 万相 3.0 模式:', wan3Mode)", start) + "    console.log('[VideoNode] 万相 3.0 模式:', wan3Mode)\n  }".length

for (const mode of ['video_edit', 'video_extend']) {
  test(`Wan3 ${mode} submits captured reference media after switching nodes/models`, () => {
    const formData = new FormData()
    runInNewContext(source.slice(start, end), { translateUi, uiLanguage,
      formData, finalImages: ['https://example.com/hat.png'],
      capturedState: { apiType: 'wan3', wan3Mode: mode,
        referenceVideos: ['https://example.com/original.mp4'], referenceAudios: ['https://example.com/voice.mp3'] },
      selectedWan3Mode: ref('text2video'), currentModelConfig: ref({ apiType: 'unrelated' }),
      referenceVideos: ref(['https://example.com/new.mp4']), referenceAudios: ref([]), console: { log() {} }
    })
    assert.equal(formData.get('seedance_mode'), mode)
    assert.deepEqual(JSON.parse(formData.get('reference_images')), ['https://example.com/hat.png'])
    assert.deepEqual(JSON.parse(formData.get('reference_videos')), ['https://example.com/original.mp4'])
    assert.deepEqual(JSON.parse(formData.get('reference_audios')), ['https://example.com/voice.mp3'])
    assert.equal(formData.has('first_frame_image'), false)
    assert.equal(formData.has('wan3_prompt_extend'), false, 'channel controls prompt extension on the server')
  })

  test(`Wan3 ${mode} rejects missing video before submission`, async () => {
    const validationStart = source.indexOf('    const wan3Mode = selectedWan3Mode.value', source.indexOf('async function handleGenerate'))
    const validationEnd = source.indexOf('\n  if (!isHeygenFlow && isCozeVideoSwapModel.value)', validationStart)
    const alerts = []
    const result = await runInNewContext(`(async () => { if (true) { ${source.slice(validationStart, validationEnd)}; return 'accepted' })()`, { translateUi, uiLanguage,
      selectedWan3Mode: ref(mode), wan3File: ref(null), wan3Link: ref(''),
      referenceVideos: ref([]), referenceAudios: ref([]), finalImages: ['hat.png'],
      currentModelConfig: ref({ apiType: 'wan3' }), showAlert: async message => alerts.push(message)
    })
    assert.equal(result, undefined)
    assert.match(alerts[0], localizedPattern(/至少.*视频/))
  })
}

test('canvas blocks only combined reference and output durations greater than 30 seconds', async () => {
  const validationStart = source.indexOf('  // 校验参考视频与生成视频合计时长', source.indexOf('async function handleGenerate'))
  const validationEnd = source.indexOf('  // 合并参考图片', validationStart)
  assert.ok(validationStart >= 0 && validationEnd > validationStart)
  const expected = '该模型的参考视频秒数+生成秒数不能大于30秒，如参考视频较长建议裁剪后分段生成。'

  for (const [referenceDurations, outputDuration, expectedAlert, apiType = 'wan3'] of [
    [[7.25, 8], '15', expected],
    [[7.25, 8], '15', expected, 'routerbee-wan3'],
    [[7.25, 8], '15', null, 'unrelated'],
    [[7, 8], '15', null],
    [[], '30', null],
    [[], '31', expected],
    [[14], '15', null],
    [[20], '-1', null],
    [[null], '15', '无法读取视频时长，请更换视频文件']
  ]) {
    const alerts = []
    const urls = referenceDurations.map((_, index) => `sample-${index}.mp4`)
    const isGenerating = ref(false)
    const selectedModel = ref('selected-model')
    const selectedDuration = ref(outputDuration)
    const result = await runInNewContext(`(async () => {${source.slice(validationStart, validationEnd)}; return 'accepted' })()`, {
      translateUi, uiLanguage, isHeygenFlow: false, wan3ReferenceUrls: ref(urls),
      isWan3Model: ref(apiType === 'wan3'), isRouterBeeWan3Model: ref(apiType === 'routerbee-wan3'),
      isGenerating, selectedModel, selectedDuration, nextTick: async () => {},
      wan3ReferenceDurationRequest: Promise.resolve(referenceDurations),
      showAlert: async message => alerts.push(message)
    })
    assert.deepEqual(alerts, expectedAlert ? [expectedAlert] : [])
    assert.equal(result, expectedAlert ? undefined : 'accepted')
    assert.equal(isGenerating.value, false)
  }
})

test('canvas waits for reference metadata and cancels a stale duration check after switching models', async () => {
  const start = source.indexOf('  // 校验参考视频与生成视频合计时长', source.indexOf('async function handleGenerate'))
  const end = source.indexOf('  // 合并参考图片', start)
  assert.ok(start >= 0 && end > start)
  let resolveDurations
  const wan3ReferenceDurationRequest = new Promise(resolve => { resolveDurations = resolve })
  const isGenerating = ref(false)
  const selectedModel = ref('old-model')
  const validation = runInNewContext(`(async () => {${source.slice(start, end)}; return 'accepted' })()`, {
    translateUi, uiLanguage, isHeygenFlow: false, wan3ReferenceUrls: ref(['original.mp4']),
    isWan3Model: ref(true), isRouterBeeWan3Model: ref(false),
    selectedModel, selectedDuration: ref('15'), isGenerating, nextTick: async () => {},
    wan3ReferenceDurationRequest,
    showAlert: async () => assert.fail('stale input should not show an alert')
  })
  assert.equal(isGenerating.value, true)
  selectedModel.value = 'new-model'
  resolveDurations([20])
  assert.equal(await validation, undefined)
  assert.equal(isGenerating.value, false)
})

test('canvas submits the duration checked at click time even after the selection changes', () => {
  const start = source.indexOf('  if (capturedState.validatedVideoDuration)')
  const end = source.indexOf('  if (isKlingOfficialDurationModel', start)
  assert.ok(start >= 0 && end > start)
  const formData = new FormData()
  runInNewContext(source.slice(start, end), {
    formData, capturedState: { validatedVideoDuration: '15' },
    selectedDuration: ref('30'), isWanModel: ref(false), isVeo3Model: ref(false)
  })
  assert.equal(formData.get('duration'), '15')
})
