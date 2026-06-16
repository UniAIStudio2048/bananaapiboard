import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = dirname(fileURLToPath(import.meta.url))
const nginxConfig = readFileSync(join(appDir, 'nginx.conf'), 'utf8')

const apiLocationMatch = nginxConfig.match(/location\s+\/api\/\s*\{([\s\S]*?)\n\s*\}/)
assert.ok(apiLocationMatch, 'nginx.conf must define a /api/ proxy location')

const apiLocation = apiLocationMatch[1]
const bodySizeMatch = apiLocation.match(/client_max_body_size\s+(\d+)([kKmMgG])?;/)
assert.ok(bodySizeMatch, '/api/ proxy must allow large canvas upload bodies')

const unit = (bodySizeMatch[2] || '').toLowerCase()
const multiplier = unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1
const configuredBytes = Number(bodySizeMatch[1]) * multiplier

assert.ok(
  configuredBytes >= 500 * 1024 * 1024,
  'front-end /api/ proxy client_max_body_size must be at least 500M'
)

console.log('nginx large upload config test passed')
