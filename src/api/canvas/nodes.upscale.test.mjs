import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('RunningHub HD polling uses persistent upscale tasks while Coze keeps its route', async () => {
  const source = readFileSync(new URL('./nodes.js', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('export async function getVideoHdTaskStatus'), source.indexOf('export async function getImageHdTaskStatus'))
  const urls = []
  const query = new Function('fetch', 'getApiUrl', 'getHeaders', 'parseApiResponse', 'buildTaskQueryError', `${body.replace('export ', '')}; return getVideoHdTaskStatus`)(
    async url => { urls.push(url); return { ok: true } }, url => url, () => ({}), async () => ({ status: 'completed' }), () => new Error()
  )
  await query('upscale_abc')
  await query('hd_legacy')
  assert.deepEqual(urls, ['/api/videos/upscale/tasks/upscale_abc', '/api/videos/hd-upscale/task/hd_legacy'])
})
