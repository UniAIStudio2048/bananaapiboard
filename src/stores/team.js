/**
 * Team Space Store
 * 团队空间状态管理
 */
import { ref, computed, watch } from 'vue'
import api from '@/api/client'
import { t } from '@/i18n'

// ==================== 状态 ====================

// 全局当前空间状态
const globalSpaceType = ref('personal') // 'personal' | 'team'
const globalTeamId = ref(null)
const globalTeam = ref(null)

// 用户所有团队列表
const myTeams = ref([])

// 待处理的邀请
const pendingInvitations = ref([])

// 当前团队成员列表
const teamMembers = ref([])

// 加载状态
const loading = ref(false)
const invitationsLoading = ref(false)

// 当前用户ID（从外部注入）
let currentUserId = null

// ==================== 计算属性 ====================

const isInTeamSpace = computed(() => globalSpaceType.value === 'team')

const currentSpaceLabel = computed(() => {
  if (globalSpaceType.value === 'personal') return t('team.personalSpace')
  return globalTeam.value?.name || t('team.teamSpace')
})

const currentSpaceIcon = computed(() => {
  return globalSpaceType.value === 'personal' ? '👤' : '👥'
})

// 当前用户在当前团队的角色
const myRoleInCurrentTeam = computed(() => {
  if (!globalTeam.value) return null
  return globalTeam.value.my_role
})

const isTeamOwner = computed(() => myRoleInCurrentTeam.value === 'owner')
const isTeamAdmin = computed(() => ['owner', 'admin'].includes(myRoleInCurrentTeam.value))

// 待处理邀请数量
const pendingInvitationsCount = computed(() => pendingInvitations.value.length)

// ==================== 方法 ====================

/**
 * 设置当前用户ID
 */
function setCurrentUserId(userId) {
  currentUserId = userId
}

/**
 * 加载用户的所有团队
 */
