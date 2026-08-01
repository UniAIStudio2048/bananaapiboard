import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'VideoNode.vue'), 'utf8')

test('画布 VideoNode 输出分辨率显示配置：未配置时不限制，配置后过滤各分辨率入口', () => {
  assert.match(source, /function filterResolutionDisplay\(options\)/)
  assert.match(source, /currentModelConfig\.value\?\.displayResolutions/)
  assert.match(source, /if \(display === undefined \|\| display === null\) return options/)
  // 兼容对象与纯字符串两种选项形式（MiniMax 海螺官方直连传字符串数组）
  assert.match(source, /const value = typeof option === 'string' \? option : option\?\.value/)
  // 覆盖的分辨率入口
  assert.match(source, /return filterResolutionDisplay\(rawOptions/)
  assert.match(source, /return filterResolutionDisplay\(currentModelConfig\.value\?\.veoResolutions/)
  assert.match(source, /return filterResolutionDisplay\(options\s*\.map\(option => \{\n\s*const value = typeof option === 'string' \? option : option\?\.value/)
  assert.match(source, /return filterResolutionDisplay\(configuredResolutions\)/)
  assert.match(source, /return filterResolutionDisplay\(\[['"']720P['"']\]\)/)
})

test('画布 Vidu 分辨率显示配置：仅在后台启用档位内切换，非法值自动重置', () => {
  assert.match(source, /const viduDisplayResolutions = computed\(\(\) => \{/)
  assert.match(source, /currentModelConfig\.value\?\.displayResolutions/)
  assert.match(source, /if \(display === undefined \|\| display === null\) return \['720p', '1080p'\]/)
  assert.match(source, /\.filter\(value => value === '720p' \|\| value === '1080p'\)/)
  assert.match(source, /const videoParameterResolutionOptions = computed\(\(\) => \{[\s\S]*isViduModel\.value[\s\S]*viduDisplayResolutions\.value/)
  assert.match(source, /const selectedVideoParameterResolution = computed\(\{[\s\S]*isViduModel\.value\) return viduResolution\.value[\s\S]*isViduModel\.value\) viduResolution\.value = value/)
  assert.match(source, /watch\(\[selectedModel, viduDisplayResolutions\], \(\) => \{/)
  assert.match(source, /viduResolution\.value = options\.includes\('1080p'\) \? '1080p' : options\[0\]/)
  // 防回归：immediate watch 必须位于 currentModelConfig 声明之后，否则 setup 阶段触发 TDZ
  const watchLine = source.indexOf('watch([selectedModel, viduDisplayResolutions]')
  const configLine = source.indexOf('const currentModelConfig = computed')
  assert.ok(configLine !== -1 && watchLine > configLine, 'vidu 分辨率 watch 必须在 currentModelConfig 声明之后')
})
