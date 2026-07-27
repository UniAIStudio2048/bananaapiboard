import { strict as assert } from 'node:assert'

const locales = [
  'ar', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'ug', 'zh-CN', 'zh-TW'
]

for (const locale of locales) {
  const { default: messages } = await import(`./${locale}.js`)
  const label = messages.user?.ledgerType?.audio_generation

  assert.equal(typeof label, 'string', `${locale} should translate audio_generation ledger entries`)
  assert.notEqual(label, 'audio_generation', `${locale} should not expose the internal ledger type`)
}

console.log('Audio generation ledger type locale tests passed')
