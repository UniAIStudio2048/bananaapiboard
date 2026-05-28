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
    botType: 'creative'
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
  assert.equal(data.prompt, undefined)
  assert.equal(data.output, undefined)
  assert.equal(data.status, 'idle')
})
