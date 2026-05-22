import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHistoryMediaDetails,
  formatHistoryBytes,
  formatHistoryTimestamp
} from './historyMediaDetails.js'

test('formats history timestamps to seconds', () => {
  const timestampMs = Date.UTC(2026, 4, 21, 4, 34, 56, 789)
  assert.equal(formatHistoryTimestamp(timestampMs), '2026/5/21 12:34:56')
  assert.equal(formatHistoryTimestamp(Math.floor(timestampMs / 1000)), '2026/5/21 12:34:56')
  assert.equal(formatHistoryTimestamp('2026-05-21T04:34:56.789Z'), '2026/5/21 12:34:56')
})

test('formats history file sizes', () => {
  assert.equal(formatHistoryBytes(1536), '1.5 KB')
  assert.equal(formatHistoryBytes(5 * 1024 * 1024), '5 MB')
  assert.equal(formatHistoryBytes(null), '')
})

test('builds image preview details with task id, model, times, resolution and file size', () => {
  const details = buildHistoryMediaDetails({
    id: 'img_1',
    type: 'image',
    model_display_name: 'Nano Banana 2',
    created_at: Date.UTC(2026, 4, 21, 4, 34, 56, 789),
    finished_at: Date.UTC(2026, 4, 21, 4, 35, 0),
    width: 1024,
    height: 1536,
    file_size: 2048
  })

  assert.deepEqual(details.map(item => [item.label, item.value]), [
    ['任务ID', 'img_1'],
    ['模型名称', 'Nano Banana 2'],
    ['提交时间', '2026/5/21 12:34:56'],
    ['完成时间', '2026/5/21 12:35:00'],
    ['分辨率', '1024 x 1536'],
    ['文件大小', '2 KB']
  ])
})

test('builds video preview details with fps and duration', () => {
  const details = buildHistoryMediaDetails({
    id: 'row_1',
    task_id: 'task_1',
    type: 'video',
    model: 'sora-2',
    created_at: '2026-05-21T04:34:56.000Z',
    finished_at: '2026-05-21T04:40:00.000Z',
    aspect_ratio: '16:9',
    duration: 8,
    fps: 24,
    file_size: 10 * 1024 * 1024
  }, { modelName: 'Sora 2' })

  assert.deepEqual(details.map(item => [item.label, item.value]), [
    ['任务ID', 'task_1'],
    ['模型名称', 'Sora 2'],
    ['提交时间', '2026/5/21 12:34:56'],
    ['完成时间', '2026/5/21 12:40:00'],
    ['分辨率', '16:9'],
    ['时长', '8s'],
    ['帧率', '24 fps'],
    ['文件大小', '10 MB']
  ])
})
