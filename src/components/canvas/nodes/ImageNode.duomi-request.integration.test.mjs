import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const imageNodeSource = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../../../api/canvas/nodes.js', import.meta.url), 'utf8')

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0 && end > start, `${startMarker} not found`)
  return source.slice(start, end).replace(/^export /, '')
}

function createHarness({ imageSize, references }) {
  const requests = []
  const dependencies = {
    console: { log() {}, warn() {}, error() {} },
    referenceImages: { value: references },
    modelLookupList: { value: [{ value: 'gpt-image-2.5-flare', apiType: 'duomi-image' }] },
    selectedModel: { value: 'gpt-image-2.5-flare' },
    normalizeModelImageUrls: urls => urls,
    compressImagesIfNeeded: async urls => urls,
    selectedAspectRatio: { value: '1:1' },
    selectedPreset: { value: '' },
    availablePresets: { value: [] },
    imageSize: { value: imageSize },
    selectedQuality: { value: 'high' },
    isPixmaxImage2Model: { value: false },
    isMJModel: { value: false },
    enableGroupGeneration: { value: false },
    maxGroupImages: { value: 1 },
    isSeedream50LiteModel: { value: false },
    imageParameterQualityOptions: { value: [] },
    isBase64Image: url => url.startsWith('data:'),
    isBlobUrl: url => url.startsWith('blob:'),
    isValidUrl: url => url.startsWith('https:'),
    ensureAccessibleUrls: async urls => urls,
    normalizePromptLineEndings: value => value || '',
    useTeamStore: () => ({ getSpaceParams: () => ({ spaceType: 'personal' }) }),
    getApiUrl: path => path,
    getHeaders: () => ({}),
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) })
      return { ok: true, json: async () => ({ id: 'task-1' }) }
    }
  }
  const textApi = section(apiSource, 'export async function generateImageFromText', 'export async function generateImageFromImage')
  const imageApi = section(apiSource, 'export async function generateImageFromImage', '\nexport ')
  const request = section(imageNodeSource, 'function getUpstreamImagesRealtime()', '// 创建堆叠的输出节点')
  const send = new Function(...Object.keys(dependencies), `${textApi}\n${imageApi}\n${request}\nreturn sendImageGenerateRequest`)(...Object.values(dependencies))
  return { requests, send }
}

for (const imageSize of ['1K', '2K', '4K']) {
  for (const [mode, references] of [
    ['text-to-image', []],
    ['image-to-image', ['https://cdn.example/reference.png']]
  ]) {
    test(`${mode} sends the selected ${imageSize} Flare model settings`, async () => {
      const harness = createHarness({ imageSize, references })
      assert.deepEqual(await harness.send('draw a cup'), { id: 'task-1' })
      assert.equal(harness.requests.length, 1)
      const { url, method, body } = harness.requests[0]
      assert.equal(url, '/api/images/generate')
      assert.equal(method, 'POST')
      assert.equal(body.model, 'gpt-image-2.5-flare')
      assert.equal(body.image_size, imageSize)
      assert.equal(body.aspect_ratio, '1:1')
      assert.equal(body.prompt, 'draw a cup')
      assert.equal(body.spaceType, 'personal')
      if (references.length) assert.deepEqual(body.image, references)
      else {
        assert.equal(body.image, undefined)
        assert.equal(body.n, 1)
      }
    })
  }
}
