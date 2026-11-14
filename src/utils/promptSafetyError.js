import { t as translateUi } from '../i18n/index.js'
const PROMPT_SAFETY_CODE = 'prompt_safety_blocked'

const COPY = {
  zh: {
    get title() { return translateUi('uiMessages.mad171df05714') },
    get message() { return translateUi('uiMessages.m2ded08a97e1d') },
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
  get sexual_minors() { return translateUi('uiMessages.ma9602bb59d95') },
  get sexual_explicit() { return translateUi('uiMessages.mfb7a77487a41') },
  get sexual_suggestive() { return translateUi('uiMessages.mded40f3d77de') },
  get violence_threat() { return translateUi('uiMessages.m7301efc56ea4') },
  get violence_graphic() { return translateUi('uiMessages.m41e1fd79433d') },
  get self_harm() { return translateUi('uiMessages.m331d24328dd9') },
  get hate_slur() { return translateUi('uiMessages.m9b6c36e73b60') },
  get illegal_drugs() { return translateUi('uiMessages.mde5be8aac4f5') },
  get weapons_explosives() { return translateUi('uiMessages.m2471baeb9cca') },
  get fraud_scam() { return translateUi('uiMessages.mff62fe8247dd') },
  get privacy_doxxing() { return translateUi('uiMessages.m919470833d4c') },
  get cyber_abuse() { return translateUi('uiMessages.me22f012f28b9') },
  get profanity() { return translateUi('uiMessages.ma028d0104cb1') },
  get political_persuasion() { return translateUi('uiMessages.m03ac81cd9c98') },
  get custom() { return translateUi('uiMessages.m4eafa9e925b3') },
  get violent() { return translateUi('uiMessages.m67aa918d767a') },
  get violence() { return translateUi('uiMessages.m67aa918d767a') },
  'sexual content or sexual acts': translateUi('uiMessages.mf40d79cb2009'),
  get sexual() { return translateUi('uiMessages.m10e9899501db') },
  get politics() { return translateUi('uiMessages.mf5780893836c') },
  get political() { return translateUi('uiMessages.mf5780893836c') },
  get hate() { return translateUi('uiMessages.ma4e8f178f7e1') },
  get harassment() { return translateUi('uiMessages.m7416bb197855') },
  get illegal() { return translateUi('uiMessages.md643b4438172') },
  get 'self-harm'() { return translateUi('uiMessages.m1379f06040a1') },
  get selfharm() { return translateUi('uiMessages.m1379f06040a1') },
  get weapons() { return translateUi('uiMessages.m4fe131173e23') },
  get drugs() { return translateUi('uiMessages.mf3a91642809e') },
  get privacy() { return translateUi('uiMessages.m86651d17a401') }
}

const EN_CATEGORY_LABELS = {
  sexual_minors: 'Minor sexual safety',
  sexual_explicit: 'Explicit sexual content',
  sexual_suggestive: 'Suggestive adult content',
  violence_threat: 'Violent threats',
  violence_graphic: 'Graphic violence',
  self_harm: 'Self-harm',
  hate_slur: 'Hate and slurs',
  illegal_drugs: 'Illegal drugs',
  weapons_explosives: 'Weapons and explosives',
  fraud_scam: 'Fraud and scams',
  privacy_doxxing: 'Privacy and doxxing',
  cyber_abuse: 'Cyber abuse',
  profanity: 'Profanity',
  political_persuasion: 'Political persuasion',
  custom: 'Custom',
  violent: 'Violence',
  violence: 'Violence',
  'sexual content or sexual acts': 'Sexual Content or Sexual Acts',
  sexual: 'Sexual content',
  politics: 'Political content',
  political: 'Political content',
  hate: 'Hate or discrimination',
  harassment: 'Harassment',
  illegal: 'Illegal behavior',
  selfharm: 'Self-harm',
  weapons: 'Weapons',
  drugs: 'Drugs',
  privacy: 'Privacy'
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return []
  return [...new Set(categories.map(item => String(item || '').trim()).filter(Boolean))]
}

function humanizeCategoryId(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function localizeCategory(category, language) {
  const value = String(category || '').trim()
  const key = value.toLowerCase()
  if (language === 'zh') return ZH_CATEGORY_LABELS[key] || humanizeCategoryId(value)
  return EN_CATEGORY_LABELS[key] || humanizeCategoryId(value)
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
  const matchedContent = normalizeCategories(safety.matchedContent)
  if (matchedContent.length > 0) {
    return matchedContent.join(language === 'en' ? ', ' : '、')
  }

  const explicit = String(
    safety.blockedContent ||
    safety.explanation ||
    safety.detail ||
    extractLabeledLine(safety.reason, ['Explanation', 'Reason', 'Details', 'Detail', 'Blocked content', 'Violation']) ||
    ''
  ).trim()

  if (explicit && !/^none$/i.test(explicit)) {
    if (!(isGenericCategoryContent(explicit) && categories.length > 0)) {
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
