import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')
const start = source.indexOf('const maxVideoBytes =', source.indexOf('async function handleSeedanceRefVideos('))
const end = source.indexOf('const selected = []', start)
const checkSize = new Function('currentModelConfig', 'isWan3Model', 'files', 'error', 'e', 'translateUi', source.slice(start, end))

test('video page upload uses official 200MB and retains other channel limits', () => {
  for (const [apiType, isWan3, maxMB] of [['seedance-2.0', false, 200], ['seedance-2.5', false, 200], ['ant', false, 50], ['ctyun-seedance', false, 50], ['wan3', true, 100]]) {
    for (const extraByte of [0, 1]) {
      const error = { value: '' }
      const e = { target: { value: 'selected.mp4' } }
      checkSize({ value: { apiType } }, { value: isWan3 }, [{ size: maxMB * 1024 * 1024 + extraByte }], error, e,
        (_key, params) => `参考视频不能超过${params.value1}MB`)
      assert.equal(error.value, extraByte ? `参考视频不能超过${maxMB}MB` : '', apiType)
      assert.equal(e.target.value, extraByte ? '' : 'selected.mp4', apiType)
    }
  }
})
