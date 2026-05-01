import { ref } from 'vue'

const canvasSpaceFilter = ref(null)

export function getCurrentSpaceFilter(teamStore) {
  if (teamStore.globalSpaceType.value === 'team' && teamStore.globalTeamId.value) {
    return `team-${teamStore.globalTeamId.value}`
  }
  return 'personal'
}

export function useCanvasSpaceFilter(teamStore) {
  if (!canvasSpaceFilter.value) {
    canvasSpaceFilter.value = getCurrentSpaceFilter(teamStore)
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
