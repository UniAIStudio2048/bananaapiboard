import assert from 'node:assert/strict'
import test from 'node:test'
import { getTaskStatusConfig } from './backgroundTaskConfig.js'

test('数字人口播与换口型任务使用独立状态接口，不改变普通视频任务', () => {
  assert.deepEqual(getTaskStatusConfig('digital-human-video'), {
    statusApi: 'digital-human-video', resultType: 'video', longRunning: true
  })
  assert.deepEqual(getTaskStatusConfig('video'), {
    statusApi: 'video', resultType: 'video', longRunning: true
  })
})
