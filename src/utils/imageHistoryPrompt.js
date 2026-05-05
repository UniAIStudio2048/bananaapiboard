export function getImageHistoryDisplayPrompt(item) {
  return item?.user_prompt || item?.prompt || ''
}

export function normalizeImageHistoryItem(item) {
  if (!item || typeof item !== 'object') return item

  const fullPrompt = item.fullPrompt || item.prompt || ''
  const displayPrompt = item.user_prompt || item.prompt || ''

  return {
    ...item,
    prompt: displayPrompt,
    fullPrompt,
    user_prompt: item.user_prompt || null
  }
}

export function normalizeImageHistoryItems(items) {
  return Array.isArray(items) ? items.map(normalizeImageHistoryItem) : []
}