async function loadMyTeams() {
  try {
    loading.value = true
    const data = await api.get('/api/teams')
    if (data.success) {
      myTeams.value = data.teams || []
    }
  } catch (error) {
    console.error('[TeamStore] 加载团队列表失败:', error)
    myTeams.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 加载待处理的邀请
 */
async function loadPendingInvitations() {
  try {
    invitationsLoading.value = true
    const data = await api.get('/api/teams/invitations')
    if (data.success) {
      pendingInvitations.value = data.invitations || []
    }
  } catch (error) {
    console.error('[TeamStore] 加载邀请列表失败:', error)
    pendingInvitations.value = []
  } finally {
    invitationsLoading.value = false
  }
}

/**
 * 加载团队成员
 */
async function loadTeamMembers(teamId) {
  try {
    const data = await api.get(`/api/teams/${teamId}/members`)
    if (data.success) {
      teamMembers.value = data.members || []
    }
  } catch (error) {
    console.error('[TeamStore] 加载团队成员失败:', error)
    teamMembers.value = []
  }
}

/**
 * 获取用户专属的 localStorage key
 */
function getUserSpaceKey(key) {
  return currentUserId ? `user_${currentUserId}_${key}` : key
}

/**
 * 保存空间状态到 localStorage（绑定用户ID）
 */
function saveSpaceState(spaceType, teamId = null) {
  if (!currentUserId) return
  
  localStorage.setItem(getUserSpaceKey('spaceType'), spaceType)
  if (teamId) {
    localStorage.setItem(getUserSpaceKey('teamId'), teamId)
  } else {
    localStorage.removeItem(getUserSpaceKey('teamId'))
  }
}

/**
 * 切换到个人空间
 */
function switchToPersonalSpace() {
  globalSpaceType.value = 'personal'
  globalTeamId.value = null
  globalTeam.value = null
  teamMembers.value = []
  
  // 保存到 localStorage（绑定用户ID）
  saveSpaceState('personal')
  
  // 触发空间切换事件
  window.dispatchEvent(new CustomEvent('space-switched', { 
    detail: { spaceType: 'personal', teamId: null } 
  }))
}

/**
 * 切换到团队空间
 */
async function switchToTeam(teamId) {
  const team = myTeams.value.find(t => t.id === teamId)
  if (!team) {
    console.error('[TeamStore] 团队不存在:', teamId)
    return false
  }
  
  globalSpaceType.value = 'team'
  globalTeamId.value = teamId
  globalTeam.value = team
  
  // 加载团队成员
  await loadTeamMembers(teamId)
  
  // 保存到 localStorage（绑定用户ID）
  saveSpaceState('team', teamId)
  
  // 触发空间切换事件
  window.dispatchEvent(new CustomEvent('space-switched', { 
    detail: { spaceType: 'team', teamId } 
  }))
  
  return true
}

/**
 * 从 localStorage 恢复空间状态
 * - 读取用户上次选择的空间
 * - 如果是团队空间，检查团队是否还存在
 * - 团队不存在则切换回个人空间
 */
async function restoreSpaceState() {
  // 读取用户专属的空间状态
  const savedSpaceType = localStorage.getItem(getUserSpaceKey('spaceType'))
  const savedTeamId = localStorage.getItem(getUserSpaceKey('teamId'))
  
  // 兼容旧版本：如果没有用户专属的状态，尝试读取旧的全局状态
  const legacySpaceType = localStorage.getItem('currentSpaceType')
  const legacyTeamId = localStorage.getItem('currentTeamId')
  
  const spaceType = savedSpaceType || legacySpaceType
  const teamId = savedTeamId || legacyTeamId
  
  // 清理旧版本的全局状态
  localStorage.removeItem('currentSpaceType')
  localStorage.removeItem('currentTeamId')
  
  if (spaceType === 'team' && teamId) {
    // 先加载团队列表
    await loadMyTeams()
    
    // 检查团队是否还存在（用户可能已被移除或团队已解散）
    const team = myTeams.value.find(t => t.id === teamId)
    if (team) {
      // 团队存在，恢复到该团队空间
      await switchToTeam(teamId)
      console.log('[TeamStore] 已恢复到团队空间:', team.name)
    } else {
      // 团队不存在，切换回个人空间
      console.log('[TeamStore] 上次选择的团队已不存在，切换到个人空间')
      switchToPersonalSpace()
    }
  } else {
    // 默认个人空间
    switchToPersonalSpace()
    await loadMyTeams()
  }
  
  // 加载邀请
  await loadPendingInvitations()
}

/**
 * 创建团队
 */
async function createTeam(name, description = '', avatar = null) {
  try {
    const data = await api.post('/api/teams', { name, description, avatar })
    if (data.success) {
      myTeams.value.unshift(data.team)
      return { success: true, team: data.team }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 创建团队失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 更新团队信息
 */
async function updateTeam(teamId, updates) {
  try {
    const data = await api.put(`/api/teams/${teamId}`, updates)
    if (data.success) {
      // 更新本地数据
      const index = myTeams.value.findIndex(t => t.id === teamId)
      if (index !== -1) {
        myTeams.value[index] = { ...myTeams.value[index], ...updates }
      }
      if (globalTeamId.value === teamId) {
        globalTeam.value = { ...globalTeam.value, ...updates }
      }
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 更新团队失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 解散团队
 */
async function dissolveTeam(teamId) {
  try {
    const data = await api.delete(`/api/teams/${teamId}`)
    if (data.success) {
      // 从列表中移除
      myTeams.value = myTeams.value.filter(t => t.id !== teamId)
      
      // 如果当前在这个团队，切换到个人空间
      if (globalTeamId.value === teamId) {
        switchToPersonalSpace()
      }
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 解散团队失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 邀请成员
 * @param {string} teamId - 团队ID
 * @param {string|null} inviteeId - 被邀请用户ID（可选）
 * @param {string} role - 角色
 * @param {string} message - 邀请消息
 * @param {string|null} inviteeEmail - 被邀请用户邮箱（当没有inviteeId时使用）
 */
async function inviteMember(teamId, inviteeId, role = 'member', message = '', inviteeEmail = null) {
  try {
    const payload = { role, message }
    if (inviteeId) {
      payload.inviteeId = inviteeId
    } else if (inviteeEmail) {
      payload.inviteeEmail = inviteeEmail
    }
    
    const data = await api.post(`/api/teams/${teamId}/invite`, payload)
    if (data.success) {
      // 如果自动接受了，刷新团队成员列表
      if (data.autoAccepted && globalTeamId.value === teamId) {
        await loadTeamMembers(teamId)
      }
      return { success: true, invitation: data.invitation, autoAccepted: data.autoAccepted }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 邀请成员失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 移除成员
 */
async function removeMember(teamId, userId) {
  try {
    const data = await api.delete(`/api/teams/${teamId}/members/${userId}`)
    if (data.success) {
      teamMembers.value = teamMembers.value.filter(m => m.user_id !== userId)
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 移除成员失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 修改成员角色
 */
async function changeMemberRole(teamId, userId, role) {
  try {
    const data = await api.put(`/api/teams/${teamId}/members/${userId}/role`, { role })
    if (data.success) {
      const member = teamMembers.value.find(m => m.user_id === userId)
      if (member) {
        member.role = role
      }
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 修改角色失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 退出团队
 */
async function leaveTeam(teamId) {
  try {
    const data = await api.post(`/api/teams/${teamId}/leave`)
    if (data.success) {
      myTeams.value = myTeams.value.filter(t => t.id !== teamId)
      if (globalTeamId.value === teamId) {
        switchToPersonalSpace()
      }
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 退出团队失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 转让团队所有权
 */
async function transferOwnership(teamId, newOwnerId) {
  try {
    const data = await api.post(`/api/teams/${teamId}/transfer`, { newOwnerId })
    if (data.success) {
      // 重新加载团队信息
      await loadMyTeams()
      if (globalTeamId.value === teamId) {
        const team = myTeams.value.find(t => t.id === teamId)
        if (team) {
          globalTeam.value = team
          await loadTeamMembers(teamId)
        }
      }
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 转让所有权失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 接受邀请
 */
async function acceptInvitation(inviteId) {
  try {
    const data = await api.post(`/api/teams/invitations/${inviteId}/accept`)
    if (data.success) {
      // 从邀请列表中移除
      pendingInvitations.value = pendingInvitations.value.filter(i => i.id !== inviteId)
      // 重新加载团队列表
      await loadMyTeams()
      return { success: true, teamId: data.teamId }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 接受邀请失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 拒绝邀请
 */
async function rejectInvitation(inviteId) {
  try {
    const data = await api.post(`/api/teams/invitations/${inviteId}/reject`)
    if (data.success) {
      pendingInvitations.value = pendingInvitations.value.filter(i => i.id !== inviteId)
      return { success: true }
    }
    return { success: false, error: data.error, message: data.message }
  } catch (error) {
    console.error('[TeamStore] 拒绝邀请失败:', error)
    return { success: false, error: 'request_failed', message: '请求失败' }
  }
}

/**
 * 搜索可邀请的用户
 */
async function searchUsers(query, teamId = null) {
  try {
    const params = new URLSearchParams({ q: query })
    if (teamId) params.append('teamId', teamId)
    
    const data = await api.get(`/api/teams/search-users?${params.toString()}`)
    if (data.success) {
      return { success: true, users: data.users || [] }
    }
    return { success: false, users: [] }
  } catch (error) {
    console.error('[TeamStore] 搜索用户失败:', error)
    return { success: false, users: [] }
  }
}

/**
 * 获取空间筛选参数（供 API 调用）
 * @param {string} panelFilter - 面板筛选状态: 'current' | 'personal' | 'team-xxx' | 'all'
 */
function getSpaceParams(panelFilter = 'current') {
  if (panelFilter === 'all') {
    return { spaceType: 'all' }
  }
  if (panelFilter === 'current') {
    return globalSpaceType.value === 'personal' 
      ? { spaceType: 'personal' }
      : { spaceType: 'team', teamId: globalTeamId.value }
  }
  if (panelFilter === 'personal') {
    return { spaceType: 'personal' }
  }
  // panelFilter 是 team-xxx 格式
  if (panelFilter.startsWith('team-')) {
    const teamId = panelFilter.replace('team-', '')
    return { spaceType: 'team', teamId }
  }
  return { spaceType: 'personal' }
}

/**
 * 检查是否可以删除资源
 * @param {Object} resource - 资源对象，需包含 type, creator_id
 * @param {string} spaceType - 空间类型
 * @param {string} teamId - 团队ID（可选）
 */
function canDeleteResource(resource, spaceType = null, teamId = null) {
  const checkSpaceType = spaceType || globalSpaceType.value
  const checkTeamId = teamId || globalTeamId.value
  
  // 个人空间：可以删除自己的资源
  if (checkSpaceType === 'personal') return true
  
  // 团队空间：检查权限
  const team = myTeams.value.find(t => t.id === checkTeamId)
  if (!team) return false
  
  // 所有者可以删除任何资源
  if (team.my_role === 'owner') return true
  
  // 工作流：创建者可以删除自己的
  if (resource.type === 'workflow' && resource.creator_id === currentUserId) {
    return true
  }
  
  // 历史记录和资产：团队空间内成员不可删除（只有owner可以）
  return false
}

/**
 * 检查是否可以编辑资源
 */
function canEditResource(resource, spaceType = null) {
  const checkSpaceType = spaceType || globalSpaceType.value
  
  // 个人空间和团队空间都可以编辑
  return true
}

/**
 * 获取所有可选的空间列表（用于面板中的空间切换器）
 */
function getAllSpaces() {
  const spaces = [
    { id: 'personal', name: '个人', icon: '👤', type: 'personal' }
  ]
  
  myTeams.value.forEach(team => {
    spaces.push({
      id: `team-${team.id}`,
      teamId: team.id,
      name: team.name,
      icon: '👥',
      type: 'team',
      role: team.my_role,
      memberCount: team.member_count
    })
  })
  
  return spaces
}

/**
 * 重置所有状态
 * @param {boolean} clearStorage - 是否清除 localStorage 中的空间记忆（默认不清除，保留记忆功能）
 */
function reset(clearStorage = false) {
  // 如果需要清除存储，先在清除 currentUserId 之前执行
  if (clearStorage && currentUserId) {
    localStorage.removeItem(getUserSpaceKey('spaceType'))
    localStorage.removeItem(getUserSpaceKey('teamId'))
  }
  
  globalSpaceType.value = 'personal'
  globalTeamId.value = null
  globalTeam.value = null
  myTeams.value = []
  pendingInvitations.value = []
  teamMembers.value = []
  loading.value = false
  invitationsLoading.value = false
  currentUserId = null
  
  // 清理旧版本的全局状态
  localStorage.removeItem('currentSpaceType')
  localStorage.removeItem('currentTeamId')
}

// ==================== 导出 ====================

export function useTeamStore() {
  return {
    // 状态
    globalSpaceType,
    globalTeamId,
    globalTeam,
    myTeams,
    pendingInvitations,
    teamMembers,
    loading,
    invitationsLoading,
    
    // 计算属性
    isInTeamSpace,
    currentSpaceLabel,
    currentSpaceIcon,
    myRoleInCurrentTeam,
    isTeamOwner,
    isTeamAdmin,
    pendingInvitationsCount,
    
    // 方法
    setCurrentUserId,
    loadMyTeams,
    loadPendingInvitations,
    loadTeamMembers,
    switchToPersonalSpace,
    switchToTeam,
    restoreSpaceState,
    createTeam,
    updateTeam,
    dissolveTeam,
    inviteMember,
    removeMember,
    changeMemberRole,
    leaveTeam,
    transferOwnership,
    acceptInvitation,
    rejectInvitation,
    searchUsers,
    getSpaceParams,
    canDeleteResource,
    canEditResource,
    getAllSpaces,
    reset
  }
}

