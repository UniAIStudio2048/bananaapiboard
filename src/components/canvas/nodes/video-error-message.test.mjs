import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatVideoNodeAsyncErrorMessage,
  formatVideoNodeErrorMessage,
  isSeedanceVideoModel
} from './video-error-message.js'

test('formats upstream ant duration errors as concise Chinese text', () => {
  const result = formatVideoNodeErrorMessage(
    'The parameter `content[3]` specified in the request is not valid: the parameter video duration (seconds) specified in the request must be less than or equal to 15.2 for model ant-2-0 in r2v. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749',
    { includeNoChargeNotice: true }
  )

  assert.equal(result, '参考视频时长超限：当前渠道最多支持 15.2 秒，请裁剪参考视频后重试，未扣除积分')
})

test('removes raw request id noise from generic upstream messages', () => {
  const result = formatVideoNodeErrorMessage(
    '视频生成失败。Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749',
    { includeNoChargeNotice: true }
  )

  assert.equal(result, '视频生成失败，未扣除积分')
})

test('formats upstream ant pixel count errors as concise Chinese text', () => {
  const result = formatVideoNodeErrorMessage(
    'The parameter `content[3]` specified in the request is not valid: the parameter video pixel count specified in the request must be less than or equal to 2086876 for model ant-2-0 in r2v. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749',
    { includeNoChargeNotice: true }
  )

  assert.equal(result, '参考视频分辨率过高：当前渠道要求单帧像素数不超过 2086876，请压缩参考视频分辨率后重试，未扣除积分')
})

test('formats upstream audio format errors as concise Chinese text', () => {
  const result = formatVideoNodeErrorMessage(
    'The parameter `content[4]` specified in the request is not valid: the parameter audio format specified in the request is not valid for model doubao-seedance-2-0 in r2v. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749',
    { includeNoChargeNotice: true }
  )

  assert.equal(result, '参考音频格式不受当前渠道支持，请改用常见的 MP3 或 WAV 后重试，未扣除积分')
})

test('detects seedance models case-insensitively', () => {
  assert.equal(isSeedanceVideoModel('Doubao-Seedance-2-0'), true)
  assert.equal(isSeedanceVideoModel('seedance2-pro'), true)
  assert.equal(isSeedanceVideoModel('kling-v3'), false)
})

test('keeps raw async seedance errors including request id', () => {
  const raw = 'Generation blocked by policy. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749'

  assert.equal(formatVideoNodeAsyncErrorMessage(raw, 'doubao-seedance-2-0', { includeNoChargeNotice: true }), `${raw}，未扣除积分`)
})

test('keeps seedance content safety request id in canvas submit errors', () => {
  const requestId = '02177915339841700000000000000000000ffffac1566a5e16bd6'
  const raw = `The request failed because the output video may contain sensitive information. Request id: ${requestId}`

  assert.equal(
    formatVideoNodeErrorMessage(raw, { includeNoChargeNotice: true, model: 'doubao-seedance-2-0-260128' }),
    `生成的视频可能包含敏感内容，已被内容安全系统拦截，请修改提示词后重试。Request id: ${requestId}，未扣除积分`
  )
})

test('formats ant input text sensitive content errors in canvas submit errors', () => {
  const requestId = '0217806776858121904dd2b7b68a82df8a4ecc3a706eba2f494a3'
  const raw = `The request failed because the input text may contain sensitive information. Request id: ${requestId}`

  assert.equal(
    formatVideoNodeErrorMessage(raw, { includeNoChargeNotice: true, model: 'ant-2-text-2-video' }),
    `提示词可能包含敏感内容，已被内容安全系统拦截，请修改提示词后重试。Request id: ${requestId}，未扣除积分`
  )
})

test('formats async non-seedance errors with the default formatter', () => {
  const raw = '视频生成失败。Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749'

  assert.equal(formatVideoNodeAsyncErrorMessage(raw, 'kling-v3', { includeNoChargeNotice: true }), '视频生成失败，未扣除积分')
})

test('formats browser fetch failures as recoverable network status', () => {
  assert.equal(
    formatVideoNodeErrorMessage('Failed to fetch'),
    '网络连接异常，正在确认任务状态，请稍后查看结果'
  )
  assert.equal(
    formatVideoNodeAsyncErrorMessage('Failed to fetch', 'kling-v3', { includeNoChargeNotice: true }),
    '网络连接异常，正在确认任务状态，请稍后查看结果，未扣除积分'
  )
})

test('keeps audio callers unchanged unless no-charge notice is requested', () => {
  assert.equal(formatVideoNodeErrorMessage('生成失败'), '生成失败')
})
