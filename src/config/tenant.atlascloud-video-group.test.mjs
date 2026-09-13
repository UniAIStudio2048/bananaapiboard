import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// tenant.js 顶部用 Vite 别名 @/ 导入 src/utils，普通 node 无法解析该别名。
// 这里在加载 tenant.js 前注册一个最小别名解析 hook（仅 @/ -> <项目根>/src/），
// 让本回归测试可以脱离 Vite 直接用 node 运行。
const projectRoot = new URL('../../', import.meta.url)
const aliasLoader = `
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = new URL('./src/' + specifier.slice(2), ${JSON.stringify(projectRoot.href)})
    let url = base.href
    if (!existsSync(fileURLToPath(base))) {
      url = new URL(base.pathname + '.js', base).href
    }
    return { url, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
`
register('data:text/javascript,' + encodeURIComponent(aliasLoader), projectRoot)

globalThis.localStorage = {
  getItem() {
    return null
  },
  setItem() {},
  removeItem() {}
}

const tenant = await import('./tenant.js')

// 与生产租户配置同构的夹具：atlascloud 模型的渠道用 ['t2v'] / ['i2v'] 标注模式
const atlasChannel = (id, actualModel, modes) => ({
  id,
  apiKey: 'key',
  apiBase: 'https://api.atlascloud.ai',
  apiPath: '/api/v1/model/generateVideo',
  apiType: 'atlascloud-video-t2v',
  enabled: true,
  priority: 1,
  queryPath: '/api/v1/model/prediction',
  actualModel,
  supportedModes: modes
})

const atlasModel = (name, channels, supportedModes = ['t2v']) => ({
  id: name,
  icon: '',
  name,
  apiKey: 'key',
  apiBase: 'https://api.atlascloud.ai',
  apiPath: '/api/v1/model/generateVideo',
  apiType: 'atlascloud-video-t2v',
  enabled: true,
  channels,
  provider: 'atlascloud',
  durations: ['8'],
  pointsCost: { '8': 100 },
  actualModel: channels[0]?.actualModel || 'minimax/h3/text-to-video',
  displayName: name,
  canvas_exposed: true,
  supportedModes,
  defaultVideoMode: 't2v'
})

const VIDEO_GROUPS = [
  { id: 'g-minimax', logo: '', name: 'Minimax H3', models: ['minimax-h3-metaso', 'atlascloud-h3-t2v', 'atlascloud-h3-t2v-copy'] },
  { id: 'g-bytedance', logo: '', name: '字节跳动', models: ['seedance-2.5'] }
]

const runWith = (video_models) => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { video: {} },
    modelPricing: { video: {} },
    video_models,
    video_model_groups: VIDEO_GROUPS
  })
  return tenant.getAvailableVideoModels({ disableVeoMerge: true })
}

const t2vChannel = atlasChannel('atlascloud-h3-t2v-default', 'minimax/h3/text-to-video', ['t2v'])
const i2vFirstChannel = atlasChannel('video-channel-i2v', 'minimax/h3/image-to-video', ['i2v'])
const i2vRefChannel = atlasChannel('video-channel-r2v', 'minimax/h3/reference-to-video', ['i2v'])

test('同渠道的独立模型保留后台 ID、名称、顺序和各自配置', () => {
  const configured = [
    { ...atlasModel('minimax-h3-metaso', [], ['t2v', 'i2v']), apiType: 'minimax-h3', displayName: 'MiniMax H3' },
    { ...atlasModel('atlascloud-h3-t2v', [t2vChannel, i2vFirstChannel]), displayName: 'minimax H3', pointsCost: { '8': 43 } },
    { ...atlasModel('atlascloud-h3-t2v-copy', [t2vChannel, i2vRefChannel]), displayName: 'minimax H3 (副本)', pointsCost: { '8': 86 } }
  ]
  const models = runWith(configured)
  assert.equal(models.length, 3)
  assert.deepEqual(models.map(m => m.value), configured.map(m => m.name))
  assert.deepEqual(models.map(m => m.label), configured.map(m => m.displayName))
  assert.ok(models.every(m => m.groupName === 'Minimax H3'))
  for (const [index, model] of models.entries()) {
    assert.equal(tenant.getAvailableVideoModels({ disableVeoMerge: true })[index].value, model.value)
    if (index === 0) continue
    assert.deepEqual(model.channels, configured[index].channels)
    assert.deepEqual(model.pointsCost, configured[index].pointsCost)
    assert.equal(model.actualModel, configured[index].actualModel)
    assert.ok(model.supportedModes.includes('i2v'), '连接图片后仍可选择每个模型')
  }
})

test('公开配置无 channels 时仍按后台名称展示两个独立 AtlasCloud 模型', () => {
  const configured = ['atlascloud-h3-t2v', 'atlascloud-h3-t2v-copy'].map((name, index) => ({
    ...atlasModel(name, [], ['t2v', 'i2v']), channels: undefined, displayName: `自定义模型 ${index + 1}`
  }))
  const models = runWith(configured)
  assert.deepEqual(models.map(m => [m.value, m.label]), configured.map(m => [m.name, m.displayName]))
  assert.ok(models.every(m => m.supportedModes.includes('i2v')))
})

