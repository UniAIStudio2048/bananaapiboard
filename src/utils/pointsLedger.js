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
