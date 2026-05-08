import test from 'node:test'
import assert from 'node:assert/strict'
import { computed } from 'vue'

globalThis.localStorage = {
  getItem() {
    return null
  },
  setItem() {},
  removeItem() {}
}

const tenant = await import('./tenant.js')

test('getModelIconChar returns first display character with English uppercased', () => {
  assert.equal(tenant.getModelIconChar('gpt image'), 'G')
  assert.equal(tenant.getModelIconChar('即梦 Seedream'), '即')
  assert.equal(tenant.getModelIconChar(''), '▶')
})

test('resolveModelIcon prefers configured icon and falls back to display name then key', () => {
  assert.equal(
    tenant.resolveModelIcon("OpenAI.Avatar.type={'platform'}", 'GPT Image 2', 'gpt-image-2'),
    "OpenAI.Avatar.type={'platform'}"
  )
  assert.equal(tenant.resolveModelIcon('', 'Gemini 3 Pro Image', 'gemini-image'), 'G')
  assert.equal(tenant.resolveModelIcon('', '', 'midjourney-v7'), 'M')
})

test('getAvailableImageModels propagates configured model icon', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'gpt-image-2',
        displayName: 'GPT Image 2',
        icon: "OpenAI.Avatar.type={'platform'}",
        enabled: true,
        pointsCost: 8,
        supportedModes: 'both'
      }
    ]
  })

  const models = tenant.getAvailableImageModels()
  assert.equal(models.length, 1)
  assert.equal(models[0].icon, "OpenAI.Avatar.type={'platform'}")
})

test('getAvailableImageModels falls back to display-name first character when icon is empty', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'seedream-5',
        displayName: '即梦 Seedream 5',
        icon: '',
        enabled: true,
        pointsCost: 5,
        supportedModes: 'both'
      }
    ]
  })

  const models = tenant.getAvailableImageModels()
  assert.equal(models.length, 1)
  assert.equal(models[0].icon, '即')
})

test('getAvailableLLMModels propagates configured model description', () => {
  tenant.updateRuntimeConfig({
    llm_models: [
      {
        id: 'gpt-5.2-thinking',
        name: 'GPT-5.2 Thinking',
        icon: "OpenAI.Avatar size={64} shape={'square'}",
        provider: 'openai',
        pointsCost: 3,
        description: '适合复杂推理和长上下文任务',
        enabled: true
      }
    ]
  })

  const models = tenant.getAvailableLLMModels()
  assert.equal(models.length, 1)
  assert.equal(models[0].description, '适合复杂推理和长上下文任务')
})

test('getAvailableImageModels reads updated model resolutionEnabled config', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'gpt-image-2-gr',
        displayName: 'GPT Image 2 GR',
        enabled: true,
        pointsCost: { '2k': 2, '3k': 3, '4k': 4 },
        resolutionEnabled: { '2k': false, '3k': false, '4k': false },
        supportedModes: 'both'
      }
    ]
  })

  const model = tenant.getAvailableImageModels().find(m => m.value === 'gpt-image-2-gr')
  assert.deepEqual(model.resolutionEnabled, { '2k': false, '3k': false, '4k': false })
})

test('tenant config version lets Vue computed values recompute after runtime config updates', () => {
  const configVersion = tenant.useTenantConfigVersion()

  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'gpt-image-2-gr',
        displayName: 'GPT Image 2 GR',
        enabled: true,
        pointsCost: { '2k': 2, '3k': 3, '4k': 4 },
        resolutionEnabled: { '2k': true, '3k': true, '4k': true },
        supportedModes: 'both'
      }
    ]
  })

  const modelResolutionEnabled = computed(() => {
    configVersion.value
    return tenant.getAvailableImageModels().find(m => m.value === 'gpt-image-2-gr')?.resolutionEnabled
  })

  assert.deepEqual(modelResolutionEnabled.value, { '2k': true, '3k': true, '4k': true })

  tenant.updateRuntimeConfig({
    image_models: [
      {
        name: 'gpt-image-2-gr',
        displayName: 'GPT Image 2 GR',
        enabled: true,
        pointsCost: { '2k': 2, '3k': 3, '4k': 4 },
        resolutionEnabled: { '2k': false, '3k': false, '4k': false },
        supportedModes: 'both'
      }
    ]
  })

  assert.deepEqual(modelResolutionEnabled.value, { '2k': false, '3k': false, '4k': false })
})
