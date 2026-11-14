import { t as translateUi } from '../i18n/index.js'
export const VOICE_DESIGN_STYLES = [
  { value: 'general', get label() { return translateUi('uiMessages.m835b700e028c') } },
  { value: 'narration', get label() { return translateUi('uiMessages.m101f6e6d6095') } },
  { value: 'conversational', get label() { return translateUi('uiMessages.m6bf6d3f3d626') } },
  { value: 'advertising', get label() { return translateUi('uiMessages.m5f9f1409615a') } },
  { value: 'character', get label() { return translateUi('user.role') } },
  { value: 'emotional', get label() { return translateUi('uiMessages.m3e741dd4830a') } }
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
    .filter(model => model?.enabled !== false && ['coze-audio-workflow', 'minimax-audio', 'fish-audio', 'runninghub-audio'].includes(model?.apiType) && !(model?.apiType === 'fish-audio' && model?.capability === 'voice_clone'))
    .map((model, sourceIndex) => ({
      value: model.name || model.id,
      label: model.displayName || model.name || model.id,
      description: model.description || '',
      pointsCost: Number(model.pointsCost) || 0,
      capability: model.capability,
      apiType: model.apiType,
      provider: model.apiType === 'runninghub-audio' ? 'runninghub' : model.apiType === 'minimax-audio' ? 'minimax' : model.apiType === 'fish-audio' ? 'fish' : 'coze',
      pricingMode: model.pricingMode || (model.apiType === 'runninghub-audio' ? 'fixed' : undefined),
      actualModel: model.actualModel || '',
      nodeInfoList: Array.isArray(model.nodeInfoList) ? model.nodeInfoList : [],
      runninghubAppId: model.runninghubAppId || '',
      voiceClonePointsCost: model.voiceClonePointsCost === null || model.voiceClonePointsCost === undefined || model.voiceClonePointsCost === ''
        ? null
        : Math.max(0, Number(model.voiceClonePointsCost) || 0),
      icon: model.icon || '♫',
      groupName: groupMeta.get(model.name || model.id)?.name || '',
      groupLogo: groupMeta.get(model.name || model.id)?.logo || '',
      groupIndex: groupOrder.get(model.name || model.id)?.[0] ?? Number.MAX_SAFE_INTEGER,
      modelIndex: groupOrder.get(model.name || model.id)?.[1] ?? sourceIndex
    }))
    .sort((a, b) => a.groupIndex - b.groupIndex || a.modelIndex - b.modelIndex)
}
