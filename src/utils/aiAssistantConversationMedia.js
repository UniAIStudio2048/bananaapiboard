/**
 * AI 助手对话媒体提及 —— 纯函数（无依赖，可独立 Node 测试）。
 *
 * 支持在输入框输入 @ 时，候选不限于当前待发送附件，
 * 还包括本轮对话中出现过的所有媒体（AI 生成结果 + 用户上传），
 * 合并去重后统一编号（图片1/图片2…、视频1/视频2…、音频1…）。
 */

const TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  file: '文件'
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio'])

const MEDIA_TOOL_NAMES = new Set(['image-gen', 'video-gen', 'task-status'])

function normalizeType(type) {
  return TYPE_LABELS[type] ? type : 'file'
}

/** 从 MCP 工具结果（image-gen/video-gen/task-status 的 result_urls/preview_urls）提取媒体 URL（与消息渲染器 mediaResults 对齐） */
const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|mp4|webm|mov)(?:[?#][^\s"'<>]*)?/gi

function extractUrlsFromToolResult(result) {
  if (!result) return []
  const texts = []
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block && typeof block.text === 'string') texts.push(block.text)
    }
  } else if (typeof result === 'string') {
    texts.push(result)
  }
  const urls = []
  const collect = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 5) return
    for (const key of ['result_urls', 'preview_urls', 'urls', 'images']) {
      const list = Array.isArray(obj[key]) ? obj[key] : []
      for (const item of list) {
        const u = typeof item === 'string' ? item : item && item.url
        if (typeof u === 'string' && u.startsWith('http')) urls.push(u)
      }
    }
    for (const nested of ['task', 'result', 'data']) {
      if (obj[nested] && typeof obj[nested] === 'object') collect(obj[nested], depth + 1)
    }
  }
  for (const text of texts) {
    let parsed = null
    try { parsed = JSON.parse(text) } catch { /* 文本含 <mandatory_next_action> 等后缀时 JSON.parse 失败 */ }
    if (parsed) collect(parsed)
    else {
      // JSON.parse 失败（MCP 工具返回 text = JSON + 提示后缀）→ 直接用 URL 正则抓媒体地址
      for (const match of text.matchAll(MEDIA_URL_RE)) {
        const u = match[0].replace(/[),.;]+$/, '')
        if (u.startsWith('http')) urls.push(u)
      }
    }
  }
  return urls
}

function mediaTypeFromUrl(url) {
  const ext = (String(url || '').split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
  return null
}

/**
 * 从消息列表中提取本轮对话出现的媒体附件（用户上传 + AI 生成），保持出现顺序。
 * 同时扫描 attachments 与 toolEvents（image-gen/video-gen/task-status 结果），
 * 只收集 image/video/audio（file 不纳入 @ 候选），重复 url 去重。
 * @param {Array<Object>} messages - [{ role, attachments, toolEvents }]
 * @returns {Array<{type:string,url:string,name:string}>}
 */
export function buildConversationMediaFromMessages(messages = []) {
  const seen = new Set()
  const media = []
  const push = (type, url, name = '') => {
    const cleanUrl = String(url || '').trim()
    if (!MEDIA_TYPES.has(type) || !cleanUrl || !cleanUrl.startsWith('http') || seen.has(cleanUrl)) return
    seen.add(cleanUrl)
    media.push({ type, url: cleanUrl, name: String(name || '') })
  }
  for (const message of Array.isArray(messages) ? messages : []) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : []
    for (const att of attachments) {
      push(normalizeType(att?.type), att?.url, att?.name)
    }
    const toolEvents = Array.isArray(message?.toolEvents) ? message.toolEvents : []
    for (const te of toolEvents) {
      if (!MEDIA_TOOL_NAMES.has(String(te?.tool || ''))) continue
      const toolName = String(te?.tool || '')
      for (const url of extractUrlsFromToolResult(te?.result)) {
        const type = toolName === 'video-gen' ? 'video' : (mediaTypeFromUrl(url) || 'image')
        push(type, url)
      }
    }
  }
  return media
}

/**
 * 合并「当前待发送附件」与「本轮对话媒体」为 @ 候选列表：
 * 当前附件优先（key 保留，可绑定/移除），对话媒体按 url 去重补入（key 为 url:type:url）。
 * 统一按类型连续编号（图片1/图片2…、视频1/视频2…）。
 * @param {Object} opts
 * @param {Array<Object>} [opts.currentAttachments] - 当前输入框已挂的附件（含 key）
 * @param {Array<Object>} [opts.conversationMedia] - 本轮对话媒体 [{type,url,name}]
 * @returns {Array<Object>} mention items [{key,type,index,label,url,name,preview}]
 */
export function buildConversationMentionCandidates({ currentAttachments = [], conversationMedia = [] } = {}) {
  const seenUrls = new Set()
  const merged = []

  for (const att of Array.isArray(currentAttachments) ? currentAttachments : []) {
    const type = normalizeType(att?.type)
    if (!MEDIA_TYPES.has(type)) continue
    const url = String(att?.url || att?.preview || '').trim()
    if (url) {
      if (seenUrls.has(url)) continue
      seenUrls.add(url)
    }
    merged.push({
      type,
      key: att?.key || `url:${type}:${url}`,
      url,
      name: att?.name || '',
      preview: att?.preview || '',
      attachment: att,
    })
  }

  for (const item of Array.isArray(conversationMedia) ? conversationMedia : []) {
    const type = normalizeType(item?.type)
    if (!MEDIA_TYPES.has(type)) continue
    const url = String(item?.url || '').trim()
    if (!url || seenUrls.has(url)) continue
    seenUrls.add(url)
    merged.push({
      type,
      key: `url:${type}:${url}`,
      url,
      name: item?.name || '',
      preview: item?.preview || '',
      attachment: null,
    })
  }

  const counters = { image: 0, video: 0, audio: 0, file: 0 }
  return merged
    .filter(item => item.key)
    .map((item, orderIndex) => {
      counters[item.type] += 1
      return {
        ...item,
        orderIndex,
        index: counters[item.type],
        label: `${TYPE_LABELS[item.type]}${counters[item.type]}`,
      }
    })
}
