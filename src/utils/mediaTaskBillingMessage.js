const NO_CHARGE_TEXT = '未扣除积分'

export function withNoChargeNotice(message, fallback = '任务执行失败') {
  const text = typeof message === 'string' && message.trim()
    ? message.trim()
    : fallback

  if (text.includes(NO_CHARGE_TEXT)) return text

  const normalized = text.replace(/[。.!！\s]+$/, '')
  return `${normalized}，${NO_CHARGE_TEXT}`
}

