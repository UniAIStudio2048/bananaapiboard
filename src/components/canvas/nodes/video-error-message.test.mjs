import test from 'node:test'
import assert from 'node:assert/strict'

import { formatVideoNodeErrorMessage } from './video-error-message.js'

test('formats upstream ant duration errors as concise Chinese text', () => {
  const result = formatVideoNodeErrorMessage(
    'The parameter `content[3]` specified in the request is not valid: the parameter video duration (seconds) specified in the request must be less than or equal to 15.2 for model ant-2-0 in r2v. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749'
  )

  assert.equal(result, '参考视频时长超限：当前渠道最多支持 15.2 秒，请裁剪参考视频后重试。')
})

test('removes raw request id noise from generic upstream messages', () => {
  const result = formatVideoNodeErrorMessage(
    '视频生成失败。Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749'
  )

  assert.equal(result, '视频生成失败。')
})

test('formats upstream ant pixel count errors as concise Chinese text', () => {
  const result = formatVideoNodeErrorMessage(
    'The parameter `content[3]` specified in the request is not valid: the parameter video pixel count specified in the request must be less than or equal to 2086876 for model ant-2-0 in r2v. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749'
  )

  assert.equal(result, '参考视频分辨率过高：当前渠道要求单帧像素数不超过 2086876，请压缩参考视频分辨率后重试。')
})

test('formats upstream audio format errors as concise Chinese text', () => {
  const result = formatVideoNodeErrorMessage(
    'The parameter `content[4]` specified in the request is not valid: the parameter audio format specified in the request is not valid for model doubao-seedance-2-0 in r2v. Request id: 0217775348023375ab88183db28c1bc6b9ad1d3f70c5b50e3c749'
  )

  assert.equal(result, '参考音频格式不受当前渠道支持，请改用常见的 MP3 或 WAV 后重试。')
})
