/**
 * AI Inspiration Assistant API
 * AI 灵感助手相关 API
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

// 获取通用请求头
function getHeaders(options = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(options.json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.extra
  }
}

/**
 * 上传附件到七牛云
 * @param {File} file - 文件对象
 * @returns {Promise<{url: string, storage: string}>} 上传结果
 */
export async function uploadAttachment(file) {
  const formData = new FormData()
  formData.append('images', file)

  const token = localStorage.getItem('token')
  const response = await fetch(getApiUrl('/api/images/upload'), {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '上传附件失败')
  }

  const result = await response.json()
  // 返回第一个上传的URL
  return {
    url: result.urls?.[0] || null,
    storage: result.storage || 'local'
  }
}

/**
 * 批量上传附件到七牛云
 * @param {File[]} files - 文件对象数组
 * @returns {Promise<Array<{url: string, name: string, type: string}>>} 上传结果数组
 */
/**
 * 根据文件对象判断文件类型
 * @param {File} file - 文件对象
 * @returns {string} 文件类型: 'image' | 'video' | 'audio' | 'file'
 */
function detectFileType(file) {
  const mimeType = file.type || ''
  const fileName = file.name || ''
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  // 优先使用 MIME type
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  
  // 如果 MIME type 不准确，根据扩展名判断
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv']
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']
  
  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (audioExts.includes(ext)) return 'audio'
  
  return 'file'
}

export async function uploadAttachments(files) {
  const results = []

  for (const file of files) {
    try {
      const result = await uploadAttachment(file)
      const fileType = detectFileType(file)
      results.push({
        url: result.url,
        name: file.name,
        type: fileType,
        originalFile: file
      })
      console.log(`[AI-Assistant] 文件类型识别: ${file.name} -> ${fileType} (MIME: ${file.type || 'unknown'})`)
    } catch (error) {
      console.error(`[AI-Assistant] 上传文件 ${file.name} 失败:`, error)
      throw new Error(`上传文件 "${file.name}" 失败: ${error.message}`)
    }
  }

  return results
}

/**
 * 获取 AI 助手配置
 * @returns {Promise<Object>} 配置对象
 */
export async function getAIAssistantConfig() {
  const response = await fetch(getApiUrl('/api/canvas/ai-assistant/config'), {
    headers: getHeaders()
  })

  if (!response.ok) {
    return {
      enabled: false,
      modes: [],
      mcp_servers: [],
      deep_think: { enabled: false },
      web_search: { enabled: false }
    }
  }

  return response.json()
}

/**
 * 发送消息到 AI 助手
 * @param {Object} params
 * @param {string} [params.session_id] - 会话ID（新对话不传）
 * @param {string} params.message - 消息内容
 * @param {string} [params.mode_id] - 对话模式ID
 * @param {Object} [params.options] - 选项
 * @param {boolean} [params.options.deep_think] - 启用深度思考
 * @param {boolean} [params.options.web_search] - 启用联网搜索
 * @param {string} [params.options.model] - 指定模型
 * @param {Array} [params.attachments] - 附件列表
 * @returns {Promise<Object>}
 */
export async function sendMessage(params) {
  const response = await fetch(getApiUrl('/api/canvas/ai-assistant/chat'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'AI 助手请求失败')
  }

  return response.json()
}

/**
 * 流式发送消息到 AI 助手
 * @param {Object} params
 * @param {string} [params.session_id] - 会话ID
 * @param {string} params.message - 消息内容
 * @param {string} [params.mode_id] - 对话模式ID
 * @param {Object} [params.options] - 选项
 * @param {Function} params.onContent - 接收内容文本块的回调函数
 * @param {Function} [params.onThinking] - 接收思考过程的回调函数
 * @param {Function} [params.onSession] - 接收会话ID的回调函数
 * @param {Function} [params.onDone] - 完成时的回调函数 (fullContent, result)
 * @param {Function} [params.onError] - 错误回调函数
 * @param {Array} [params.attachments] - 附件列表
 */
export async function sendMessageStream(params) {
  const { onContent, onThinking, onSession, onDone, onError, ...requestParams } = params

  try {
    const response = await fetch(getApiUrl('/api/canvas/ai-assistant/chat'), {
      method: 'POST',
      headers: getHeaders({ json: true }),
      body: JSON.stringify({
        ...requestParams,
        options: {
          ...requestParams.options,
          stream: true
        }
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || error.error || 'AI 助手请求失败')
    }

    // 读取流式响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let fullContent = ''
    let thinkingContent = ''
    let buffer = ''
    let sessionId = null
    let result = null

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        if (onDone && !result) {
          onDone(fullContent, { session_id: sessionId })
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue

        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()

          if (data === '[DONE]') {
            continue
          }

          try {
            const json = JSON.parse(data)

            // 处理自定义类型
            if (json.type) {
              switch (json.type) {
                case 'session':
                  sessionId = json.session_id
                  if (onSession) onSession(sessionId)
                  break

                case 'done':
                  result = {
                    session_id: sessionId,
                    cost: json.cost,
                    balance: json.balance
                  }
                  if (onDone) onDone(fullContent, result)
                  return

                case 'error':
                  throw new Error(json.error || 'AI 助手返回错误')
              }
              continue
            }

            // 处理 OpenAI 标准格式
            if (json.choices?.[0]?.delta) {
              const delta = json.choices[0].delta

              // 普通内容
              if (delta.content) {
                fullContent += delta.content
                if (onContent) onContent(delta.content, fullContent)
              }

              // 思考内容 (reasoning_content 用于一些模型的思考过程)
              if (delta.reasoning_content) {
                thinkingContent += delta.reasoning_content
                if (onThinking) onThinking(delta.reasoning_content, thinkingContent)
              }
            }
          } catch (e) {
            // 忽略解析错误，但不是真正的错误
            if (e.message && !e.message.includes('JSON')) {
              throw e
            }
          }
        }
      }
    }

    return { content: fullContent, thinking: thinkingContent, session_id: sessionId, ...result }
  } catch (error) {
    console.error('[AI-Assistant Stream] 流式请求失败:', error)
    if (onError) {
      onError(error)
    }
    throw error
  }
}

/**
 * 获取用户会话列表
 * @returns {Promise<{sessions: Array}>}
 */
export async function getSessions() {
  const response = await fetch(getApiUrl('/api/canvas/ai-assistant/sessions'), {
    headers: getHeaders()
  })

  if (!response.ok) {
    return { sessions: [] }
  }

  return response.json()
}

/**
 * 删除会话
 * @param {string} sessionId - 会话ID
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteSession(sessionId) {
  const response = await fetch(getApiUrl(`/api/canvas/ai-assistant/session/${sessionId}`), {
    method: 'DELETE',
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '删除会话失败')
  }

  return response.json()
}

/**
 * 获取会话历史消息
 * @param {string} sessionId - 会话ID
 * @returns {Promise<{messages: Array}>}
 */
export async function getSessionMessages(sessionId) {
  const response = await fetch(getApiUrl(`/api/canvas/ai-assistant/session/${sessionId}/messages`), {
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '获取会话历史失败')
  }

  return response.json()
}

/**
 * 模式图标映射
 */
export const MODE_ICONS = {
  sparkles: '✨',
  search: '🔍',
  wand: '🪄',
  chat: '💬',
  image: '🖼️',
  video: '🎬',
  code: '💻',
  book: '📚'
}

/**
 * 获取模式图标
 * @param {string} iconName - 图标名称
 * @returns {string} 图标emoji
 */
export function getModeIcon(iconName) {
  return MODE_ICONS[iconName] || '💡'
}
