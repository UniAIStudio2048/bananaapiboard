import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, reactive } from 'vue'
import * as ratios from '../../../utils/aspectRatio.js'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../../../api/canvas/nodes.js', import.meta.url), 'utf8')
const options = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'].map(value => ({ value }))

function createHarness(t, images = []) {
  const dimensions = {
    'https://test/portrait': [800, 1000],
    'https://test/landscape': [1600, 900],
    'data:image/png;base64,test': [1024, 1024],
    'blob:test': [1200, 900]
  }
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  t.after(() => {
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage)
    else delete globalThis.Image
  })
  globalThis.Image = class {
    set src(value) {
      const size = dimensions[value]
      queueMicrotask(() => {
        if (!size) return this.onerror()
        ;[this.naturalWidth, this.naturalHeight] = size
        this.onload()
      })
    }
  }
  const props = reactive({ id: 'target', data: { imageOrder: [] } })
  const nodes = images.map((url, i) => ({ id: `source-${i}`, type: 'image-input', data: { sourceImages: [url] } }))
  const edges = nodes.map(node => ({ source: node.id, target: 'target' }))
  const canvasStore = reactive({ nodes, edges, nodesById: new Map(nodes.map(n => [n.id, n])), edgesByTarget: new Map([['target', edges]]) })
  const requests = []
  const selectedAspectRatio = { value: 'auto' }
  const dependencies = {
    ...ratios, props, canvasStore, computed, selectedAspectRatio,
    VIDEO_NODE_TYPES: ['video'],
    console: { log() {}, warn() {}, error() {} },
    modelLookupList: { value: [{ value: 'test', apiType: 'test' }] },
    selectedModel: { value: 'test' },
    availableImageAspectRatios: { value: options },
    normalizeModelImageUrls: urls => urls,
    compressImagesIfNeeded: async urls => urls,
    selectedPreset: { value: '' }, availablePresets: { value: [] },
    imageSize: { value: '2K' }, selectedQuality: { value: 'high' },
    isPixmaxImage2Model: { value: false }, isMJModel: { value: false },
    enableGroupGeneration: { value: false }, maxGroupImages: { value: 1 },
    isSeedream50LiteModel: { value: false }, imageParameterQualityOptions: { value: [] },
    isBase64Image: url => url.startsWith('data:'), isBlobUrl: url => url.startsWith('blob:'),
    isValidUrl: url => url.startsWith('https:'),
    uploadBase64Images: async urls => urls.map(() => 'https://test/uploaded-square'),
    blobToServerUrlMap: new Map([['blob:test', 'https://test/uploaded-blob']]),
    ensureAccessibleUrls: async urls => urls,
    normalizePromptLineEndings: value => value || '',
    useTeamStore: () => ({ getSpaceParams: () => ({ spaceType: 'personal' }) }),
    getApiUrl: path => path, getHeaders: () => ({}),
    fetch: async (url, init) => {
      const body = JSON.parse(init.body)
      requests.push(body)
      return { ok: true, json: async () => body }
    }
  }
  const referenceBlock = source.slice(source.indexOf('const referenceImages = computed('), source.indexOf('const referenceVideos = computed('))
  const requestBlock = source.slice(source.indexOf('function getUpstreamImagesRealtime()'), source.indexOf('// 创建堆叠的输出节点'))
  const textApi = apiSource.slice(apiSource.indexOf('export async function generateImageFromText'), apiSource.indexOf('export async function generateImageFromImage')).replace('export ', '')
  const imageApi = apiSource.slice(apiSource.indexOf('export async function generateImageFromImage'), apiSource.indexOf('\nexport ', apiSource.indexOf('export async function generateImageFromImage') + 1)).replace('export ', '')
  const send = new Function(...Object.keys(dependencies), `${textApi}\n${imageApi}\n${referenceBlock}\n${requestBlock}\nreturn sendImageGenerateRequest`)(...Object.values(dependencies))
  return { send, props, requests, selectedAspectRatio }
}

test('smart ratio without input sends 3:4 to the generation API', async t => {
  const { send } = createHarness(t)
  assert.equal((await send('test')).aspect_ratio, '3:4')
})

test('smart ratio uses only menu options and follows reordered first image on repeated requests', async t => {
  const { send, props, selectedAspectRatio } = createHarness(t, ['https://test/portrait', 'https://test/landscape'])
  const first = await send('test')
  assert.equal(first.aspect_ratio, '3:4', '4:5 is not available in this model menu')
  assert.equal(first.aspect_ratio_mode, '3:4', 'the backend must keep the resolved menu ratio')
  props.data.imageOrder = ['https://test/landscape', 'https://test/portrait']
  const second = await send('test')
  assert.deepEqual(second.image, props.data.imageOrder)
  assert.equal(second.aspect_ratio, '16:9')
  props.data.imageOrder.reverse()
  assert.equal((await send('test')).aspect_ratio, '3:4')
  assert.equal(selectedAspectRatio.value, 'auto', 'keep smart mode selected for future requests')
})

test('uploading mixed reference formats preserves thumbnail order in API image list', async t => {
  const { send } = createHarness(t, ['https://test/landscape', 'data:image/png;base64,test', 'blob:test'])
  const body = await send('test')
  assert.deepEqual(body.image, ['https://test/landscape', 'https://test/uploaded-square', 'https://test/uploaded-blob'])
  assert.equal(body.aspect_ratio, '16:9')
})

test('reordering references changes the first image used by the request', async t => {
  const { send, props } = createHarness(t, ['https://test/portrait', 'https://test/landscape'])
  props.data.imageOrder = ['https://test/landscape', 'https://test/portrait']
  const body = await send('test')
  assert.deepEqual(body.image, props.data.imageOrder)
  assert.equal(body.aspect_ratio, '16:9')
})

test('failed dimension detection falls back to 3:4 and explicit ratio stays unchanged', async t => {
  const { send, selectedAspectRatio } = createHarness(t, ['https://test/unavailable'])
  assert.equal((await send('test')).aspect_ratio, '3:4')
  selectedAspectRatio.value = '1:1'
  assert.equal((await send('test')).aspect_ratio, '1:1')
})
