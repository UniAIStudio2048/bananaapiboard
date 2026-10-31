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
    runInNewContext(source.slice(start, end), {
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
    const result = await runInNewContext(`(async () => { if (true) { ${source.slice(validationStart, validationEnd)}; return 'accepted' })()`, {
      selectedWan3Mode: ref(mode), wan3File: ref(null), wan3Link: ref(''),
      referenceVideos: ref([]), referenceAudios: ref([]), finalImages: ['hat.png'],
      currentModelConfig: ref({ apiType: 'wan3' }), showAlert: async message => alerts.push(message)
    })
    assert.equal(result, undefined)
    assert.match(alerts[0], /至少.*视频/)
  })
}
