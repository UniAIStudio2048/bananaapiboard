import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

test('startStreamDownload triggers tenant canvas CDN URLs without building an API path', () => {
  assert.match(
    source,
    /import\s*\{[^}]*isCanvasDirectCdnDownloadUrl[^}]*\}\s*from\s*['"]\.\/downloadRouting\.js['"]/s
  )

  const functionSource = extractFunction('startStreamDownload')
  assert.match(
    functionSource,
    /if \(isCanvasDirectCdnDownloadUrl\(cleanUrl\)\) \{\s*triggerUrlDownload\(cleanUrl, correctedFilename\)\s*return\s*\}/
  )
  assert.ok(
    functionSource.indexOf('isQiniuCdnUrl(cleanUrl)') <
      functionSource.indexOf('isCanvasDirectCdnDownloadUrl(cleanUrl)'),
    'the existing Qiniu direct-download branch must keep its priority'
  )
  assert.ok(
    functionSource.indexOf('isCanvasDirectCdnDownloadUrl(cleanUrl)') <
      functionSource.indexOf('getApiUrl(buildStreamDownloadPath('),
    'the canvas CDN branch must return before any stream API URL is built'
  )
})
