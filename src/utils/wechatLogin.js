export const WECHAT_ATTEMPT_KEY = 'wechat-login-attempt'

export function safeWechatReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\s]|%5c|%2f/i.test(value) || value.startsWith('/wechat/callback')) return '/canvas'
  return value
}

export async function createWechatAttempt(cryptoImpl = globalThis.crypto) {
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(32))
  const verifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return { verifier, challenge }
}

export function readWechatCallback({ href, stored, tenantId, now = Date.now() }) {
  const params = new URL(href).searchParams
  if (!stored || stored.tenantId !== tenantId || !stored.state || params.get('state') !== stored.state || !stored.verifier || !Number.isFinite(stored.expiresAt) || stored.expiresAt <= now) throw new Error('invalid_wechat_state')
  const code = params.get('code')
  if (!code) throw new Error('wechat_authorization_cancelled')
  return { code, state: stored.state, verifier: stored.verifier, returnPath: safeWechatReturnPath(stored.returnPath) }
}

export function wechatLoginError(error) {
  return ({
    invalid_wechat_state: '扫码已过期或不是从当前浏览器发起，请重新扫码。',
    wechat_authorization_cancelled: '微信授权未完成，请重新扫码并确认授权。',
    wechat_authorization_failed: '微信授权失败，请重新扫码；若持续失败，请联系管理员检查微信应用配置。',
    wechat_disabled: '当前站点已关闭微信登录，请使用其他方式登录。',
    wechat_config_changed: '微信登录配置已更新，请重新扫码。',
    wechat_origin_mismatch: '当前网站与微信授权回调地址不一致，请联系管理员。',
    wechat_already_bound: '该微信或本站账号已有关联，无法重复绑定。',
    account_unavailable: '账号当前不可用，请联系管理员。',
    tenant_unavailable: '当前站点暂不可用，请联系管理员。',
    max_users_reached: '当前站点用户数量已达上限，请联系管理员。',
    unauthorized: '请先登录本站账号后再绑定微信。',
    too_many_requests: '操作过于频繁，请稍后再试。'
  })[error.message] || '微信登录暂时不可用，请稍后重试或使用其他登录方式。'
}
