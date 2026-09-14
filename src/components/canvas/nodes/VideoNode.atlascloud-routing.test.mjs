import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref, watch, nextTick } from 'vue'
import { resolveVideoRequestModel } from '../../../utils/videoGenerationMode.js'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const modelName = 'atlascloud-h3-t2v-copy-wan'
const modelConfig = { apiType: 'atlascloud-video-t2v', value: modelName, actualModel: 'minimax/h3/text-to-video' }

function installModeOptions(state) {
  const start = source.indexOf('const atlasCloudModeOptions = computed(')
  const end = source.indexOf('// 当前模型的视频模式选择器', start)
  assert.ok(start >= 0 && end > start, '缺少按素材计算选项禁用状态的逻辑')
  const modesStart = source.indexOf('const MINIMAX_H3_MODES = [')
  const modesEnd = source.indexOf('const minimaxH3Modes =', modesStart)
  state.minimaxH3Modes = ref(['text2video', 'image2video_first', 'multimodal_ref'].map(value => ({ value })))
  state.atlasCloudModeOptions = runInNewContext(`${source.slice(modesStart, modesEnd)}; ${source.slice(start, end)}; atlasCloudModeOptions`, state)
}

test('素材处理期间切换到 RouterBee，已排队的 AtlasCloud 请求仍使用原模型 ID', () => {
  const start = source.indexOf('  // VEO 模型：使用实际的模型名称', source.indexOf('async function sendGenerateRequest('))
  const end = source.indexOf('\n  if (selectedAspectRatio.value)', start)
  const formData = new FormData()
  runInNewContext(source.slice(start, end), {
    formData, capturedState: { model: modelName, apiType: modelConfig.apiType, modelConfig },
    currentModelConfig: ref({ apiType: 'routerbee-wan3', actualModel: 'wan-3.0' }),
    selectedModel: ref('routerbee-wan3'), resolveVideoRequestModel,
    isVeoModel: ref(false), isKlingO1Model: ref(false), isKlingV3OmniModel: ref(false)
  })
  assert.equal(formData.get('model'), modelName)
})

test('AtlasCloud 随连线素材切换文生、图生和参考模式，保留选中模型', async () => {
  const start = source.indexOf('// AtlasCloud 按连接素材自动选择生成方式')
  const end = source.indexOf('// 🔧 持久化 RunningHub', start)
  assert.ok(start >= 0 && end > start, '画布缺少 AtlasCloud 素材模式同步')
  const state = {
    computed, watch, currentModelConfig: ref(modelConfig), selectedModel: ref(modelName),
    referenceImages: ref([]), referenceVideos: ref([]), referenceAudios: ref([]),
    selectedMinimaxH3Mode: ref('text2video'), selectedWan3Mode: ref('text2video')
  }
  installModeOptions(state)
  const stop = runInNewContext(source.slice(start, end), state)
  for (const [images, videos, audios, mode] of [
    [0, 0, 0, 'text2video'], [1, 0, 0, 'image2video_first'],
    [2, 0, 0, 'multimodal_ref'], [0, 1, 0, 'multimodal_ref'],
    [0, 0, 1, 'multimodal_ref'], [1, 0, 1, 'multimodal_ref'],
    [1, 0, 0, 'multimodal_ref'], [0, 0, 0, 'text2video']
  ]) {
    state.referenceImages.value = Array(images).fill('image')
    state.referenceVideos.value = Array(videos).fill('video')
    state.referenceAudios.value = Array(audios).fill('audio')
    await nextTick()
    assert.equal(state.selectedMinimaxH3Mode.value, mode)
    assert.equal(state.selectedModel.value, modelName)
  }
  stop()
})

test('只有音频输入的 AtlasCloud 参考任务可以通过素材校验', async () => {
  const start = source.indexOf('    const h3Mode =', source.indexOf('// MiniMax H3 官方直连：模式输入校验'))
  const end = source.indexOf("    if (h3Mode === 'multimodal_ref') {", start)
  const alerts = []
  await runInNewContext(`(async () => { ${source.slice(start, end)} })()`, {
    selectedMinimaxH3Mode: ref('multimodal_ref'), minimaxH3DefaultMode: ref('text2video'),
    finalImages: [], referenceVideos: ref([]), referenceAudios: ref(['https://example.com/ref.mp3']),
    isAtlasCloudVideoModel: ref(true), showAlert: message => alerts.push(message)
  })
  assert.deepEqual(alerts, [])
})

