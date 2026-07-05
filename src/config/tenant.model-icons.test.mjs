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

test('getAvailableLLMModels propagates configured model capabilities', () => {
  tenant.updateRuntimeConfig({
    llm_models: [
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        icon: '',
        provider: 'google',
        pointsCost: 2,
        capabilities: {
          image: true,
          video: true,
          audio: false,
          webSearch: true,
          file: true
        },
        enabled: true
      }
    ]
  })

  const models = tenant.getAvailableLLMModels()
  assert.equal(models.length, 1)
  assert.deepEqual(models[0].capabilities, {
    image: true,
    video: true,
    audio: false,
    webSearch: true,
    file: true
  })
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

test('getAvailableImageModels propagates configured image aspect ratios', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'RH_youchuan_v81',
        displayName: 'RH Youchuan V81',
        enabled: true,
        apiType: 'runninghub-youchuan-v81',
        pointsCost: { '1k': 3, '2k': 5 },
        resolutionEnabled: { '1k': true, '2k': true, '4k': false },
        aspectRatios: ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16'],
        supportedModes: 'both'
      }
    ]
  })

  const model = tenant.getAvailableImageModels().find(m => m.value === 'RH_youchuan_v81')
  assert.deepEqual(
    model.aspectRatios,
    ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16']
  )
})

test('getAvailableImageModels normalizes image supportedModes aliases and object config', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'text-only',
        displayName: 'Text Only',
        enabled: true,
        supportedModes: ['text-to-image']
      },
      {
        name: 'image-only',
        displayName: 'Image Only',
        enabled: true,
        supportedModes: { textToImage: false, imageToImage: true }
      },
      {
        name: 'both-model',
        displayName: 'Both Model',
        enabled: true,
        supportedModes: 'txt2img,img2img'
      }
    ]
  })

  assert.deepEqual(
    tenant.getAvailableImageModels('t2i').map(m => m.value),
    ['text-only', 'both-model']
  )
  assert.deepEqual(
    tenant.getAvailableImageModels('i2i').map(m => m.value),
    ['image-only', 'both-model']
  )
})

test('getAvailableImageModels keeps dropdown populated when mode filtering removes every configured model', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'tenant-i2i-only',
        displayName: 'Tenant I2I Only',
        enabled: true,
        supportedModes: 'i2i'
      }
    ]
  })

  const models = tenant.getAvailableImageModels('t2i')
  assert.deepEqual(models.map(m => m.value), ['tenant-i2i-only'])
  assert.equal(models[0].modeFallback, true)
})

test('getAvailableVideoModels keeps VectorEngine Grok JSON model out of VEO merge', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    video_models: [
      {
        name: 'grok-imagine-video-1.5-preview',
        displayName: 'Grok Imagine Video 1.5 Preview',
        enabled: true,
        apiType: 'vectorengine',
        actualModel: 'grok-imagine-video-1.5-preview',
        vectorengineConfig: {
          model: 'grok-imagine-video-1.5-preview',
          format: 'openai-json',
          resolution: '480p',
          resolutions: ['480p', '720p']
        },
        resolutionOptions: ['480p', '720p'],
        pointsCost: { '4': 40 },
        hasDurationPricing: true,
        durations: [4],
        aspectRatios: ['16:9'],
        supportedModes: ['i2v'],
        defaultVideoMode: 'i2v',
        isImageToVideo: true
      }
    ]
  })

  const models = tenant.getAvailableVideoModels()
  const grokModel = models.find(m => m.value === 'grok-imagine-video-1.5-preview')

  assert.ok(grokModel)
  assert.equal(grokModel.apiType, 'vectorengine')
  assert.equal(grokModel.actualModel, 'grok-imagine-video-1.5-preview')
  assert.equal(grokModel.isVeoModel, undefined)
  assert.deepEqual(grokModel.supportedModes, ['i2v'])
  assert.deepEqual(grokModel.vectorengineConfig, {
    model: 'grok-imagine-video-1.5-preview',
    format: 'openai-json',
    resolution: '480p',
    resolutions: ['480p', '720p']
  })
  assert.deepEqual(grokModel.resolutionOptions, ['480p', '720p'])
  assert.equal(models.some(m => m.value === 'veo3'), false)
})

