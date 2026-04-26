import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const localeDir = new URL('./locales/', import.meta.url)

test('all locales define image panorama points ledger text', () => {
  const files = fs.readdirSync(localeDir)
    .filter(file => file.endsWith('.js'))
    .sort()

  assert.ok(files.length > 0, 'locale files should exist')

  for (const file of files) {
    const source = fs.readFileSync(path.join(localeDir.pathname, file), 'utf8')
    assert.match(
      source,
      /image_panorama_generate\s*:/,
      `${file} should translate image_panorama_generate`
    )
  }
})
