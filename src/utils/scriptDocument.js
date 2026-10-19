export const assetLabels = { character: '角色', scene: '场景', prop: '道具' }
export function blankScript() { return { title: '未命名脚本', entry: 'story', sourceText: '', requirements: '', referenceImages: [], style: '', confirmed: false, assets: [], shots: [] } }
export function newShot(id) { return { id, duration: 10, description: '', scale: '中景', lighting: '', camera: '', audio: '', dialogue: [], assetIds: [], color: '', imagePrompt: '', videoPrompt: '', imageUrl: '', videoUrl: '', imageNodeId: '', videoNodeId: '' } }
export function completion(doc) {
  if (!doc?.shots?.length || !doc.confirmed) return 0
  if (doc.assets.some(a => !a.imageUrl)) return 1
  return doc.shots.every(s => s.imagePrompt?.trim() && s.videoPrompt?.trim()) ? 3 : 2
}
export function assetPrompt(asset, style) {
  const templates = { character: '角色设定图：画面左侧1/3头部近景，右侧2/3全身正面、左侧、背面三视图，白底、空手。', scene: '场景设定图：2×2四宫格，展示同一空间前后左右四个方向，空间布局一致，无人物。', prop: '道具设定图：2×3六宫格，正面、背面、左、右、顶、底六个正交视图，白底，保持必要的剧情文字。' }
  return `${templates[asset.type]}\n${asset.name}：${asset.description}\n统一美术风格：${style || '遵循剧本设定'}。禁止无关水印与界面文字。`
}
export function autoCompose(doc, selected) {
  return { ...doc, shots: doc.shots.map((s, i) => {
    if (!selected.includes(s.id)) return s
    const refs = s.assetIds.map(id => doc.assets.find(a => a.id === id)).filter(Boolean).map((a,j) => `参考${j+1} ${a.name}：${a.description}`).join('\n')
    const imagePrompt = `${s.description}\n景别：${s.scale}\n光影：${s.lighting}\n${refs}\n风格：${doc.style}`
    const videoPrompt = `${refs}\n前镜：${doc.shots[i-1]?.description || '开场'}\n当前镜头 0–${s.duration}秒：${s.description}\n运镜：${s.camera}\n对白：${s.dialogue.map(d => `${d.speaker}：${d.text}`).join('\n')}\n声音：${s.audio}\n保持参考人物外观、服饰、场景和空间关系一致，动作自然连续。风格：${doc.style}`
    return { ...s, imagePrompt, videoPrompt }
  }) }
}
export function scriptCsv(doc) {
  const cell = value => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"` }
  const rows = [['镜号','时长','画面描述','参考','景别','光影氛围','音效','对白','分镜提示词','视频运动提示词'], ...doc.shots.map((s,i) => [i+1, `${s.duration}秒`, s.description, s.assetIds.map(id => doc.assets.find(a => a.id === id)?.name || '').join('、'), s.scale, s.lighting, s.audio, s.dialogue.map(d => `${d.speaker}：${d.text}`).join('\n'), s.imagePrompt, s.videoPrompt]), [], ['类型','名称','图片','描述提示词'], ...doc.assets.map(a => [assetLabels[a.type], a.name, a.imageUrl, a.description])]
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
