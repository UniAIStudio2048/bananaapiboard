export function buildRunningHubMusicInput(model, input) {
  const modelPath = String(model?.actualModel || '')
  if (model?.apiType === 'runninghub-audio' && (/suno-v6/.test(modelPath) || model?.sunoV6)) {
    return buildRunningHubSunoV6Input(model, input)
  }
  if (!['rhart-audio/suno-v5.5/single', 'rhart-audio/suno-v5.5/custom'].includes(modelPath)) throw new Error('RunningHub 音乐模型配置无效')
  const custom = modelPath.endsWith('/custom')
  const prompt = String(input.prompt || '').trim()
  const title = String(input.title || '').trim()
  const tags = String(input.tags || '').trim()
  const promptLimit = custom ? 5000 : 400
  if (!prompt || prompt.length > promptLimit) throw new Error(`${custom ? '歌词' : '音乐描述'}必须填写且不能超过 ${promptLimit} 字符`)
  if ((custom && !title) || title.length > 80) throw new Error('歌曲标题不能超过 80 字符，自定义版必须填写标题')
  if (custom && (!tags || tags.length > 1000)) throw new Error('请填写音乐风格，不能超过 1000 字符')
  const body = custom ? { title, prompt, tags } : { title: title || null, description: prompt, make_instrumental: input.makeInstrumental ? 'true' : 'false' }
  if (String(input.webhookUrl || '').trim()) {
    const webhook = new URL(String(input.webhookUrl).trim())
    if (webhook.protocol !== 'https:') throw new Error('Webhook 回调地址必须使用 HTTPS')
    body.webhookUrl = webhook.href
  }
  return body
}

export const RUNNINGHUB_SUNO6_OPERATIONS = [
  ['single', '一句话成曲', 'rhart-audio/suno-v6/single', 0.08],
  ['custom', '自定义歌词成曲', 'rhart-audio/suno-v6/custom', 0.08],
  ['sounds', '文字生成音效', 'rhart-audio/suno-v6/sounds', 0.02],
  ['inspo', '参考音频灵感成曲', 'rhart-audio/suno-v6/inspo', 0.11],
  ['upload-cover', '上传音频翻唱', 'rhart-audio/suno-v6/upload-cover', 0.08],
  ['wild-custom', '狂野自定义成曲', 'rhart-audio/suno-v6-wild/custom', 0.08],
  ['wild-single', '狂野一句话成曲', 'rhart-audio/suno-v6-wild/single', 0.08],
  ['upload', '上传音频作为源曲', 'rhart-audio/suno-v6/upload', 0.08],
  ['add-instrumental', '给人声添加伴奏', 'rhart-audio/suno-v6/add-instrumental', 0.08],
  ['add-vocals', '给伴奏添加人声', 'rhart-audio/suno-v6/add-vocals', 0.08],
  ['replace-section', '替换音乐分区', 'rhart-audio/suno-v6/replace-section', 0.08],
  ['extend', '延长已有音乐', 'rhart-audio/suno-v6/extend', 0.08],
  ['mini-custom', '轻量自定义成曲', 'rhart-audio/suno-v6-mini/custom', 0.08],
  ['mini-single', '轻量一句话成曲', 'rhart-audio/suno-v6-mini/single', 0.08],
  ['cover', '已有任务翻唱', 'rhart-audio/suno-v6/cover', 0.08],
  ['mashup', '两首音乐混搭', 'rhart-audio/suno-v6/mashup', 0.08],
  ['upload-extend', '上传并续写音乐', 'rhart-audio/suno-v6/upload-extend', 0.08],
  ['sample', '采样转歌曲', 'rhart-audio/suno-v6/sample', 0.08],
  ['add-stem', '给音乐添加音轨', 'rhart-audio/suno-v6/add-stem', 0.08]
].map(([id, label, path, usd]) => Object.freeze({ id, label, path, usd }))

