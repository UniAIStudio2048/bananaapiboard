import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'aiAssistantModels.js'), 'utf8')

test('uses a small CDN thumbnail for direct image model icons', () => {
  assert.match(source, /import \{ getCanvasThumbnailUrl \} from '\.\/canvasThumbnail\.js'/)
  assert.match(source, /return getCanvasThumbnailUrl\(parsedIcon\.src, 64\)/)
})

test('keeps non-image model icon declarations for ModelIcon to render', () => {
  assert.match(source, /if \(parsedIcon\.type !== 'image'\) return icon/)
})
