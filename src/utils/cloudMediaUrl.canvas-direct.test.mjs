import assert from 'node:assert/strict'
import fs from 'node:fs'

let source = fs.readFileSync(new URL('./cloudMediaUrl.js', import.meta.url), 'utf8')
source = source
  .replace("import { getApiUrl } from '@/config/tenant'", "const getApiUrl = path => path")
  .replaceAll('import.meta.env', "({ VITE_DIRECT_CDN: 'false' })")

const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { getSmartImageUrl, isCanvasDirectCdnUrl } = await import(moduleUrl)

const directCanvasUrl = 'https://filescos.nananobanana.cn/canvas/tenant/user/a.png'
assert.equal(isCanvasDirectCdnUrl(directCanvasUrl), true)
assert.equal(getSmartImageUrl(directCanvasUrl), directCanvasUrl)

const legacyCosUrl = 'https://filescos.nananobanana.cn/assets/tenant/a.png'
assert.match(getSmartImageUrl(legacyCosUrl), /^\/api\/images\/proxy\?force=1&url=/)

const thirdPartyUrl = 'https://third-party.example/image.png'
assert.match(getSmartImageUrl(thirdPartyUrl), /^\/api\/images\/proxy\?force=1&url=/)

console.log('cloudMediaUrl canvas direct tests passed')
