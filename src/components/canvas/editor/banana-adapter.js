import { getApiUrl, getMediaUrl, getTenantHeaders } from '@/config/tenant'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import { getHistory } from '@/api/canvas/history'
import { useTeamStore } from '@/stores/team'
import { validateMediaUploadFile } from './media-upload'

async function request(path, method = 'GET', body) {
  const token = localStorage.getItem('token')
  const response = await fetch(getApiUrl(`/api/video-tools/editor${path}`), {
    method, credentials: 'include', headers: {
      ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || '视频剪辑请求失败')
  return result
}

export function createBananaEditorApi() {
  return {
    async source(_project, resource) {
      const url = getMediaUrl(resource)
      if (!/^https?:\/\//.test(url) && !url.startsWith('/')) throw new Error('素材地址无效')
      return url
    },
    async checkProjectAccess() { /* Access is enforced by the versioned workflow and job APIs. */ },
    config: () => request('/config'),
    preferences: () => request('/preferences'),
    savePreferences: values => request('/preferences', 'PUT', { values }),
    quote: (project, input) => request('/quotes', 'POST', { ...input, project, ...useTeamStore().getSpaceParams('current') }),
    submit: (_project, id) => request(`/jobs/${encodeURIComponent(id)}`, 'POST'),
    get: (_project, id) => request(`/jobs/${encodeURIComponent(id)}`),
    list: project => request(`/jobs?project=${encodeURIComponent(project)}`).then(value => value.items),
    result: (_project, id, kind) => request(`/jobs/${encodeURIComponent(id)}/result${kind ? `?kind=${kind}` : ''}`).then(value => getMediaUrl(value.url)),
    subtitles: (_project, id) => request(`/jobs/${encodeURIComponent(id)}/subtitles`).then(value => value.segments)
  }
}

export function createBananaEditorLibrary() {
  const subscribers = new Set()
  let snapshot = {
    folderScope: 'personal', folderStatus: 'idle', folders: [], activeFolderUuid: null,
    assets: { status: 'idle', items: [], filter: 'all', page: 1, page_size: 30, total: 0 },
    history: { status: 'idle', items: [], filter: 'all', page: 1, page_size: 30, total: 0 },
    tasks: [], upload: {}
  }
  const update = patch => { snapshot = { ...snapshot, ...patch }; subscribers.forEach(callback => callback()) }
  let historyRows = []
  let assetRequest = 0, historyRequest = 0
  const library = {
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback) },
    getSnapshot: () => snapshot,
    async uploadAsset(file) {
      const { modality } = validateMediaUploadFile(file)
      const result = await uploadCanvasMedia(file, modality)
      const url = result.url || result.data?.url
      if (!url) throw new Error('上传未返回素材地址')
      update({ upload: { resource_uuid: url } })
      return true
    },
    async loadFolders(scope) {
      update({ folderScope: scope, folderStatus: 'ready', folders: [{ uuid: scope, name: scope === 'team' ? '团队资产' : '个人资产' }], activeFolderUuid: scope })
      await library.loadAssetPage(1, snapshot.assets.filter)
    },
    async openFolder(id) { update({ activeFolderUuid: id }); await library.loadAssetPage(1) },
    async loadAssetPage(page, filter = snapshot.assets.filter) {
      const requestId = ++assetRequest
      update({ assets: { ...snapshot.assets, page, filter, status: 'loading' } })
      try {
        const result = await request(`/assets?${new URLSearchParams({ page, type: filter, space: snapshot.folderScope })}`)
        if (requestId !== assetRequest) return
        const rows = result.assets || result.data?.assets || []
        update({ assets: { ...snapshot.assets, status: 'ready', total: result.total ?? rows.length, items: rows.filter(row => row.url && ['video', 'audio', 'image'].includes(row.type)).map(row => ({ ...row, uuid: row.url })) } })
      } catch (error) { if (requestId === assetRequest) update({ assets: { ...snapshot.assets, status: 'error' } }); throw error }
    },
    async loadHistoryPage(page, filter = snapshot.history.filter) {
      const requestId = ++historyRequest
      update({ history: { ...snapshot.history, page, filter, status: 'loading' } })
      try {
        const result = await getHistory({ ...(filter === 'all' ? {} : { type: filter }), ...useTeamStore().getSpaceParams('current') })
        if (requestId !== historyRequest) return
        historyRows = (result.history || []).filter(row => row.url && ['video', 'audio', 'image'].includes(row.type) && (filter === 'all' || row.type === filter))
        update({ history: { ...snapshot.history, status: 'ready', total: historyRows.length, items: historyRows.slice((page - 1) * 30, page * 30).map(row => ({ task_uuid: `${row.type}:${row.id}`, modality: row.type, status: 'succeeded', created_at: row.created_at })) } })
      } catch (error) { if (requestId === historyRequest) update({ history: { ...snapshot.history, status: 'error' } }); throw error }
    },
    async loadHistoryTask(id) {
      const row = historyRows.find(row => `${row.type}:${row.id}` === id)
      if (!row) throw new Error('历史素材不存在')
      update({ tasks: [...snapshot.tasks.filter(task => task.uuid !== id), { uuid: id, resources: [{ uuid: row.url, name: row.name || row.type, type: row.type }] }] })
    }
  }
  return library
}
