export const WORKFLOW_SHARE_MODES = Object.freeze(['disabled', 'view', 'clone'])

export function normalizeWorkflowShareMode(mode) {
  return WORKFLOW_SHARE_MODES.includes(mode) ? mode : 'disabled'
}

export function buildWorkflowShareUrl(origin, token) {
  if (!origin || !token) return ''
  return `${String(origin).replace(/\/+$/, '')}/share/workflows/${encodeURIComponent(token)}`
}

export function getWorkflowShareAccess({ spaceType = 'personal', teamId = '', teams = [] } = {}) {
  if (spaceType !== 'team') {
    return { canManage: true, statusEndpoint: false }
  }

  const team = teams.find(item => String(item?.id) === String(teamId))
  const canManage = ['owner', 'admin'].includes(team?.my_role)
  return { canManage, statusEndpoint: !canManage }
}
