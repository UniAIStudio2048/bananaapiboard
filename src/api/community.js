/**
 * 社区模块 API
 *
 * 包含社区作品浏览、点赞、发布、购买、Fork 等接口
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

// 获取带租户标识的请求头
function getHeaders(options = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(options.json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.extra
  }
}

// 通用请求方法
async function request(path, options = {}) {
  const { method = 'GET', body, json = true } = options

  const fetchOptions = {
    method,
    headers: getHeaders({ json: json && body })
  }

  if (body) {
    fetchOptions.body = json ? JSON.stringify(body) : body
  }

  const r = await fetch(getApiUrl(path), fetchOptions)

  if (!r.ok) {
    const error = new Error('request_failed')
    error.status = r.status
    try {
      error.data = await r.json()
      error.message = error.data.message || error.data.error || 'request_failed'
    } catch {
      try { error.data = await r.text() } catch {}
    }
    throw error
  }

  const contentType = r.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return r.json()
  }
  return r.text()
}

// 构建查询字符串
function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })

  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

// ==================== 公开接口 ====================

/** 获取轮播图 */
export function getBanners() {
  return request('/api/community/banners')
}

/** 获取分类列表 */
export function getCategories() {
  return request('/api/community/categories')
}

/** 获取标签列表 */
export function getTags() {
  return request('/api/community/tags')
}

/**
 * 获取作品列表
 * @param {Object} params - { page, pageSize, category_id, tag_id, keyword, sort, featured, orientation }
 */
export function getWorks(params = {}) {
  return request(`/api/community/works${buildQuery(params)}`)
}

/** 获取作品详情 */
export function getWorkDetail(id) {
  return request(`/api/community/works/${id}`)
}

/** 获取作品关联的工作流 */
export function getWorkWorkflow(id, workflowId) {
  const query = workflowId ? `?workflow_id=${workflowId}` : ''
  return request(`/api/community/works/${id}/workflow${query}`)
}

// ==================== 公开用户信息接口 ====================

/** 获取社区用户主页 */
export function getCommunityUserProfile(userId) {
  return request(`/api/community/users/${userId}`)
}

/** 获取社区用户作品列表 */
export function getCommunityUserWorks(userId, params = {}) {
  return request(`/api/community/users/${userId}/works${buildQuery(params)}`)
}

// ==================== 用户操作接口（需登录） ====================

/** 点赞/取消点赞 */
export function toggleLike(id) {
  return request(`/api/community/works/${id}/like`, { method: 'POST' })
}

/** 关注/取消关注用户 */
export function toggleFollow(userId) {
  return request(`/api/community/users/${userId}/follow`, { method: 'POST' })
}

/** 获取粉丝列表 */
export function getFollowers(userId, params = {}) {
  return request(`/api/community/users/${userId}/followers${buildQuery(params)}`)
}

/** 获取关注列表 */
export function getFollowing(userId, params = {}) {
  return request(`/api/community/users/${userId}/following${buildQuery(params)}`)
}

/** 收藏/取消收藏作品 */
export function toggleFavorite(id) {
  return request(`/api/community/works/${id}/favorite`, { method: 'POST' })
}

/** 获取我的收藏列表 */
export function getMyFavorites(params = {}) {
  return request(`/api/community/my-favorites${buildQuery(params)}`)
}

/** 获取私信会话列表 */
export function getConversations(params = {}) {
  return request(`/api/community/messages/conversations${buildQuery(params)}`)
}

/** 获取私信会话消息 */
export function getConversationMessages(conversationId, params = {}) {
  return request(`/api/community/messages/conversations/${conversationId}${buildQuery(params)}`)
}

/** 创建私信会话 */
export function createConversation(data) {
  return request('/api/community/messages/conversations', { method: 'POST', body: data })
}

/** 发送私信 */
export function sendMessage(conversationId, data) {
  return request(`/api/community/messages/conversations/${conversationId}/messages`, { method: 'POST', body: data })
}

