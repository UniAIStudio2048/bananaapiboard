/**
 * Parse assistant-only UI metadata while keeping the persisted message intact.
 * The metadata is intentionally embedded in the model response so old history
 * can be rendered by the same parser without a storage migration.
 */
const CHOICES_RE = /<ui_choices\s*>([\s\S]*?)<\/ui_choices\s*>/i

function normalizeOption(option) {
  if (typeof option === 'string' || typeof option === 'number') {
    const label = String(option).trim()
    return label ? { label, value: label } : null
  }
  if (!option || typeof option !== 'object') return null
  const label = String(option.label ?? option.title ?? option.text ?? option.value ?? '').trim()
  if (!label) return null
  const value = String(option.value ?? label).trim() || label
  return { label, value }
}

export function parseAssistantContent(content) {
  const raw = typeof content === 'string' ? content : String(content ?? '')
  const match = raw.match(CHOICES_RE)
  if (!match) return { content: raw, choices: null }

  try {
    const parsed = JSON.parse(match[1].trim())
    const options = Array.isArray(parsed?.options)
      ? parsed.options.map(normalizeOption).filter(Boolean).slice(0, 12)
      : []
    if (!options.length) return { content: raw, choices: null }
    return {
      content: raw.slice(0, match.index) + raw.slice(match.index + match[0].length),
      choices: {
        question: String(parsed.question ?? '').trim(),
        options,
        allowInput: parsed.allow_input === true,
        inputPlaceholder: String(parsed.input_placeholder ?? '输入自定义要求').trim() || '输入自定义要求'
      }
    }
  } catch {
    return { content: raw, choices: null }
  }
}
