import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./banana-adapter.js', import.meta.url), 'utf8')
const declaration = parse(source, { sourceType: 'module' }).program.body.find(node => node.declaration?.id?.name === 'createBananaEditorLibrary').declaration
function fixture(overrides = {}) {
  const calls = []
  const context = {
    URLSearchParams,
    request: async path => { const params = Object.fromEntries(new URLSearchParams(path.split('?')[1])); calls.push(params); return { assets: [{ type: params.type === 'all' ? 'image' : params.type, url: '/uploads/asset.png', name: '素材' }], total: 65 } },
    getHistory: async params => { calls.push(params); return { history: [{ id: 'same-id', type: 'image', url: '/image.png' }, { id: 'same-id', type: 'video', url: '/video.mp4' }] } },
    useTeamStore: () => ({ getSpaceParams: scope => ({ spaceType: scope, teamId: scope === 'team' ? 'team-a' : null }) }),
    ...overrides
  }
  const create = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, context)
  return { library: create(), calls }
}

test('资产筛选传给平台 API，翻页保留类型和团队范围', async () => {
  const { library, calls } = fixture()
  await library.loadFolders('team')
  await library.loadAssetPage(1, 'video')
  await library.loadAssetPage(2)
  assert.equal(calls.at(-1).type, 'video')
  assert.equal(calls.at(-1).page, '2')
  assert.equal(calls.at(-1).space, 'team')
  assert.equal(library.getSnapshot().assets.items[0].type, 'video')
  assert.equal(library.getSnapshot().assets.total, 65)
})

test('历史记录先按类型筛选再分页，跨媒体相同 ID 不会打开错误素材', async () => {
  const { library, calls } = fixture()
  await library.loadHistoryPage(1, 'all')
  const all = library.getSnapshot().history.items
  assert.notEqual(all[0].task_uuid, all[1].task_uuid)
  await library.loadHistoryTask(all[1].task_uuid)
  assert.equal(library.getSnapshot().tasks[0].resources[0].uuid, '/video.mp4')
  await library.loadHistoryPage(1, 'video')
  assert.equal(calls.at(-1).type, 'video')
  assert.equal(library.getSnapshot().history.total, 1)
  assert.equal(library.getSnapshot().history.items[0].modality, 'video')
})

test('晚到的旧请求不覆盖切换空间后的新素材页', async () => {
  let resolveOld
  const { library } = fixture({ request: path => path.includes('space=personal') ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve({ assets: [{ url: '/team.mp4', type: 'video' }], total: 1 }) })
  const first = library.loadFolders('personal')
  await library.loadFolders('team')
  resolveOld({ assets: [{ url: '/personal.png', type: 'image' }], total: 1 })
  await first
  assert.equal(library.getSnapshot().folderScope, 'team')
  assert.equal(library.getSnapshot().assets.items[0].uuid, '/team.mp4')
})