const SUNO6_BY_ID = new Map(RUNNINGHUB_SUNO6_OPERATIONS.map(item => [item.id, item]))
const SUNO6_BY_PATH = new Map(RUNNINGHUB_SUNO6_OPERATIONS.map(item => [item.path, item]))
const SUNO6_ENUMS = {
  version: ['v6', 'v6-wild', 'v6-mini'], variety: ['off', 'normal', 'high', 'extra', 'max'],
  audioFormat: ['mp3', 'm4a', 'wav'], soundType: ['one-shot', 'loop'],
  musicalKey: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm']
}
const SUNO6_OPERATION_FIELDS = {
  inspo: new Set(['version', 'customModelId', 'prompt', 'title', 'tags', 'negativeTags', 'styleWeight', 'weirdness', 'audioWeight', 'vocalGender', 'autoLyrics', 'variety', 'maxMode', 'audioFormat']),
  'upload-cover': new Set(['version', 'customModelId', 'custom', 'gptDescription', 'prompt', 'tags', 'title', 'negativeTags', 'styleWeight', 'weirdness', 'audioWeight', 'autoLyrics', 'vocalGender', 'personaId', 'duration', 'variety', 'maxMode', 'audioFormat']),
  'upload-extend': new Set(['version', 'customModelId', 'prompt', 'title', 'tags', 'negativeTags', 'styleWeight', 'weirdness', 'audioWeight', 'vocalGender', 'autoLyrics', 'personaId', 'duration', 'variety', 'maxMode', 'audioFormat']),
  mashup: new Set(['version', 'custom', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'autoLyrics', 'vocalGender', 'styleWeight', 'weirdness', 'audioWeight', 'variety', 'maxMode', 'audioFormat']),
  'replace-section': new Set(['customModelId', 'version', 'prompt', 'title', 'tags', 'negativeTags', 'infillLyrics', 'variety', 'maxMode', 'audioFormat']),
  sample: new Set(['version', 'custom', 'customModelId', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'autoLyrics', 'vocalGender', 'styleWeight', 'weirdness', 'audioWeight', 'variety', 'maxMode', 'audioFormat']),
  extend: new Set(['version', 'customModelId', 'custom', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness', 'audioWeight', 'autoLyrics', 'personaId', 'duration', 'variety', 'maxMode', 'audioFormat']),
  cover: new Set(['version', 'customModelId', 'custom', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'styleWeight', 'weirdness', 'audioWeight', 'vocalGender', 'personaId', 'duration', 'variety', 'maxMode', 'audioFormat']),
  'add-instrumental': new Set(['version', 'customModelId', 'custom', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness', 'audioWeight', 'variety', 'maxMode', 'audioFormat']),
  'add-vocals': new Set(['version', 'customModelId', 'custom', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness', 'audioWeight', 'variety', 'maxMode', 'audioFormat']),
  'add-stem': new Set(['version', 'customModelId', 'custom', 'prompt', 'gptDescription', 'title', 'tags', 'negativeTags', 'styleWeight', 'weirdness', 'audioWeight', 'variety', 'maxMode', 'audioFormat'])
}

function optionalNumber(value, label, min, max, integer = false) {
  if (value === '' || value === null || value === undefined) return undefined
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new Error(`${label}必须在 ${min}–${max}${integer ? ' 的整数' : ''}范围内`)
  return number
}

function optionalEnum(value, label, values) {
  if (!value) return undefined
  if (!values.includes(String(value))) throw new Error(`${label}参数无效`)
  return String(value)
}

function optionalText(value, label, max) {
  const text = String(value || '').trim()
  if (!text) return undefined
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 字符`)
  return text
}

const SUNO6_LONG_GENDER_OPERATIONS = new Set(['inspo', 'upload-cover', 'extend', 'cover', 'upload-extend'])

function normalizeVocalGender(value, operationId) {
  if (value === undefined || value === null || value === '') return undefined
  const text = String(value)
  if (!['m', 'f', 'Male', 'Female'].includes(text)) throw new Error('人声性别参数无效')
  if (SUNO6_LONG_GENDER_OPERATIONS.has(operationId)) return text === 'm' ? 'Male' : text === 'f' ? 'Female' : text
  return text === 'Male' ? 'm' : text === 'Female' ? 'f' : text
}

function appendSuno6Common(body, input, operation, { includePrompt = true, allowed = null } = {}) {
  const can = key => !allowed || allowed.has(key)
  const customModelId = optionalText(input.customModelId, '自定义模型 ID', 64)
  if (customModelId && can('customModelId')) body.customModelId = customModelId
  if (!customModelId && can('version')) {
    const version = optionalEnum(input.version, '版本', SUNO6_ENUMS.version)
    if (version) body.version = version
  }
  if (can('custom') && input.custom !== undefined && input.custom !== '') body.custom = input.custom === true || input.custom === 'true' ? 'true' : input.custom === false || input.custom === 'false' ? 'false' : (() => { throw new Error('自定义模式参数无效') })()
  const textFields = [...(includePrompt && can('prompt') ? [['prompt', '歌词/提示词', 5000]] : []), ...(can('gptDescription') ? [['gptDescription', '灵感描述', 3000]] : []), ...(can('title') ? [['title', '歌曲标题', 80]] : []), ...(can('tags') ? [['tags', '音乐风格', 1000]] : []), ...(can('negativeTags') ? [['negativeTags', '反向风格', 1000]] : []), ...(!customModelId && can('personaId') ? [['personaId', 'Persona 风格 ID', 64]] : [])]
  for (const [key, label, max] of textFields) {
    const value = optionalText(input[key], label, max)
    if (value) body[key] = value
  }
  for (const [key, label, values] of [['variety', '风格变化幅度', SUNO6_ENUMS.variety], ['audioFormat', '音频格式', SUNO6_ENUMS.audioFormat]]) {
    if (!can(key)) continue
    const value = optionalEnum(input[key], label, values)
    if (value) body[key] = value
  }
  for (const [key, label] of [['styleWeight', '风格权重'], ['weirdness', '创意偏离'], ['weirdnessConstraint', '创意偏离'], ['audioWeight', '音频权重']]) {
    if (!can(key)) continue
    const value = optionalNumber(input[key], label, 0, 1)
    if (value !== undefined) body[key] = value
  }
  const duration = can('duration') ? optionalNumber(input.duration, '目标时长', 10, 360, true) : undefined
  if (duration !== undefined) body.duration = duration
  if (can('maxMode') && (input.maxMode === true || input.maxMode === 'true')) body.maxMode = 'true'
  if (can('autoLyrics') && (input.autoLyrics === true || input.autoLyrics === 'true')) body.autoLyrics = 'true'
  if (can('vocalGender')) {
    const vocalGender = normalizeVocalGender(input.vocalGender, operation.id)
    if (vocalGender) body.vocalGender = vocalGender
  }
  if (input.webhookUrl) {
    const webhook = new URL(String(input.webhookUrl).trim())
    if (webhook.protocol !== 'https:') throw new Error('Webhook 回调地址必须使用 HTTPS')
    body.webhookUrl = webhook.href
  }
  return body
}

export function buildRunningHubSunoV6Input(model, input = {}) {
  const operation = SUNO6_BY_ID.get(String(input.operation || input.sunoV6Operation || '')) || SUNO6_BY_PATH.get(String(model?.actualModel || ''))
  if (!operation) throw new Error('RunningHub Suno v6 操作无效')
  const body = { operation: operation.id }
  if (['single', 'wild-single', 'mini-single'].includes(operation.id)) {
    body.description = optionalText(input.description || input.prompt, '音乐描述', 3000)
    if (!body.description) throw new Error('音乐描述必须填写')
    body.make_instrumental = input.makeInstrumental ? 'true' : 'false'
  } else if (['custom', 'wild-custom', 'mini-custom'].includes(operation.id)) {
    body.title = optionalText(input.title, '歌曲标题', 80)
    body.prompt = optionalText(input.prompt, '歌词', 5000)
    body.tags = optionalText(input.tags, '音乐风格', 1000)
    if (!body.title || !body.prompt || !body.tags) throw new Error('自定义成曲需要填写标题、歌词和风格')
    body.make_instrumental = input.makeInstrumental ? 'true' : 'false'
  } else if (operation.id === 'sounds') {
    body.prompt = optionalText(input.prompt, '音效描述', 3000)
    if (!body.prompt) throw new Error('音效描述必须填写')
    const soundType = optionalEnum(input.soundType, '音效类型', SUNO6_ENUMS.soundType)
    if (soundType) body.soundType = soundType
    const bpm = optionalNumber(input.bpm, 'BPM', 1, 300, true)
    if (bpm !== undefined) body.bpm = bpm
    const musicalKey = optionalEnum(input.musicalKey, '音乐调式', SUNO6_ENUMS.musicalKey)
    if (musicalKey) body.musicalKey = musicalKey
  } else if (operation.id === 'inspo') {
    const audioUrls = Array.isArray(input.audioUrls) ? input.audioUrls : String(input.audioUrls || '').split(',').map(item => item.trim()).filter(Boolean)
    if (audioUrls.length < 1 || audioUrls.length > 4) throw new Error('灵感音频需要 1–4 个公开 URL')
    body.audioUrls = audioUrls
  } else if (['upload', 'upload-cover', 'upload-extend'].includes(operation.id)) {
    body.audioUrl = optionalText(input.audioUrl, '音频地址', 2048)
    if (!body.audioUrl || !/^https?:\/\//i.test(body.audioUrl)) throw new Error('音频地址必须是 HTTP(S) URL')
    if (operation.id === 'upload-extend') {
      body.continueAt = optionalNumber(input.continueAt, '续写起点', 1, 479)
      if (body.continueAt === undefined) throw new Error('续写起点必须填写')
    } else if (operation.id === 'upload-cover') {
      if (input.instrumental === true || input.instrumental === 'true') body.instrumental = 'true'
      else if (input.instrumental === false || input.instrumental === 'false') body.instrumental = 'false'
    }
  } else if (operation.id === 'mashup') {
    const sourceTaskIds = Array.isArray(input.sourceTaskIds) ? input.sourceTaskIds : String(input.sourceTaskIds || '').split(',').map(item => item.trim()).filter(Boolean)
    if (sourceTaskIds.length !== 2) throw new Error('混搭必须填写两个源任务')
    body.sourceTaskIds = sourceTaskIds
    if (input.audioIndexes) body.audioIndexes = Array.isArray(input.audioIndexes) ? input.audioIndexes : String(input.audioIndexes).split(',').map(item => Number(item.trim()))
    if (input.instrumental === true || input.instrumental === 'true') body.instrumental = 'true'
  } else if (['replace-section', 'sample'].includes(operation.id)) {
    body.sourceTaskId = optionalText(input.sourceTaskId, '源任务', 32)
    if (input.audioIndex !== undefined) body.audioIndex = optionalNumber(input.audioIndex, '音轨序号', 1, 20, true)
    body.startS = optionalText(input.startS, '起点秒数', 16)
    body.endS = optionalText(input.endS, '终点秒数', 16)
    if (!body.sourceTaskId || body.sourceTaskId.length < 15 || !body.startS || !/^\d+(?:\.\d+)?$/.test(body.startS) || !body.endS || !/^\d+(?:\.\d+)?$/.test(body.endS) || Number(body.startS) >= Number(body.endS)) throw new Error('请填写有效的起止秒数和源任务')
    if (operation.id === 'sample' && (input.makeInstrumental === true || input.makeInstrumental === 'true')) body.make_instrumental = 'true'
    if (operation.id === 'replace-section') {
      const infillLyrics = optionalText(input.infillLyrics, '替换歌词', 5000)
      if (infillLyrics) body.infillLyrics = infillLyrics
    }
  } else if (['extend', 'cover', 'add-instrumental', 'add-vocals', 'add-stem'].includes(operation.id)) {
    body.sourceTaskId = optionalText(input.sourceTaskId, '源任务', 32)
    if (!body.sourceTaskId || body.sourceTaskId.length < 15) throw new Error('源任务必须填写 15–32 位 taskId')
    if (input.audioIndex !== undefined) body.audioIndex = optionalNumber(input.audioIndex, '音轨序号', 1, 20, true)
    if (operation.id === 'extend') {
      body.continueAt = optionalNumber(input.continueAt, '续写起点', 1, 3600)
      if (body.continueAt === undefined) throw new Error('续写起点必须填写')
    }
  }
  const allowed = ['single', 'wild-single', 'mini-single'].includes(operation.id)
    ? new Set(['variety', 'vocalGender', 'audioFormat', 'styleWeight', 'weirdnessConstraint'])
    : ['custom', 'wild-custom', 'mini-custom'].includes(operation.id)
      ? new Set(['customModelId', 'prompt', 'title', 'tags', 'negativeTags', 'styleWeight', 'autoLyrics', 'maxMode', 'variety', 'vocalGender', 'audioFormat', 'weirdnessConstraint', 'duration', 'personaId'])
      : SUNO6_OPERATION_FIELDS[operation.id] || null
  if (operation.id === 'upload') {
    appendSuno6Common(body, input, operation, { includePrompt: false, allowed: new Set() })
  } else if (operation.id === 'sounds') {
    appendSuno6Common(body, input, operation, { includePrompt: false, allowed: new Set(['version', 'audioFormat']) })
  } else {
    appendSuno6Common(body, input, operation, { includePrompt: !['single', 'wild-single', 'mini-single'].includes(operation.id), allowed })
  }
  return body
}
