import test from 'node:test'
import assert from 'node:assert/strict'

const localeNames = ['ar', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'ug', 'zh-CN', 'zh-TW']

test('every locale provides the complete canvas asset directory labels', async () => {
  const requiredKeys = [
    'canvasTab', 'assetsTab', 'title', 'searchPlaceholder', 'empty',
    'root', 'rename', 'duplicate', 'download', 'locate', 'total'
  ]

  for (const localeName of localeNames) {
    const locale = (await import(`./locales/${localeName}.js`)).default
    const directory = locale.canvas?.assetPanel?.directory
    assert.ok(directory, `${localeName} must define canvas.assetPanel.directory`)
    for (const key of requiredKeys) {
      assert.equal(typeof directory[key], 'string', `${localeName} directory.${key} must be a string`)
      assert.ok(directory[key].trim(), `${localeName} directory.${key} must not be empty`)
    }
  }
})
