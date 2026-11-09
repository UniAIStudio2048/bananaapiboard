import assert from 'node:assert/strict'
import fs from 'node:fs'

let source = fs.readFileSync(new URL('./cloudMediaUrl.js', import.meta.url), 'utf8')
source = source
  .replace("import { getApiUrl } from '@/config/tenant'", "const getApiUrl = path => path")
  .replaceAll('import.meta.env', "({ VITE_DIRECT_CDN: 'false' })")

const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { getSmartImageUrl, isCanvasDirectCdnUrl, isCloudflareImageTransformUrl } = await import(moduleUrl)

const directCanvasUrl = 'https://filescos.nananobanana.cn/canvas/tenant/user/a.png'
assert.equal(isCanvasDirectCdnUrl(directCanvasUrl), true)
assert.equal(getSmartImageUrl(directCanvasUrl), directCanvasUrl)

const tenantCanvasUrl = 'https://cdn.tenant-example.com/canvas/tenant/user/a.png?version=1'
assert.equal(isCanvasDirectCdnUrl(tenantCanvasUrl), true)
assert.equal(getSmartImageUrl(tenantCanvasUrl), tenantCanvasUrl)

const transformedR2Url = 'https://files.example.com/cdn-cgi/image/width=400,fit=scale-down,format=auto,quality=80/canvas/tenant/user/a.png'
assert.equal(isCloudflareImageTransformUrl(transformedR2Url), true)
assert.equal(isCanvasDirectCdnUrl(transformedR2Url), true)
assert.equal(getSmartImageUrl(transformedR2Url), transformedR2Url)

const legacyCosUrl = 'https://filescos.nananobanana.cn/assets/tenant/a.png'
assert.match(getSmartImageUrl(legacyCosUrl), /^\/api\/images\/proxy\?force=1&url=/)

const thirdPartyUrl = 'https://third-party.example/image.png'
assert.match(getSmartImageUrl(thirdPartyUrl), /^\/api\/images\/proxy\?force=1&url=/)

const tenantNonCanvasUrl = 'https://cdn.tenant-example.com/assets/tenant/a.png'
assert.match(getSmartImageUrl(tenantNonCanvasUrl), /^\/api\/images\/proxy\?force=1&url=/)

console.log('cloudMediaUrl canvas direct tests passed')
