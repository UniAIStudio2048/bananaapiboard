export const VOICE_DESIGN_STYLES = [
  { value: 'general', label: '通用' },
  { value: 'narration', label: '旁白' },
  { value: 'conversational', label: '对话' },
  { value: 'advertising', label: '广告' },
  { value: 'character', label: '角色' },
  { value: 'emotional', label: '情感' }
]

export function normalizeAudioModels(models = [], groups = []) {
  const groupOrder = new Map()
  const groupMeta = new Map()
  ;(Array.isArray(groups) ? groups : []).forEach((group, groupIndex) => {
    ;(group.models || []).forEach((name, modelIndex) => {
      groupOrder.set(name, [groupIndex, modelIndex])
      groupMeta.set(name, { name: group.name || '未命名分组', logo: group.logo || '' })
    })
  })
  return (Array.isArray(models) ? models : [])
    .filter(model => model?.enabled !== false && model?.apiType === 'coze-audio-workflow')
    .map((model, sourceIndex) => ({
      value: model.name || model.id,
      label: model.displayName || model.name || model.id,
      description: model.description || '',
      pointsCost: Number(model.pointsCost) || 0,
      capability: model.capability,
      apiType: model.apiType,
      icon: model.icon || '♫',
      groupName: groupMeta.get(model.name || model.id)?.name || '',
      groupLogo: groupMeta.get(model.name || model.id)?.logo || '',
      groupIndex: groupOrder.get(model.name || model.id)?.[0] ?? Number.MAX_SAFE_INTEGER,
      modelIndex: groupOrder.get(model.name || model.id)?.[1] ?? sourceIndex
    }))
    .sort((a, b) => a.groupIndex - b.groupIndex || a.modelIndex - b.modelIndex)
}
