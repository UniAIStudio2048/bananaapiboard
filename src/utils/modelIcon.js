const LOBE_AVATAR_BASE_URL = 'https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars'

const KNOWN_LOBE_SLUGS = new Map([
  ['openai', 'openai'],
  ['chatgpt', 'openai'],
  ['gemini', 'gemini'],
  ['google', 'gemini'],
  ['claude', 'claude'],
  ['anthropic', 'claude'],
  ['grok', 'grok'],
  ['xai', 'grok'],
  ['midjourney', 'midjourney'],
  ['mistral', 'mistral'],
  ['meta', 'meta'],
  ['llama', 'meta'],
  ['deepseek', 'deepseek'],
  ['qwen', 'qwen'],
  ['alibaba', 'qwen'],
  ['moonshot', 'moonshot'],
  ['kimi', 'moonshot']
])

function slugifyModelIconName(name) {
  const slug = String(name || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return KNOWN_LOBE_SLUGS.get(slug) || KNOWN_LOBE_SLUGS.get(slug.replace(/-/g, '')) || slug
}

function parsePropValue(value) {
  const trimmed = String(value || '').trim()
  const quoted = trimmed.match(/^['"]([^'"]*)['"]$/)
  const raw = quoted ? quoted[1] : trimmed
  if (/^\d+$/.test(raw)) return Number(raw)
  return raw
}

function parseAvatarProps(input) {
  const props = {}
  const propPattern = /(?:^|\s|\.)((?:[A-Za-z][A-Za-z0-9_-]*))=\{([^{}]+)\}/g
  let match

  while ((match = propPattern.exec(input))) {
    props[match[1]] = parsePropValue(match[2])
  }

  return props
}

function parseLobeAvatar(value) {
  const match = value.match(/^([A-Za-z][A-Za-z0-9_-]*)\.Avatar(?:\b|\.|\s|$)([\s\S]*)$/)
  if (!match) return null

  const slug = slugifyModelIconName(match[1])
  if (!slug) return null

  const props = parseAvatarProps(match[2] || '')
  const shape = props.shape === 'square' ? 'square' : 'circle'

  return {
    type: 'lobe/avatar',
    slug,
    src: `${LOBE_AVATAR_BASE_URL}/${slug}.webp`,
    size: typeof props.size === 'number' ? props.size : undefined,
    shape,
    avatarType: typeof props.type === 'string' ? props.type : undefined,
    raw: value
  }
}

export function isModelIconImage(icon) {
  const parsed = typeof icon === 'object' && icon ? icon : parseModelIcon(icon)
  return parsed.type === 'image' || parsed.type === 'lobe/avatar'
}

export function formatModelTextIcon(icon) {
  const value = String(icon || '').trim()
  if (!value) return '▶'
  if (Array.from(value).length <= 2) return value
  return value[0].toUpperCase()
}

export function parseModelIcon(icon) {
  const value = String(icon || '').trim()
  if (!value) {
    return {
      type: 'text',
      text: '▶',
      title: '',
      raw: ''
    }
  }

  if (/^(https?:\/\/|\/)/.test(value)) {
    return {
      type: 'image',
      src: value,
      raw: value
    }
  }

  const lobeAvatar = parseLobeAvatar(value)
  if (lobeAvatar) return lobeAvatar

  return {
    type: 'text',
    text: formatModelTextIcon(value),
    title: value,
    raw: value
  }
}
