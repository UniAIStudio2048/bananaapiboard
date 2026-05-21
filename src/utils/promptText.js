const CARRIAGE_RETURN_NEWLINE_PATTERN = /\r\n?/g

export function normalizePromptLineEndings(value = '') {
  return typeof value === 'string'
    ? value.replace(CARRIAGE_RETURN_NEWLINE_PATTERN, '\n')
    : value
}
