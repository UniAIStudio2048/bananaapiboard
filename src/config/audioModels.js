export const VOICE_DESIGN_STYLES = [
  { value: 'general', label: '通用' },
  { value: 'narration', label: '旁白' },
  { value: 'conversational', label: '对话' },
  { value: 'advertising', label: '广告' },
  { value: 'character', label: '角色' },
  { value: 'emotional', label: '情感' }
]

export function normalizeAudioModels(models = []) {
  return (Array.isArray(models) ? models : [])
    .filter(model => model?.enabled !== false && model?.apiType === 'coze-audio-workflow')
    .map(model => ({
      value: model.name || model.id,
      label: model.displayName || model.name || model.id,
      description: model.description || '',
      pointsCost: Number(model.pointsCost) || 0,
      capability: model.capability,
      apiType: model.apiType
    }))
}
