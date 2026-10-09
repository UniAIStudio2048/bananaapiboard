// 画布与个人中心共用类型翻译，积分来源后缀不改变操作名称。
export function getPointsLedgerTypeText(type, t) {
  const lookup = value => {
    for (const key of [`pointsType.${value}`, `user.ledgerType.${value}`]) {
      const text = t(key)
      if (text && text !== key) return text
    }
    return ''
  }
  if (typeof type === 'string' && type) {
    const exact = lookup(type)
    if (exact) return exact
    const base = type.replace(/_(package|permanent|team|subuser)$/, '')
    if (base !== type) {
      const text = lookup(base)
      if (text) return text
    }
    if (/[\u4e00-\u9fff]/.test(type) && !/[a-z]/i.test(type)) return type
  }
  const fallback = t('user.ledgerType.other')
  return fallback && fallback !== 'user.ledgerType.other' ? fallback : '积分变动'
}

const videoModeLabels = {
  text2video: '文生视频', t2v: '文生视频',
  image2video: '图生视频', i2v: '首帧驱动',
  image2video_first: '首帧图生视频', image2video_first_last: '首尾帧',
  'start-end': '首尾帧', first_last_frame: '首尾帧',
  multimodal_ref: '多模态参考', reference: '多图参考', r2v: '多图参考',
  video_edit: '视频编辑', videoedit: '视频编辑', video_extend: '视频延长',
  animate_mix: '动作迁移', auto: '自动选择',
  std: '标准模式', standard: '标准模式', pro: '专业模式', fast: '快速模式'
}

export function getPointsLedgerGenerationDetailsText(item) {
  const details = item?.generation_details || (
    /^generate_cost(?:_|$)/.test(item?.type || '') ? { kind: 'image' } :
    /^video_generation(?:_|$)/.test(item?.type || '') ? { kind: 'video' } : null
  )
  if (!details || !['image', 'video'].includes(details.kind)) return ''
  const ratio = details.aspect_ratio === 'auto' ? '自动' : details.aspect_ratio
  const parts = [`分辨率：${details.resolution || '未记录'}`, `尺寸比例：${ratio || '未记录'}`]
  if (details.kind === 'video') {
    const modes = []
    if (details.mode) modes.push(videoModeLabels[details.mode] || details.mode)
    if (['std', 'standard', 'pro'].includes(details.quality)) {
      const quality = videoModeLabels[details.quality]
      if (!modes.includes(quality)) modes.push(quality)
    }
    parts.push(`视频模式：${modes.join(' / ') || '未记录'}`)
  }
  return parts.join(' · ')
}
