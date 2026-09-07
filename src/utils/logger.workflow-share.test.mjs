import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'logger.js'), 'utf8')

assert.match(source, /function isWorkflowSharePath\s*\(/)
assert.match(source, /if \(isWorkflowSharePath\(\)\) return/)
assert.doesNotMatch(source, /url:\s*window\.location\.href/)
assert.match(source, /share\\?\/workflows|share\/workflows/)
assert.match(source, /function isWorkflowShareRequest\s*\(url\)/)
assert.ok(source.includes('return /^\\/api\\/workflow-shares'))
assert.ok(source.includes('|| /^\\/api\\/canvas\\/workflows\\/[^/]+\\/share'))
assert.match(source, /function shouldSkipWorkflowLogging\s*\(url\)/)
assert.match(source, /if \(shouldSkipWorkflowLogging\(url\)\) return originalFetch\(url, options\)/)
assert.match(source, /export function logApiResponse[\s\S]*?shouldSkipWorkflowLogging\(url\)/)

console.log('logger workflow-share privacy tests passed')