test('单图时人工选择参考模式不会被监听器覆盖', async () => {
  const start = source.indexOf('// AtlasCloud 按连接素材自动选择生成方式')
  const end = source.indexOf('// 🔧 持久化 RunningHub', start)
  const state = {
    computed, watch, currentModelConfig: ref(modelConfig),
    referenceImages: ref(['https://example.com/a.png']), referenceVideos: ref([]), referenceAudios: ref([]),
    selectedMinimaxH3Mode: ref('image2video_first'), selectedWan3Mode: ref('text2video')
  }
  installModeOptions(state)
  const stop = runInNewContext(source.slice(start, end), state)
  state.selectedMinimaxH3Mode.value = 'multimodal_ref'
  await nextTick()
  assert.equal(state.selectedMinimaxH3Mode.value, 'multimodal_ref')
  state.referenceImages.value = ['https://example.com/replaced.png']
  await nextTick()
  assert.equal(state.selectedMinimaxH3Mode.value, 'multimodal_ref')
  state.selectedMinimaxH3Mode.value = 'image2video_first'
  await nextTick()
  assert.equal(state.selectedMinimaxH3Mode.value, 'image2video_first')
  stop()
})

test('无素材仅文生可选，单图可选图生和参考，多素材仅参考可选', () => {
  const state = { computed, currentModelConfig: ref(modelConfig), referenceImages: ref([]), referenceVideos: ref([]), referenceAudios: ref([]) }
  installModeOptions(state)
  for (const [images, videos, audios, enabled] of [
    [0, 0, 0, ['text2video']], [1, 0, 0, ['image2video_first', 'multimodal_ref']],
    [2, 0, 0, ['multimodal_ref']], [0, 1, 0, ['multimodal_ref']], [0, 0, 1, ['multimodal_ref']]
  ]) {
    state.referenceImages.value = Array(images).fill('image')
    state.referenceVideos.value = Array(videos).fill('video')
    state.referenceAudios.value = Array(audios).fill('audio')
    assert.equal(state.atlasCloudModeOptions.value.length, 3)
    assert.deepEqual(Array.from(state.atlasCloudModeOptions.value.filter(mode => !mode.disabled), mode => mode.value), enabled)
  }
  assert.match(source, /v-for="option in activeVideoModeSelector.options"[\s\S]*?:disabled="option.disabled"/)
})

test('模式选择器拒绝被禁用的选项', () => {
  const start = source.indexOf('function setActiveVideoMode(')
  const end = source.indexOf('function setActiveVideoSubmode(', start)
  const selectedMinimaxH3Mode = ref('text2video')
  const select = runInNewContext(`${source.slice(start, end)}; setActiveVideoMode`, {
    activeVideoModeSelector: ref({ key: 'minimax-h3', options: [
      { value: 'text2video', disabled: false }, { value: 'image2video_first', disabled: true }
    ] }), selectedMinimaxH3Mode
  })
  select('image2video_first')
  assert.equal(selectedMinimaxH3Mode.value, 'text2video')
})

test('排队的 AtlasCloud 参考任务在切换模型后仍携带原视频与音频', () => {
  const start = source.indexOf('  // MiniMax H3 官方直连：模式参数')
  const end = source.indexOf('\n  // ', start + 5)
  const formData = new FormData()
  runInNewContext(source.slice(start, end), {
    formData, finalImages: ['https://example.com/ref.png'],
    capturedState: { isMinimaxH3: true, minimaxH3Mode: 'multimodal_ref', minimaxH3Resolution: '720p',
      referenceVideos: ['https://example.com/ref.mp4'], referenceAudios: ['https://example.com/ref.mp3'] },
    isMinimaxH3Model: ref(false), referenceVideos: ref([]), referenceAudios: ref([]), console: { log() {} }
  })
  assert.equal(formData.get('seedance_mode'), 'multimodal_ref')
  assert.deepEqual(JSON.parse(formData.get('reference_videos')), ['https://example.com/ref.mp4'])
  assert.deepEqual(JSON.parse(formData.get('reference_audios')), ['https://example.com/ref.mp3'])
})

test('视频上传使用捕获素材；失败可重试且不会修改原列表', async () => {
  const start = source.indexOf('async function ensureReferenceVideoUrlsAccessible(')
  const end = source.indexOf('// 后台执行生成的重操作', start)
  let failUpload = true
  const upload = runInNewContext(`${source.slice(start, end)}; ensureReferenceVideoUrlsAccessible`, {
    referenceVideos: ref(['https://example.com/new.mp4']),
    canvasStore: { updateNodeData() {}, edges: [], nodes: [] }, console: { log() {}, error() {} },
    fetch: async () => ({ ok: true, blob: async () => ({ type: 'video/mp4' }) }),
    File: class {}, uploadCanvasMedia: async () => {
      if (failUpload) throw new Error('upload failed')
      return { status: 'completed', url: 'https://example.com/original.mp4' }
    }
  })
  const captured = ['blob:original']
  await assert.rejects(upload('source', 'target', captured), /upload failed/)
  failUpload = false
  assert.deepEqual(Array.from(await upload('source', 'target', captured)), ['https://example.com/original.mp4'])
  assert.deepEqual(captured, ['blob:original'])
})
