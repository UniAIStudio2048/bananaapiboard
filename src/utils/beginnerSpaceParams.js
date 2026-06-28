export function getCurrentBeginnerSpaceParams(teamStore) {
  const params = teamStore?.getSpaceParams?.('current') || { spaceType: 'personal' }
  const spaceType = params.spaceType === 'team' && params.teamId ? 'team' : 'personal'
  return {
    spaceType,
    teamId: spaceType === 'team' ? params.teamId : null
  }
}

export function buildSpaceHistoryUrl(endpoint, params = {}) {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit || 50))
  query.set('offset', String(params.offset || 0))
  query.set('spaceType', params.spaceType || 'personal')
  if (params.spaceType === 'team' && params.teamId) {
    query.set('teamId', params.teamId)
  }
  return `${endpoint}?${query.toString()}`
}

export function appendSpaceParamsToFormData(formData, params = {}) {
  formData.append('spaceType', params.spaceType || 'personal')
  if (params.spaceType === 'team' && params.teamId) {
    formData.append('teamId', params.teamId)
  }
}
