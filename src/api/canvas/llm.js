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
    throw new Error(error.message || error.error || 'LLM 请求失败')
  }
  
  return response.json()
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
