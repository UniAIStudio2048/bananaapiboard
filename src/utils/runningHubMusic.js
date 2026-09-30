export function buildRunningHubMusicInput(model, input) {
  const modelPath = String(model?.actualModel || '')
  if (!['rhart-audio/suno-v5.5/single', 'rhart-audio/suno-v5.5/custom'].includes(modelPath)) throw new Error('RunningHub 音乐模型配置无效')
  const custom = modelPath.endsWith('/custom')
  const prompt = String(input.prompt || '').trim()
  const title = String(input.title || '').trim()
  const tags = String(input.tags || '').trim()
  const promptLimit = custom ? 5000 : 400
  if (!prompt || prompt.length > promptLimit) throw new Error(`${custom ? '歌词' : '音乐描述'}必须填写且不能超过 ${promptLimit} 字符`)
  if ((custom && !title) || title.length > 80) throw new Error('歌曲标题不能超过 80 字符，自定义版必须填写标题')
  if (custom && (!tags || tags.length > 1000)) throw new Error('请填写音乐风格，不能超过 1000 字符')
  const body = custom ? { title, prompt, tags } : { title: title || null, description: prompt, make_instrumental: input.makeInstrumental ? 'true' : 'false' }
  if (String(input.webhookUrl || '').trim()) {
    const webhook = new URL(String(input.webhookUrl).trim())
    if (webhook.protocol !== 'https:') throw new Error('Webhook 回调地址必须使用 HTTPS')
    body.webhookUrl = webhook.href
  }
  return body
}
