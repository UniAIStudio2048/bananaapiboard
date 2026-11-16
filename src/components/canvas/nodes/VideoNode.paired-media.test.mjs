import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref } from 'vue'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
function block(start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `Missing ${start}`)
  return source.slice(from, to)
}

for (const apiType of ['runninghub-motion-transfer', 'runninghub-longcat']) {
  test(`${apiType} remains visible with no input, image only, or other media only`, () => {
    const supports = runInNewContext(`${block('function supportsCurrentMode(', '// 获取默认模型')}; supportsCurrentMode`)
    for (const supportedModes of [['i2v'], { i2v: true, t2v: false }]) {
      for (const mode of ['t2v', 'i2v']) assert.equal(supports({ apiType, supportedModes }, mode), true)
      assert.equal(supports({ apiType: 'other', supportedModes }, 't2v'), false)
    }
  })

  test(`${apiType} only accepts the exact media pair and reacts to removal / excess input`, () => {
    const state = {
      computed, referenceImages: ref([]), referenceVideos: ref([]), referenceAudios: ref([]),
      currentModelConfig: ref({ apiType }), translateUi: key => key
    }
    const error = runInNewContext(`${block('function getModelInputError(', 'const activeDigitalHuman =')}; selectedModelInputError`, state)
    for (const [images, videos, audios] of [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1],
      [2, 1, 0], [1, 2, 0], [2, 0, 1], [1, 0, 2], [1, 1, 1], [0, 0, 0]
    ]) {
      state.referenceImages.value = Array(images).fill('image')
      state.referenceVideos.value = Array(videos).fill('video')
      state.referenceAudios.value = Array(audios).fill('audio')
      const valid = images === 1 && (apiType === 'runninghub-motion-transfer'
        ? videos === 1 && audios === 0 : audios === 1 && videos === 0)
      assert.equal(error.value === '', valid, `${images} images, ${videos} videos, ${audios} audios`)
    }
    state.currentModelConfig.value = { apiType: 'other' }
    assert.equal(error.value, '')
  })

  test(`${apiType} keeps an empty optional prompt in the request`, () => {
    const start = `  if (capturedState.apiType === '${apiType}') {`
    const formData = new FormData()
    formData.set('prompt', 'fallback')
    runInNewContext(block(start, '\n  if ('), {
      capturedState: { apiType, referenceVideos: ['video'], referenceAudios: ['audio'] },
      finalPrompt: '', formData
    })
    assert.equal(formData.get('prompt'), '')
  })
}

test('invalid model cannot be selected and an already selected invalid model cannot submit', async () => {
  const state = {
    selectedModel: ref('original'), models: ref([{ value: 'paired' }]),
    isModelDropdownOpen: ref(true), videoModeDropdownOpen: ref(null),
    getModelInputError: () => 'Missing media'
  }
  runInNewContext(`${block('function selectModel(', 'function closeModelDropdown(')}; selectModel('paired')`, state)
  assert.equal(state.selectedModel.value, 'original')
  let collapsed = false
  await runInNewContext(`(async () => { ${block('async function handleGenerate(options = {}) {', '  // 动态获取上游节点的最新数据').replace('async function handleGenerate(options = {}) {', '')} })()`, {
    options: {}, isGenerating: ref(false), selectedModelInputError: ref('Missing media'),
    findBlockingCanvasUploads: () => [], canvasStore: {}, props: {},
    collapseConfigPanel: () => { collapsed = true }
  })
  assert.equal(collapsed, false)
})

test('both dropdown layouts, selected trigger and submit button show invalid input state', () => {
  assert.equal((source.match(/:aria-disabled="!!getModelInputError\(m\)"/g) || []).length, 2)
  assert.match(source, /class="model-selector-trigger"\s+:class="\{ 'input-disabled': !!selectedModelInputError \}"/)
  assert.match(source, /class="generate-btn"[\s\S]*?:disabled="isGenerating \|\| !!selectedModelInputError"/)
})