test('atlascloud 模型各自归属到后台配置的分组', () => {
  const models = runWith([
    atlasModel('atlascloud-h3-t2v', [t2vChannel, i2vFirstChannel, i2vRefChannel]),
    atlasModel('atlascloud-h3-t2v-copy', [t2vChannel, i2vFirstChannel])
  ])
  const atlas = models.filter(m => String(m.apiType || '').startsWith('atlascloud-video'))
  assert.equal(atlas.length, 2)
  assert.equal(atlas[0].value, 'atlascloud-h3-t2v')
  assert.equal(atlas[0].groupName, 'Minimax H3')
  assert.equal(atlas[1].value, 'atlascloud-h3-t2v-copy')
  assert.equal(atlas[1].groupName, 'Minimax H3')
})

test('核心回归：自身渠道含 i2v 时顶层 supportedModes 聚合 i2v=true（有图状态不被画布过滤）', () => {
  const models = runWith([
    atlasModel('atlascloud-h3-t2v', [t2vChannel, i2vFirstChannel, i2vRefChannel])
  ])
  const atlas = models.find(m => String(m.apiType || '').startsWith('atlascloud-video'))
  const modes = atlas.supportedModes
  const supports = mode => Array.isArray(modes) ? modes.includes(mode) : modes?.[mode] === true
  assert.equal(supports('t2v'), true, '应有 t2v（文生渠道存在）')
  assert.equal(supports('i2v'), true, '应有 i2v（图生/参考渠道存在），否则画布连接参考图后整个入口消失')
})

test('自身渠道只有 t2v 时不从其他模型借用 i2v 能力', () => {
  const models = runWith([
    atlasModel('atlascloud-h3-t2v', [t2vChannel]),
    atlasModel('atlascloud-h3-t2v-copy', [i2vFirstChannel])
  ])
  const atlas = models.find(m => String(m.apiType || '').startsWith('atlascloud-video'))
  const modes = atlas.supportedModes
  const supports = mode => Array.isArray(modes) ? modes.includes(mode) : modes?.[mode] === true
  assert.equal(supports('t2v'), true)
  assert.equal(supports('i2v'), false)
})

test('minimaxConfig.supportedModes 按渠道 t2v/i2v 标注聚合（键与后端渠道路由对齐）', () => {
  const models = runWith([
    atlasModel('atlascloud-h3-t2v', [t2vChannel, i2vFirstChannel, i2vRefChannel])
  ])
  const atlas = models.find(m => String(m.apiType || '').startsWith('atlascloud-video'))
  const supported = atlas.minimaxConfig?.supportedModes || {}
  assert.equal(supported.text2video, true, 't2v 渠道应点亮文生视频模式')
  assert.equal(supported.image2video_first, true, 'i2v 渠道应点亮首帧模式')
  assert.equal(supported.multimodal_ref, true, 'i2v 渠道应点亮多模态参考模式')
})

test('禁用的 atlascloud 模型不展示且不影响其他模型的渠道', () => {
  const models = runWith([
    atlasModel('atlascloud-h3-t2v', [t2vChannel]),
    { ...atlasModel('atlascloud-h3-t2v-copy', [i2vFirstChannel]), enabled: false }
  ])
  const atlas = models.find(m => String(m.apiType || '').startsWith('atlascloud-video'))
  const channelIds = (atlas.channels || []).map(c => c.id)
  assert.deepEqual(channelIds, ['atlascloud-h3-t2v-default'])
})

test('契约回归：brand-config 公开数据无 channels、顶层已聚合渠道能力时，入口含 i2v（连图可见）', () => {
  // 公开接口剥掉 channels（含密钥），后端把渠道 t2v/i2v 聚合进顶层 supportedModes 下发。
  // 前端合并块以模型自身兜底渠道，须从聚合后的顶层能力推出 entryModes 含 i2v。
  const publicModel = {
    ...atlasModel('atlascloud-h3-t2v', [], ['t2v', 'i2v']),
    channels: undefined
  }
  const models = runWith([publicModel])
  const atlas = models.find(m => String(m.apiType || '').startsWith('atlascloud-video'))
  const modes = atlas.supportedModes
  const supports = mode => Array.isArray(modes) ? modes.includes(mode) : modes?.[mode] === true
  assert.equal(supports('t2v'), true)
  assert.equal(supports('i2v'), true, '公开数据（无渠道、顶层聚合）下入口必须保留 i2v，否则画布连图即消失')
  const mm = atlas.minimaxConfig?.supportedModes || {}
  assert.equal(mm.text2video, true)
  assert.equal(mm.image2video_first, true)
  assert.equal(mm.multimodal_ref, true)
})
