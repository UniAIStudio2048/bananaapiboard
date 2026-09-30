import { ref } from 'vue'

const canvasSpaceFilter = ref(null)
let needsSessionRestore = false

if (typeof window !== 'undefined') {
  const invalidateSessionFilter = () => { needsSessionRestore = true }
  window.addEventListener('auth-session-cleared', invalidateSessionFilter)
  window.addEventListener('auth-session-updated', invalidateSessionFilter)
}

export function getCurrentSpaceFilter(teamStore) {
  if (teamStore.globalSpaceType.value === 'team' && teamStore.globalTeamId.value) {
    return `team-${teamStore.globalTeamId.value}`
  }
  return 'personal'
}

export function useCanvasSpaceFilter(teamStore) {
  if (needsSessionRestore || !canvasSpaceFilter.value) {
    canvasSpaceFilter.value = getCurrentSpaceFilter(teamStore)
    needsSessionRestore = false
  }
  return canvasSpaceFilter
}

export function setCanvasSpaceFilterFromGlobal(teamStore) {
  const nextFilter = getCurrentSpaceFilter(teamStore)
  if (canvasSpaceFilter.value !== nextFilter) {
    canvasSpaceFilter.value = nextFilter
  }
}

export async function syncGlobalSpaceFromFilter(teamStore, spaceFilter) {
  if (spaceFilter === 'personal') {
    if (teamStore.globalSpaceType.value === 'personal') return false
    teamStore.switchToPersonalSpace()
    return true
  }

  if (spaceFilter?.startsWith('team-')) {
    const teamId = spaceFilter.replace('team-', '')
    if (teamStore.globalSpaceType.value === 'team' && teamStore.globalTeamId.value === teamId) {
      return false
    }
    const switched = await teamStore.switchToTeam(teamId)
    return switched !== false
  }

  return false
}
