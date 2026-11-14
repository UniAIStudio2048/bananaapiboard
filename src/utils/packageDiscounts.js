import { t as translateUi } from '../i18n/index.js'
const MEDIA_TYPES = [
  ['image', '图片'],
  ['video', '视频'],
  ['audio', '音频']
]

export function getPackageDiscounts(pkg) {
  return MEDIA_TYPES.flatMap(([type, label]) => {
    const rate = Number(pkg?.generation_rates?.[type])
    if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return []
    const discount = Number((rate * 10).toFixed(2))
    return [{ type, get text() { return translateUi('uiMessages.me34f39f4dcc4', { value1: (label), value2: (discount) }) } }]
  })
}
