import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveVideoRequestModel } from './videoGenerationMode.js'
test('Siray keeps tenant model IDs distinct even with shared upstream actualModel', () => {
  for (const name of ['siray-wan3', 'siray-wan3-prime']) assert.equal(resolveVideoRequestModel({ apiType: 'siray-wan3', actualModel: 'alibaba/wan-3.0-ref2v' }, name), name)
})
