import { localizedPattern } from '../../i18n/sourceAssertions.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./DigitalHumanPanel.vue', import.meta.url), 'utf8')

test('数字人训练面板展示所选渠道的图片或视频训练积分', () => {
  assert.match(source, /const trainingPointsCost = computed\(/)
  assert.match(source, /photoAvatarTraining/)
  assert.match(source, /digitalTwinTraining/)
  assert.match(source, localizedPattern(/本次训练将消耗/))
})

test('图片和视频数字人训练在扣费前要求用户确认', () => {
  assert.match(source, /import \{ showConfirm, showToast \} from '@\/composables\/useCanvasDialog'/)
  assert.match(source, /await showConfirm\(/)
  assert.match(source, /translateUi\('uiMessages\.mf818d56ffe78', \{ value1: \(trainingLabel\), value2: \(trainingPointsCost\.value\) \}\)/)
})

test('数字人训练面板支持拖拽图片或视频素材上传', () => {
  assert.match(source, /@dragover\.prevent/)
  assert.match(source, /@drop\.prevent="handleDrop"/)
  assert.match(source, /function handleDrop\(event\)/)
  assert.match(source, /image\/\*,video\/\*/)
})
