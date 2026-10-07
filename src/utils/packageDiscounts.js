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
    return [{ type, text: `${label}生成享 ${discount} 折` }]
  })
}
