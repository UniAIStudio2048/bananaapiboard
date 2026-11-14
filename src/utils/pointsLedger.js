import { t as translateUi } from '../i18n/index.js'
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
  return fallback && fallback !== 'user.ledgerType.other' ? fallback : translateUi('user.ledgerType.other')
}

const videoModeLabels = {
  get text2video() { return translateUi('canvas.textNode.textToVideo') }, get t2v() { return translateUi('canvas.textNode.textToVideo') },
  get image2video() { return translateUi('canvas.videoNode.imageToVideo') }, get i2v() { return translateUi('uiMessages.m65d2a0f60dd8') },
  get image2video_first() { return translateUi('uiMessages.m6e8d18137366') }, get image2video_first_last() { return translateUi('uiMessages.ma44f24ac18b3') },
  get 'start-end'() { return translateUi('uiMessages.ma44f24ac18b3') }, get first_last_frame() { return translateUi('uiMessages.ma44f24ac18b3') },
  get multimodal_ref() { return translateUi('uiMessages.mb5ea8197a734') }, get reference() { return translateUi('uiMessages.m0d99795be0dd') }, get r2v() { return translateUi('uiMessages.m0d99795be0dd') },
  get video_edit() { return translateUi('canvas.nodeConfig.videoEdit.label') }, get videoedit() { return translateUi('canvas.nodeConfig.videoEdit.label') }, get video_extend() { return translateUi('canvas.videoNode.videoExtend') },
  get animate_mix() { return translateUi('uiMessages.m161dfb026132') }, get auto() { return translateUi('uiMessages.mdb9773faa309') },
  get std() { return translateUi('uiMessages.mee081e37785f') }, get standard() { return translateUi('uiMessages.mee081e37785f') }, get pro() { return translateUi('uiMessages.m2e8e05657940') }, get fast() { return translateUi('uiMessages.m6e02d1ce18db') }
}

export function getPointsLedgerGenerationDetailsText(item) {
  const details = item?.generation_details || (
    /^generate_cost(?:_|$)/.test(item?.type || '') ? { kind: 'image' } :
    /^video_generation(?:_|$)/.test(item?.type || '') ? { kind: 'video' } : null
  )
  if (!details || !['image', 'video'].includes(details.kind)) return ''
  const ratio = details.aspect_ratio === 'auto' ? translateUi('imageGen.auto') : details.aspect_ratio
  const parts = [translateUi('uiMessages.m0e5cf8aef849', { value1: (details.resolution || translateUi('uiMessages.m7450cc5b16e2')) }), translateUi('uiMessages.m942df42b7766', { value1: (ratio || translateUi('uiMessages.m7450cc5b16e2')) })]
  if (details.kind === 'video') {
    const modes = []
    if (details.mode) modes.push(videoModeLabels[details.mode] || details.mode)
    if (['std', 'standard', 'pro'].includes(details.quality)) {
      const quality = videoModeLabels[details.quality]
      if (!modes.includes(quality)) modes.push(quality)
    }
    parts.push(translateUi('uiMessages.m52b8f0fb5c1c', { value1: (modes.join(' / ') || translateUi('uiMessages.m7450cc5b16e2')) }))
  }
  return parts.join(' · ')
}
