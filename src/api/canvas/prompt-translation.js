import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'

export async function translatePrompt(input) {
  const teamStore = useTeamStore()
  const spaceParams = teamStore.getSpaceParams('current')
  const token = localStorage.getItem('token')
  const response = await fetch(getApiUrl('/api/canvas/llm/translate'), {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      input,
      spaceType: spaceParams.spaceType,
      ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
    })
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.message || result.error || '提示词翻译失败')
  }
  return result
}
