import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref, watch, nextTick } from 'vue'
import { resolveImageNodeAspectRatio } from '../../../utils/aspectRatio.js'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const defaultValues = ['auto', '16:9', '1:1', '9:16', '4:3', '3:4', '2:3', '3:2', '4:5', '5:4', '21:9']
const extendedValues = ['9:21', '1:2', '2:1', '1:3', '3:1', '1:4', '4:1', '1:8', '8:1']

test('an already mounted image node refreshes model ratios when tenant configuration is reloaded', () => {
  const version = ref(0)
  let modelConfig = [{ value: 'test', aspectRatios: ['auto', '8:1'] }]
  const block = source.slice(source.indexOf('const models = computed('), source.indexOf('const selectedModelConfig = computed('))
  const models = new Function('computed', 'hasImageInput', 'getAvailableImageModels', 'getTenantConfigVersion', `${block}; return models`)(
    computed, ref(false), () => modelConfig, () => version.value
  )
  assert.deepEqual(models.value[0].aspectRatios, ['auto', '8:1'])
  modelConfig = [{ value: 'test', aspectRatios: ['1:4'] }]
  version.value++
  assert.deepEqual(models.value[0].aspectRatios, ['1:4'])
})

function menu(config) {
  const modelLookupList = ref([{ value: 'test', aspectRatios: config }])
  const selectedModel = ref('test')
  const block = source.slice(source.indexOf('const aspectRatios = ['), source.indexOf('// 监听模型变化'))
  const available = new Function('computed', 'modelLookupList', 'selectedModel', `${block}; return availableImageAspectRatios`)(computed, modelLookupList, selectedModel)
  return { available, modelLookupList, selectedModel }
}

test('legacy menus stay unchanged and enabled smart ratio is first with a Chinese display label', () => {
  const legacy = menu(undefined).available.value
  assert.deepEqual(legacy.map(r => r.value), defaultValues)
  assert.equal(legacy[0].displayLabel, '智能比例')
  const configured = menu(['8:1', 'auto', '1:4']).available.value
  assert.deepEqual(configured.map(r => r.value), ['auto', '1:4', '8:1'])
  assert.equal(configured[0].displayLabel, '智能比例')
})

test('configured strings and objects expose every enabled ratio but never insert smart automatically', () => {
  for (const value of extendedValues) {
    assert.deepEqual(menu([value]).available.value.map(r => r.value), [value])
    assert.deepEqual(menu([{ value, label: `custom ${value}` }]).available.value.map(r => r.value), [value])
  }
  assert.deepEqual(menu([]).available.value, [])
  assert.deepEqual(menu(['1:1']).available.value.map(r => r.value), ['1:1'])
})

test('a model/config change replaces a hidden selection with the first lit option; all off retains 1:1 fallback', async () => {
  const { available, modelLookupList, selectedModel } = menu(['auto', '1:4'])
  const selectedAspectRatio = ref('1:4')
  const dependencies = {
    watch, selectedModel, modelLookupList, availableImageAspectRatios: available, selectedAspectRatio,
    imageSizes: ref([{ value: '2K' }]), imageSize: ref('2K'), checkIsSeedream45: () => false,
    normalizeImageSelectedSize: (_, value) => value, imageParameterQualityOptions: ref([]),
    isPixmaxImage2Model: ref(false), selectedQuality: ref('high'), console: { log() {} }
  }
  const block = source.slice(source.indexOf('watch([selectedModel, imageSizes,'), source.indexOf('// 计算单次积分消耗'))
  const stop = new Function(...Object.keys(dependencies), `return ${block.trim()}`)(...Object.values(dependencies))
  try {
    modelLookupList.value.push({ value: 'next', aspectRatios: ['8:1'] })
    selectedModel.value = 'next'
    await nextTick()
    assert.equal(selectedAspectRatio.value, '8:1')
    modelLookupList.value[1].aspectRatios = ['auto', '1:1']
    await nextTick()
    assert.equal(selectedAspectRatio.value, 'auto')
    modelLookupList.value[1].aspectRatios = []
    await nextTick()
    assert.equal(selectedAspectRatio.value, '1:1')
  } finally { stop() }
})

test('smart ratio matches new and existing extended ratios only when enabled', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  t.after(() => original ? Object.defineProperty(globalThis, 'Image', original) : delete globalThis.Image)
  globalThis.Image = class {
    set src(value) {
      const [width, height] = value.split(':').map(Number)
      this.naturalWidth = width * 100
      this.naturalHeight = height * 100
      queueMicrotask(() => this.onload())
    }
  }
  for (const value of extendedValues) {
    assert.equal(await resolveImageNodeAspectRatio(value, ['auto', '1:1', value]), value)
    assert.equal(await resolveImageNodeAspectRatio(value, ['auto', '1:1']), '1:1')
  }
  assert.equal(await resolveImageNodeAspectRatio('1:8', ['auto']), '3:4')
  assert.equal(await resolveImageNodeAspectRatio(null, ['auto', '1:8']), '3:4')
})
