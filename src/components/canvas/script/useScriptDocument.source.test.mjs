import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./useScriptDocument.js', import.meta.url), 'utf8')
const createSourceCode = source.slice(source.indexOf('  async function createSource('), source.indexOf('  async function syncMedia('))

function setup(nodes, sourceText = '') {
  const document = { value: { sourceText, shots: [], referenceImages: [] } }
  const error = { value: '' }, saves = []
  const store = {
    nodes: [{ id: 'script', type: 'script', position: { x: 500, y: 0 } }, ...nodes],
    edges: nodes.map(node => ({ source: node.id, target: 'script' }))
  }
  const createSource = runInNewContext(`${createSourceCode}\ncreateSource`, {
    document, error, store, nodeId: 'script',
    save: async () => { saves.push(JSON.parse(JSON.stringify(document.value))) },
    connectNode: async () => { throw new Error('Existing upstream text must be used') }
  })
  return { document, error, saves, createSource }
}

for (const entry of ['story', 'character']) {
  test(`${entry}: import the displayed upstream response instead of its generation prompt`, async () => {
    const story = '《霓虹心跳》\n人物：林晓雯、陈墨\n【场景】深夜咖啡馆。'
    const fixture = setup([{ id: 'text', type: 'text-input', data: { text: '生成一段都市爱情短剧剧本', llmResponse: story } }])
    await fixture.createSource(entry)
    assert.equal(fixture.error.value, '')
    assert.equal(fixture.document.value.sourceText, story)
    assert.equal(fixture.saves[0].sourceText, story)
  })
}

test('rereading input connections replaces the previously imported prompt with the latest response', async () => {
  const node = { id: 'text', type: 'text-input', data: { text: '生成剧本', llmResponse: '第一版正文' } }
  const fixture = setup([node], node.data.text)
  await fixture.createSource('story')
  node.data.llmResponse = '修改后的正文'
  await fixture.createSource('story')
  assert.equal(fixture.error.value, '')
  assert.equal(fixture.saves[0].sourceText, '第一版正文')
  assert.equal(fixture.saves[1].sourceText, '修改后的正文')
})

test('preserves handwritten text, connection order and reference images', async () => {
  const fixture = setup([
    { id: 'manual', type: 'text-input', data: { text: '手写正文', llmResponse: '' } },
    { id: 'generated', type: 'text-input', data: { text: '生成提示词', llmResponse: '生成正文' } },
    { id: 'image', type: 'image', data: { imageUrl: 'https://example.com/reference.png' } }
  ])
  await fixture.createSource('story')
  assert.equal(fixture.error.value, '')
  assert.equal(fixture.saves[0].sourceText, '手写正文\n\n生成正文')
  assert.deepEqual(fixture.saves[0].referenceImages, ['https://example.com/reference.png'])
})