test('getAvailableVideoModels keeps Kling v3 Omni variants split by configured model id and price', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    video_models: [
      {
        name: 'kling-v3-omni-fast',
        displayName: 'Kling v3 Omni 720p',
        enabled: true,
        apiType: 'kling-v3-omni',
        pointsCost: { '6': 66, '10': 110 },
        costPerSecond: 11,
        durations: ['6', '10'],
        klingConfig: { quality: 'std', mode: 'std' }
      },
      {
        name: 'kling-v3-omni-pro',
        displayName: '可灵 v3 Omni 1080P',
        enabled: true,
        apiType: 'kling-v3-omni',
        pointsCost: { '6': 90, '10': 150 },
        costPerSecond: 15,
        durations: ['6', '10'],
        klingConfig: { quality: 'pro', mode: 'pro' }
      },
      {
        name: 'kling-v3-omni-4k',
        displayName: '可灵 v3 Omni 4K版',
        enabled: true,
        apiType: 'kling-v3-omni',
        pointsCost: { '6': 216, '10': 360 },
        costPerSecond: 36,
        durations: ['6', '10'],
        klingConfig: { quality: '4k', mode: '4k' }
      }
    ],
    video_model_groups: [
      {
        name: 'kling',
        models: ['kling-v3-omni-fast', 'kling-v3-omni-pro', 'kling-v3-omni-4k']
      }
    ]
  })

  const models = tenant.getAvailableVideoModels()
  assert.deepEqual(
    models.filter(m => m.apiType === 'kling-v3-omni').map(m => m.value),
    ['kling-v3-omni-fast', 'kling-v3-omni-pro', 'kling-v3-omni-4k']
  )
  assert.equal(models.some(m => m.value === 'klingV3Omni'), false)
  assert.deepEqual(models.find(m => m.value === 'kling-v3-omni-fast')?.pointsCost, { '6': 66, '10': 110 })
  assert.deepEqual(models.find(m => m.value === 'kling-v3-omni-pro')?.pointsCost, { '6': 90, '10': 150 })
  assert.deepEqual(models.find(m => m.value === 'kling-v3-omni-4k')?.pointsCost, { '6': 216, '10': 360 })
  assert.equal(models.find(m => m.value === 'kling-v3-omni-4k')?.klingConfig?.quality, '4k')
})

test('getAvailableImageModels merges entitlements and hides private unavailable models', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'locked-image',
        displayName: 'Locked Image',
        enabled: true,
        supportedModes: 'both'
      },
      {
        name: 'private-image',
        displayName: 'Private Image',
        enabled: true,
        supportedModes: 'both'
      }
    ],
    modelEntitlements: {
      image: {
        'locked-image': {
          visible: true,
          usable: false,
          reason: 'package_required',
          message: '需要购买 Pro 套餐',
          requiredPackage: { type: 'pro', level: 2, name: 'Pro' }
        },
        'private-image': {
          visible: false,
          usable: false,
          reason: 'private_package_required'
        }
      },
      video: {}
    }
  })

  const models = tenant.getAvailableImageModels()
  assert.deepEqual(models.map(m => m.value), ['locked-image'])
  assert.equal(models[0].usable, false)
  assert.equal(models[0].disabled, true)
  assert.equal(models[0].accessReason, 'package_required')
  assert.equal(models[0].accessMessage, '需要购买 Pro 套餐')
  assert.deepEqual(models[0].requiredPackage, { type: 'pro', level: 2, name: 'Pro' })
})

test('getAvailableImageModels falls back to model package gates when entitlements are not loaded', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'locked-image-fallback',
        displayName: 'Locked Image Fallback',
        enabled: true,
        supportedModes: 'both',
        packageAccessMode: 'public_locked',
        requiredPackageType: 'pro',
        requiredPackageLevel: 2
      },
      {
        name: 'private-image-fallback',
        displayName: 'Private Image Fallback',
        enabled: true,
        supportedModes: 'both',
        packageAccessMode: 'private_hidden',
        requiredPackageType: 'vip',
        requiredPackageLevel: 3
      },
      {
        name: 'assigned-image-fallback',
        displayName: 'Assigned Image Fallback',
        enabled: true,
        supportedModes: 'both',
        packageAccessMode: 'private_assigned',
        requiredPackageType: 'vip',
        requiredPackageLevel: 3
      }
    ],
    modelEntitlements: { image: {}, video: {} }
  })

  const models = tenant.getAvailableImageModels()
  assert.deepEqual(models.map(m => m.value), ['locked-image-fallback'])
  assert.equal(models[0].usable, false)
  assert.equal(models[0].disabled, true)
  assert.equal(models[0].accessReason, 'package_required')
})

test('getAvailableImageModels treats access mode without package requirement as ungated', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    image_models: [
      {
        name: 'legacy-access-mode-only',
        displayName: 'Legacy Access Mode Only',
        enabled: true,
        supportedModes: 'both',
        packageAccessMode: 'private_hidden'
      }
    ],
    modelEntitlements: { image: {}, video: {} }
  })

  const models = tenant.getAvailableImageModels()
  assert.deepEqual(models.map(m => m.value), ['legacy-access-mode-only'])
  assert.equal(models[0].usable, true)
  assert.equal(models[0].disabled, false)
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

