import zhCN from './locales/zh-CN.js'

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const messages = new Map()
function collect(value, prefix = '') {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof item === 'string') {
      if (!messages.has(item)) messages.set(item, [])
      messages.get(item).push(path)
    } else if (item && typeof item === 'object') collect(item, path)
  }
}
collect(zhCN)

// Source-contract tests may assert either a rendered label or its translation call.
// Runtime language coverage is checked separately by localeCoverage.test.mjs.
export function localizedPattern(pattern) {
  let source = pattern.source
  const replacements = []
  for (const [text, keys] of [...messages].sort((a, b) => b[0].length - a[0].length)) {
    if (!/\p{Script=Han}/u.test(text) || /\{\w+\}/.test(text)) continue
    const escaped = escape(text)
    const call = `translateUi\\('(?:${keys.map(escape).join('|')})'\\)`
    const token = () => `__I18N_ASSERT_${replacements.length}__`
    for (const candidate of [...new Set([escaped, text])]) {
      if (!source.includes(candidate)) continue
      for (const quote of ['"', "'"]) {
        const quoted = quote + candidate + quote
        if (!source.includes(quoted)) continue
        const marker = token()
        replacements.push(quote === '"' ? `(?:"${escaped}"|"${call}")` : `(?:'${escaped}'|${call}(?:\\s*\\})?)`)
        source = source.replaceAll(quoted, marker)
      }
      if (source.includes(candidate)) {
        const marker = token()
        replacements.push(`(?:${escaped}|(?:\\{\\{\\s*)?${call}(?:\\s*\\}\\})?)`)
        source = source.replaceAll(candidate, marker)
      }
    }
  }
  source = source.replace(/\b([a-zA-Z_$][\w$]*):\s*(?=__I18N_ASSERT_)/g, (_, name) => `(?:${name}:\\s*|get ${name}\\(\\)\\s*\\{\\s*return\\s*)`)
  source = source.replace(/(\s)(title|placeholder|alt|aria-label|label|description)=__I18N_ASSERT_/g, '$1:?$2=__I18N_ASSERT_')
  source = source.replace(/__I18N_ASSERT_(\d+)__/g, (_, index) => replacements[Number(index)])
  const matchingKeys = [...messages].filter(([text]) => new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(text)).flatMap(([, keys]) => keys)
  if (matchingKeys.length) source = `(?:${source}|translateUi\\('(?:${matchingKeys.map(escape).join('|')})')`
  return new RegExp(source, pattern.flags)
}

export function uiTextIndex(source, expected) {
  const direct = source.indexOf(expected)
  if (direct >= 0 || typeof expected !== 'string' || !/\p{Script=Han}/u.test(expected)) return direct
  const positions = []
  for (const [text, keys] of messages) {
    if (text.includes(expected)) for (const key of keys) {
      const index = source.indexOf(`translateUi('${key}'`)
      if (index >= 0) positions.push(index)
    }
    if (expected.includes(`>${text}<`)) for (const key of keys) {
      const index = source.indexOf(expected.replaceAll(`>${text}<`, `>{{ translateUi('${key}') }}<`))
      if (index >= 0) positions.push(index)
    }
  }
  return positions.length ? Math.min(...positions) : -1
}

export const includesUiText = (source, expected) => uiTextIndex(source, expected) >= 0
