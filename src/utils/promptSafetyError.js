const PROMPT_SAFETY_CODE = 'prompt_safety_blocked'

const COPY = {
  zh: {
    title: '安全审核未通过',
    message: '请修改提示词中不符合安全规则的内容后重试。',
    editLabel: '需要修改的内容',
    categoryLabel: '风险类别',
    fallbackBlockedContent: '包含不符合安全规则的内容',
    categoryBlockedContent: categories => `包含${categories.join('、')}相关内容`,
    confirmText: '确定'
  },
  en: {
    title: 'Safety Review Failed',
    message: 'Please edit your prompt to remove content that does not meet the safety rules, then try again.',
    editLabel: 'What to edit',
    categoryLabel: 'Risk categories',
    fallbackBlockedContent: 'Content that does not meet the safety rules',
    categoryBlockedContent: categories => `Remove or rewrite the parts related to ${categories.join(', ')}.`,
    confirmText: 'OK'
  }
}

const ZH_CATEGORY_LABELS = {
  violent: '暴力',
  violence: '暴力',
  'sexual content or sexual acts': '性内容或性行为',
  sexual: '性内容',
  politics: '政治敏感',
  political: '政治敏感',
  hate: '仇恨或歧视',
  harassment: '骚扰',
  illegal: '违法行为',
  'self-harm': '自伤',
  selfharm: '自伤',
  weapons: '武器',
  drugs: '毒品',
  privacy: '隐私'
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return []
  return [...new Set(categories.map(item => String(item || '').trim()).filter(Boolean))]
}

function localizeCategory(category, language) {
  const value = String(category || '').trim()
  if (language !== 'zh') return value
  return ZH_CATEGORY_LABELS[value.toLowerCase()] || value
}

function localizeCategories(categories, language) {
  return categories.map(category => localizeCategory(category, language))
}

function resolveLanguage(language) {
  const raw = String(
    language ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('language')) ||
    (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) ||
    ''
  )
  return raw.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function extractLabeledLine(text, labels) {
  const source = String(text || '')
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = source.match(new RegExp(`^\\s*${escaped}\\s*:\\s*([^\\n]+)`, 'im'))
    if (match) {
      const value = String(match[1] || '').trim()
      if (value && !/^none$/i.test(value)) return value
    }
  }
  return ''
}

function stripGuardProtocol(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^\s*safety\s*:/i.test(line))
    .filter(line => !/^\s*categor(?:y|ies)\s*:/i.test(line))
    .join(' ')
    .trim()
}

function isGenericCategoryContent(value) {
  return /^contains content related to .+\.$/i.test(String(value || '').trim())
}

function getBlockedContent(safety, categories, copy, language) {
  const explicit = String(
    safety.blockedContent ||
    safety.explanation ||
    safety.detail ||
    extractLabeledLine(safety.reason, ['Explanation', 'Reason', 'Details', 'Detail', 'Blocked content', 'Violation']) ||
    ''
  ).trim()

  if (explicit && !/^none$/i.test(explicit)) {
    if (!(language === 'zh' && isGenericCategoryContent(explicit) && categories.length > 0)) {
      return explicit
    }
  }

  const cleanedReason = stripGuardProtocol(safety.reason)
  if (cleanedReason) return cleanedReason

  if (categories.length > 0) return copy.categoryBlockedContent(localizeCategories(categories, language))

  return copy.fallbackBlockedContent
}

export function createPromptSafetyError(payload = {}) {
  const message = payload.message || '提示词未通过安全审核，请修改后重试'
  const error = new Error(message)
  error.code = PROMPT_SAFETY_CODE
  error.safety = {
    ...(payload.safety || {}),
    categories: normalizeCategories(payload.safety?.categories)
  }
  error.payload = payload
  return error
}

export function isPromptSafetyBlockedError(error) {
  return error?.code === PROMPT_SAFETY_CODE || error?.error === PROMPT_SAFETY_CODE
}

export function buildPromptSafetyDialog(error = {}, options = {}) {
  const language = resolveLanguage(options.language)
  const copy = COPY[language] || COPY.zh
  const safety = error.safety || error.payload?.safety || {}
  const categories = normalizeCategories(safety.categories)
  const localizedCategories = localizeCategories(categories, language)
  const blockedContent = getBlockedContent(safety, categories, copy, language)
  const labelSeparator = language === 'en' ? ': ' : '：'
  const detailParts = []

  if (blockedContent) {
    detailParts.push(`${copy.editLabel}${labelSeparator}${blockedContent}`)
  }
  if (categories.length > 0) {
    const separator = language === 'en' ? ', ' : '、'
    detailParts.push(`${copy.categoryLabel}${labelSeparator}${localizedCategories.join(separator)}`)
  }

  return {
    title: copy.title,
    message: copy.message,
    detail: detailParts.join('\n'),
    confirmText: copy.confirmText
  }
}