test('getAvailableVideoModels merges entitlements and hides private unavailable models', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    video_models: [
      {
        name: 'locked-video',
        displayName: 'Locked Video',
        enabled: true,
        apiType: 'wan',
        pointsCost: 20,
        durations: ['5']
      },
      {
        name: 'private-video',
        displayName: 'Private Video',
        enabled: true,
        apiType: 'wan',
        pointsCost: 30,
        durations: ['5']
      }
    ],
    modelEntitlements: {
      image: {},
      video: {
        'locked-video': {
          visible: true,
          usable: false,
          reason: 'package_required',
          message: '需要购买 Pro 套餐',
          requiredPackage: { type: 'pro', level: 2, name: 'Pro' }
        },
        'private-video': {
          visible: false,
          usable: false,
          reason: 'private_package_required'
        }
      }
    }
  })

  const models = tenant.getAvailableVideoModels()
  assert.equal(models.some(m => m.value === 'private-video'), false)
  const lockedModel = models.find(m => m.value === 'locked-video')
  assert.ok(lockedModel)
  assert.equal(lockedModel.usable, false)
  assert.equal(lockedModel.disabled, true)
  assert.equal(lockedModel.accessReason, 'package_required')
  assert.equal(lockedModel.accessMessage, '需要购买 Pro 套餐')
  assert.deepEqual(lockedModel.requiredPackage, { type: 'pro', level: 2, name: 'Pro' })
})

test('getAvailableVideoModels applies entitlements to default fallback models', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    video_models: [],
    modelEntitlements: {
      image: {},
      video: {
        veo3: {
          visible: false,
          usable: false,
          reason: 'private_package_required'
        },
        sora2: {
          visible: true,
          usable: false,
          reason: 'package_required',
          message: '需要购买 Sora 套餐'
        }
      }
    }
  })

  const models = tenant.getAvailableVideoModels()
  assert.equal(models.some(m => m.value === 'veo3'), false)
  const sora = models.find(m => m.value === 'sora2')
  assert.ok(sora)
  assert.equal(sora.usable, false)
  assert.equal(sora.disabled, true)
  assert.equal(sora.accessMessage, '需要购买 Sora 套餐')
})

test('getAvailableVideoModels falls back to model package gates when entitlements are not loaded', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    video_models: [
      {
        name: 'locked-video-fallback',
        displayName: 'Locked Video Fallback',
        enabled: true,
        apiType: 'wan',
        pointsCost: 20,
        durations: ['5'],
        packageAccessMode: 'public_locked',
        requiredPackageType: 'pro',
        requiredPackageLevel: 2
      },
      {
        name: 'private-video-fallback',
        displayName: 'Private Video Fallback',
        enabled: true,
        apiType: 'wan',
        pointsCost: 30,
        durations: ['5'],
        packageAccessMode: 'private_hidden',
        requiredPackageType: 'vip',
        requiredPackageLevel: 3
      },
      {
        name: 'assigned-video-fallback',
        displayName: 'Assigned Video Fallback',
        enabled: true,
        apiType: 'wan',
        pointsCost: 30,
        durations: ['5'],
        packageAccessMode: 'private_assigned',
        requiredPackageType: 'vip',
        requiredPackageLevel: 3
      }
    ],
    modelEntitlements: { image: {}, video: {} }
  })

  const models = tenant.getAvailableVideoModels()
  assert.equal(models.some(m => m.value === 'private-video-fallback'), false)
  assert.equal(models.some(m => m.value === 'assigned-video-fallback'), false)
  const locked = models.find(m => m.value === 'locked-video-fallback')
  assert.ok(locked)
  assert.equal(locked.usable, false)
  assert.equal(locked.disabled, true)
  assert.equal(locked.accessReason, 'package_required')
})

test('getAvailableVideoModels filters unsupported 3 second Bytefor duration pricing', () => {
  tenant.updateRuntimeConfig({
    modelNames: { image: {}, video: {} },
    modelEnabled: { image: {}, video: {} },
    modelDescriptions: { image: {}, video: {} },
    modelPricing: { image: {}, video: {} },
    video_models: [
      {
        name: 'bytefor-seedance-2.0',
        displayName: 'Bytefor Seedance 2.0',
        enabled: true,
        apiType: 'bytefor',
        pointsCost: { '3': 30, '4': 40, '5': 50 },
        durations: ['3', '4', '5']
      }
    ]
  })

  const model = tenant.getAvailableVideoModels().find(m => m.value === 'bytefor-seedance-2.0')
  assert.deepEqual(model.durations, ['4', '5'])
  assert.deepEqual(model.pointsCost, { '4': 40, '5': 50 })
})
