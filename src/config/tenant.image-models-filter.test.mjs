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

// 辅助：设置 image_models 并返回过滤后的模型 value 列表
const availableImageModelValues = (image_models) => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models
  })
  return tenant.getAvailableImageModels().map(m => m.value)
}

const grModel = (name, enabled = true) => ({
  name,
  displayName: name,
  apiType: 'gptimage2',
  actualModel: 'gpt-image-2',
  enabled,
  pointsCost: 8,
  supportedModes: 'both'
})

// === 纯函数 getDuplicateGptImage2Indexes ===

test('getDuplicateGptImage2Indexes 只有一条 gptimage2/gpt-image-2 时无重复索引', () => {
  const indexes = tenant.getDuplicateGptImage2Indexes([grModel('gpt-image-2-gr')])
  assert.deepEqual([...indexes], [])
})

test('getDuplicateGptImage2Indexes 两条已启用渠道只标记第二条为重复', () => {
  const indexes = tenant.getDuplicateGptImage2Indexes([
    grModel('gr-a'),
    grModel('gr-b')
  ])
  assert.deepEqual([...indexes], [1])
})

test('getDuplicateGptImage2Indexes 禁用的渠道不参与去重', () => {
  const indexes = tenant.getDuplicateGptImage2Indexes([
    grModel('gr-a', false),
    grModel('gr-b')
  ])
  assert.deepEqual([...indexes], [])
})

test('getDuplicateGptImage2Indexes 非 gptimage2 渠道不参与去重', () => {
  const indexes = tenant.getDuplicateGptImage2Indexes([
    { name: 'openai-gpt-image-2', apiType: 'openai', actualModel: 'gpt-image-2', enabled: true },
    grModel('gr')
  ])
  assert.deepEqual([...indexes], [])
})

// === 通过 getAvailableImageModels 验证整体过滤行为 ===

test('只有一条 gptimage2/gpt-image-2 且 enabled 时应显示（核心回归）', () => {
  const values = availableImageModelValues([grModel('gpt-image-2-gr')])
  assert.deepEqual(values, ['gpt-image-2-gr'])
})

test('两条 gptimage2/gpt-image-2 都 enabled 时只显示第一条', () => {
  const values = availableImageModelValues([
    grModel('gr-first'),
    grModel('gr-second')
  ])
  assert.deepEqual(values, ['gr-first'])
})

test('gptimage2 + openai 旧渠道并存时保留 gptimage2，隐藏 openai', () => {
  const values = availableImageModelValues([
    grModel('gr'),
    { name: 'openai-gpt-image-2', displayName: 'OpenAI GPT Image 2', apiType: 'openai', actualModel: 'gpt-image-2', enabled: true, pointsCost: 8, supportedModes: 'both' }
  ])
  assert.deepEqual(values, ['gr'])
})

test('gptimage2 但 enabled=false 时应被隐藏', () => {
  const values = availableImageModelValues([
    { name: 'nano-banana', displayName: 'Nano Banana', enabled: true, pointsCost: 1, supportedModes: 'both' },
    grModel('gr-disabled', false)
  ])
  assert.deepEqual(values, ['nano-banana'])
})
