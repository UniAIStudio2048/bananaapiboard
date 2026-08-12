import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const locales = [
  'ar.js', 'de.js', 'en.js', 'es.js', 'fr.js',
  'ja.js', 'ko.js', 'pt.js', 'ru.js', 'ug.js',
  'zh-CN.js', 'zh-TW.js'
]

const dir = new URL('.', import.meta.url)

for (const file of locales) {
  test(`${file} contains user.teamPoints key`, () => {
    const source = fs.readFileSync(new URL(file, dir), 'utf8')
    assert.match(source, /teamPoints:\s*['"]/, `${file} must define teamPoints`)
  })

  test(`${file} contains user.totalBalance key`, () => {
    const source = fs.readFileSync(new URL(file, dir), 'utf8')
    assert.match(source, /totalBalance:\s*['"]/, `${file} must define totalBalance`)
  })
}