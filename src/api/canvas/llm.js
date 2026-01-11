/**
 * Canvas LLM API
 * 大语言模型相关 API
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
 * 获取 LLM 配置（包含可用模型列表）
 */
export async function getLLMConfig() {
  const response = await fetch(getApiUrl('/api/canvas/llm/config'), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    return { enabled: false, models: [], features: [] }
  }
  
  return response.json()
}

/**
 * 通用 LLM 对话
 * @param {Object} params
 * @param {Array} params.messages - 消息数组 [{role: 'user', content: '...'}]
 * @param {string} params.model - 模型ID
 * @param {string} [params.imageUrl] - 可选图片URL
 * @returns {Promise<{success: boolean, result: string, cost: number, balance: Object}>}
 */
export async function chatWithLLM(params) {
  const response = await fetch(getApiUrl('/api/canvas/llm/chat'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(params)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    // 统一积分不足错误提示
    if (error.error === 'insufficient_points' || response.status === 402) {
      throw new Error('当前积分余额不足，任务提交失败')
    }
    throw new Error(error.message || error.error || 'LLM 请求失败')
  }
  
  return response.json()
}

/**
 * 流式 LLM 对话
 * @param {Object} params
 * @param {Array} params.messages - 消息数组
 * @param {string} params.model - 模型ID
 * @param {Function} params.onChunk - 接收文本块的回调函数 (chunk: string) => void
 * @param {Function} [params.onDone] - 完成时的回调函数 (fullText: string) => void
 * @param {Function} [params.onError] - 错误回调函数 (error: Error) => void
 */
export async function chatWithLLMStream(params) {
  const { onChunk, onDone, onError, ...requestParams } = params
  
  try {
    const response = await fetch(getApiUrl('/api/canvas/llm/chat'), {
      method: 'POST',
      headers: getHeaders({ json: true }),
      body: JSON.stringify({
        ...requestParams,
        stream: true // 启用流式输出
      })
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || error.error || 'LLM 请求失败')
    }
    
    // 读取流式响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let fullText = ''
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        // 流结束，触发完成回调
        if (onDone) {
          onDone(fullText)
        }
        break
      }
      
      // 解码数据块
      buffer += decoder.decode(value, { stream: true })
      
      // 处理 SSE 格式的数据
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留不完整的行
      
      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          
          // 检查是否为结束标记
          if (data === '[DONE]') {
            if (onDone) {
              onDone(fullText)
            }
            return
          }
          
          try {
            const json = JSON.parse(data)
            
            // OpenAI 格式的流式响应
            if (json.choices && json.choices[0]?.delta?.content) {
              const chunk = json.choices[0].delta.content
              fullText += chunk
              if (onChunk) {
                onChunk(chunk, fullText)
              }
            }
            // 自定义格式的流式响应
            else if (json.content || json.text || json.chunk) {
              const chunk = json.content || json.text || json.chunk
              fullText += chunk
              if (onChunk) {
                onChunk(chunk, fullText)
              }
            }
          } catch (e) {
            // 如果不是 JSON，可能是纯文本
            if (data && data !== '[DONE]') {
              fullText += data
              if (onChunk) {
                onChunk(data, fullText)
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[LLM Stream] 流式请求失败:', error)
    if (onError) {
      onError(error)
    }
    throw error
  }
}

/**
 * 通用 LLM 调用（预设动作）
 */
async function callLLM(action, params) {
  const response = await fetch(getApiUrl(`/api/canvas/llm/${action}`), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(params)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    // 统一积分不足错误提示
    if (error.error === 'insufficient_points' || response.status === 402) {
      throw new Error('当前积分余额不足，任务提交失败')
    }
    throw new Error(error.message || error.error || 'LLM 请求失败')
  }
  
  return response.json()
}

/**
 * 提示词优化
 * @param {string} text - 原始提示词
 * @param {string} [model] - 可选模型
 * @returns {Promise<{result: string, cost: number}>}
 */
export async function enhancePrompt(text, model) {
  return callLLM('prompt-enhance', { input: text, model })
}

/**
 * 图片描述/反推提示词
 * @param {string} imageUrl - 图片URL
 * @param {string} [model] - 可选模型
 * @returns {Promise<{result: string, cost: number}>}
 */
export async function describeImage(imageUrl, model) {
  return callLLM('image-describe', { imageUrl, model })
}

/**
 * 内容扩写
 * @param {string} text - 原始内容
 * @param {string} [model] - 可选模型
 * @returns {Promise<{result: string, cost: number}>}
 */
export async function expandContent(text, model) {
  return callLLM('content-expand', { input: text, model })
}

/**
 * 生成分镜脚本
 * @param {string} text - 场景描述
 * @param {string} [model] - 可选模型
 * @returns {Promise<{result: string, cost: number}>}
 */
export async function generateStoryboard(text, model) {
  return callLLM('storyboard', { input: text, model })
}

/**
 * LLM 积分消耗配置
 */
export const LLM_POINTS_COST = {
  'prompt-enhance': 1,
  'image-describe': 2,
  'content-expand': 1,
  'storyboard': 3,
  'chat': 1
}

/**
 * 获取 LLM 功能的积分消耗
 */
export function getLLMCost(action) {
  return LLM_POINTS_COST[action] || 1
}

/**
 * ======================================
 * 用户自定义LLM预设管理API
 * ======================================
 */

/**
 * 获取用户自定义预设列表
 * @returns {Promise<{success: boolean, presets: Array, total: number, limit: number}>}
 */
export async function getUserLLMPresets() {
  const response = await fetch(getApiUrl('/api/canvas/llm/user-presets'), {
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '获取预设列表失败')
  }

  return response.json()
}

/**
 * 创建用户自定义预设
 * @param {Object} params
 * @param {string} params.name - 预设名称（必填，最长100字符）
 * @param {string} params.systemPrompt - 系统提示词（必填，最长2048字符）
 * @returns {Promise<{success: boolean, preset: Object}>}
 */
export async function createUserLLMPreset({ name, systemPrompt }) {
  const response = await fetch(getApiUrl('/api/canvas/llm/user-presets'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify({ name, systemPrompt })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '创建预设失败')
  }

  return response.json()
}

/**
 * 更新用户自定义预设
 * @param {string} id - 预设ID
 * @param {Object} params
 * @param {string} [params.name] - 新的预设名称
 * @param {string} [params.systemPrompt] - 新的系统提示词
 * @returns {Promise<{success: boolean, preset: Object}>}
 */
export async function updateUserLLMPreset(id, { name, systemPrompt }) {
  const response = await fetch(getApiUrl(`/api/canvas/llm/user-presets/${id}`), {
    method: 'PUT',
    headers: getHeaders({ json: true }),
    body: JSON.stringify({ name, systemPrompt })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '更新预设失败')
  }

  return response.json()
}

/**
 * 删除用户自定义预设
 * @param {string} id - 预设ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function deleteUserLLMPreset(id) {
  const response = await fetch(getApiUrl(`/api/canvas/llm/user-presets/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '删除预设失败')
  }

  return response.json()
}
