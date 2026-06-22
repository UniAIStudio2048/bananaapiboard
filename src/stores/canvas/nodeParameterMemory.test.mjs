import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildNodeDataWithRememberedParameters,
  getRememberableNodeParameters
} from './nodeParameterMemory.js'

test('remembers safe image generation parameters without carrying content or output', () => {
  const previous = {
    id: 'old-image',
    type: 'image-input',
    data: {
      model: 'seedream-4',
      aspectRatio: '9:16',
      resolution: '2048',
      imageSize: '3K',
      count: 4,
      botType: 'creative',
      cameraControlEnabled: true,
      cameraSettings: {
        camera: 'arri-alexa-35',
        cameraName: 'ARRI Alexa 35',
        prompt: 'shot on ARRI Alexa 35'
      },
      cameraPrompt: 'shot on ARRI Alexa 35',
      prompt: 'old prompt',
      sourceImages: ['https://example.com/old.png'],
      output: { urls: ['https://example.com/result.png'] },
      status: 'success',
      taskId: 'task-old'
    }
  }

  assert.deepEqual(getRememberableNodeParameters(previous), {
    model: 'seedream-4',
    aspectRatio: '9:16',
    resolution: '2048',
    imageSize: '3K',
    count: 4,
    botType: 'creative',
    cameraControlEnabled: true,
    cameraSettings: {
      camera: 'arri-alexa-35',
      cameraName: 'ARRI Alexa 35',
      prompt: 'shot on ARRI Alexa 35'
    },
    cameraPrompt: 'shot on ARRI Alexa 35'
  })
})

test('explicit new node data wins over remembered parameters', () => {
  const data = buildNodeDataWithRememberedParameters({
    type: 'image-input',
    baseData: {
      title: '图片生成',
      status: 'idle',
      aspectRatio: '16:9'
    },
    nodes: [
      {
        id: 'old-image',
        type: 'image-input',
        data: {
          model: 'seedream-4',
          aspectRatio: '9:16',
          imageSize: '3K'
        }
      }
    ]
  })

  assert.equal(data.model, 'seedream-4')
  assert.equal(data.imageSize, '3K')
  assert.equal(data.aspectRatio, '16:9')
  assert.equal(data.status, 'idle')
})

test('remembers video parameters from the most recent matching node only', () => {
  const data = buildNodeDataWithRememberedParameters({
    type: 'video',
    baseData: { title: '视频生成', status: 'idle' },
    nodes: [
      {
        id: 'older-video',
        type: 'video',
        data: {
          model: 'old-model',
          aspectRatio: '1:1',
          duration: 5,
          prompt: 'do not copy'
        }
      },
      {
        id: 'latest-image',
        type: 'image-input',
        data: {
          model: 'image-model',
          aspectRatio: '4:3'
        }
      },
      {
        id: 'latest-video',
        type: 'video',
        data: {
          model: 'seedance-video',
          aspectRatio: '9:16',
          duration: 10,
          count: 2,
          generationMode: 'image',
          viduResolution: '720p',
          veoMode: 'fast',
          veoResolution: '1080p',
          viduMode: 'start-end',
          klingO1Mode: 'video_edit',
          omniKeepSound: 'no',
          klingV3OmniMode: 'video_reference',
          v3OmniKeepSound: 'yes',
          wanMode: 'r2v',
          output: { url: 'https://example.com/video.mp4' },
          status: 'success'
        }
      }
    ]
  })

  assert.equal(data.model, 'seedance-video')
  assert.equal(data.aspectRatio, '9:16')
  assert.equal(data.duration, 10)
  assert.equal(data.count, 2)
  assert.equal(data.generationMode, 'image')
  assert.equal(data.viduResolution, '720p')
  assert.equal(data.veoMode, 'fast')
  assert.equal(data.veoResolution, '1080p')
  assert.equal(data.viduMode, 'start-end')
  assert.equal(data.klingO1Mode, 'video_edit')
  assert.equal(data.omniKeepSound, 'no')
  assert.equal(data.klingV3OmniMode, 'video_reference')
  assert.equal(data.v3OmniKeepSound, 'yes')
  assert.equal(data.wanMode, 'r2v')
  assert.equal(data.prompt, undefined)
  assert.equal(data.output, undefined)
  assert.equal(data.status, 'idle')
})

test('remembers text model and language parameters without carrying prompt text', () => {
  const previous = {
    id: 'old-text',
    type: 'text-input',
    data: {
      model: 'gpt-4o',
      language: 'en',
      preset: 'translate',
      llmInputText: 'do not copy',
      output: { content: 'old response' }
    }
  }

  assert.deepEqual(getRememberableNodeParameters(previous), {
    model: 'gpt-4o',
    language: 'en',
    preset: 'translate'
  })
})

test('remembers audio selection parameters without carrying prompt text', () => {
  const previous = {
    id: 'old-audio',
    type: 'audio-input',
    data: {
      model: 'legacy-audio',
      musicModel: 'chirp-v4',
      customMode: true,
      makeInstrumental: true,
      voice: 'voice-1',
      duration: 120,
      musicPrompt: 'do not copy'
    }
  }

  assert.deepEqual(getRememberableNodeParameters(previous), {
    model: 'legacy-audio',
    musicModel: 'chirp-v4',
    customMode: true,
    makeInstrumental: true,
    voice: 'voice-1',
    duration: 120
  })
})
