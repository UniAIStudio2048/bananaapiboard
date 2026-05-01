export function stripHtmlToText(value) {
  if (!value) return ''
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildTextNodeLlmMessages({
  inheritedText = '',
  currentNodeText = '',
  llmInputText = '',
  hasReferenceMedia = false
} = {}) {
  const messages = []
  const cleanInheritedText = stripHtmlToText(inheritedText)
  const cleanCurrentNodeText = stripHtmlToText(currentNodeText)
  const cleanInputText = stripHtmlToText(llmInputText)

  if (cleanInheritedText) {
    messages.push({
      role: 'assistant',
      content: cleanInheritedText
    })
  }

  if (cleanInputText) {
    if (cleanCurrentNodeText) {
      messages.push({
        role: 'assistant',
        content: cleanCurrentNodeText
      })
    }

    messages.push({
      role: 'user',
      content: cleanInputText
    })

    return messages
  }

  if (cleanCurrentNodeText && hasReferenceMedia) {
    messages.push({
      role: 'user',
      content: cleanCurrentNodeText
    })

    return messages
  }

  if (cleanCurrentNodeText) {
    messages.push({
      role: 'assistant',
      content: cleanCurrentNodeText
    })
  }

  messages.push({
    role: 'user',
    content: cleanCurrentNodeText ? '请基于上方的内容继续' : '你好'
  })

  return messages
}