/** 获取未读消息总数 */
export function getUnreadMessageCount() {
  return request('/api/community/messages/unread-count')
}

/** 切换作品可见性 */
export function toggleWorkVisibility(id, data) {
  return request(`/api/community/works/${id}/visibility`, { method: 'PUT', body: data })
}

/** 发布作品 */
export function publishWork(data) {
  return request('/api/community/works', { method: 'POST', body: data })
}

/** 获取我发布的作品 */
export function getMyWorks(params = {}) {
  return request(`/api/community/my-works${buildQuery(params)}`)
}

/** 更新作品 */
export function updateWork(id, data) {
  return request(`/api/community/works/${id}`, { method: 'PUT', body: data })
}

/** 删除作品 */
export function deleteWork(id) {
  return request(`/api/community/works/${id}`, { method: 'DELETE' })
}

/** 购买作品 */
export function purchaseWork(id) {
  return request(`/api/community/works/${id}/purchase`, { method: 'POST' })
}

/**
 * Fork 作品到个人/团队空间
 * @param {string} id - 作品 ID
 * @param {Object} data - { space_type, team_id }
 */
export function forkWork(id, data) {
  return request(`/api/community/works/${id}/fork`, { method: 'POST', body: data })
}

/** 获取我购买的作品 */
export function getMyPurchases(params = {}) {
  return request(`/api/community/my-purchases${buildQuery(params)}`)
}

/** 获取我的收入记录 */
export function getMyIncome(params = {}) {
  return request(`/api/community/my-income${buildQuery(params)}`)
}

/** 获取社区模板列表 */
export function getTemplates(params = {}) {
  return request(`/api/community/templates${buildQuery(params)}`)
}

/** 获取模板关联的工作流（公开只读预览） */
export function getTemplateWorkflow(templateId) {
  return request(`/api/community/templates/${templateId}/workflow`)
}

/** 克隆模板到个人/团队空间 */
export function cloneTemplate(templateId, data) {
  return request(`/api/community/templates/${templateId}/clone`, { method: 'POST', body: data })
}

/** 获取特色功能列表 */
export function getFeatures() {
  return request('/api/community/features')
}

/** 获取特色功能关联的工作流（托管副本） */
export function getFeatureWorkflow(featureId) {
  return request(`/api/community/features/${featureId}/workflow`)
}

/** 获取作品关联项目的工作流列表 */
export function getProjectWorkflows(workId) {
  return request(`/api/community/works/${workId}/project-workflows`)
}

/** 克隆整个项目（含所有工作流） */
export function forkProject(workId) {
  return request(`/api/community/works/${workId}/fork-project`, { method: 'POST' })
}

/** 获取社区区块自定义名称 */
export function getSectionNames() {
  return request('/api/community/section-names')
}

/** 获取平台抽佣比例 */
export function getPlatformFeeRate() {
  return request('/api/community/platform-fee-rate')
}

// ==================== 用户资料编辑 ====================

/** 更新用户资料（头像、简介） */
export function updateUserProfile(data) {
  return request('/api/user/profile', { method: 'PUT', body: data })
}

/** 上传用户头像 */
export async function uploadAvatar(file) {
  const formData = new FormData()
  formData.append('avatar', file)

  const token = localStorage.getItem('token')
  const r = await fetch(getApiUrl('/api/user/avatar/upload'), {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })

  if (!r.ok) {
    const err = new Error('upload_failed')
    try { err.data = await r.json(); err.message = err.data.message || 'upload_failed' } catch {}
    throw err
  }
  return r.json()
}

/** 上传用户背景图 */
export async function uploadBanner(file) {
  const formData = new FormData()
  formData.append('banner', file)

  const token = localStorage.getItem('token')
  const r = await fetch(getApiUrl('/api/user/banner/upload'), {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })

  if (!r.ok) {
    const err = new Error('upload_failed')
    try { err.data = await r.json(); err.message = err.data.message || 'upload_failed' } catch {}
    throw err
  }
  return r.json()
}
