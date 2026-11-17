// 默认租户首页的公开产品文案，与主站服务端 SEO 首页保持一致。
export const defaultHomeContent = {
  pageTitle: '无限画布 - AI绘画、AI视频生成与漫剧创作',
  heading: 'Nano Banana 无限画布',
  description: 'Nano Banana 无限画布是一款在线 AI 创作平台，支持 AI 绘画、AI 视频生成与漫剧制作。将提示词、参考图、角色、分镜、视频和配音连接成节点工作流，在同一张画布中生成、对比和迭代作品，支持复用社区模板与团队协作。',
  steps: [
    '创建画布或选择社区工作流模板，添加提示词、参考图片和角色设定。',
    '连接图片、视频或音频节点，选择模型与生成参数，运行工作流。',
    '在画布中对比结果、调整提示词并继续生成，整理镜头后下载作品。'
  ],
  faq: [
    ['什么是 AI 无限画布？', 'AI 无限画布是可以自由平移、缩放和排列素材的在线创作空间。在 Nano Banana 中，文字、图片、视频与音频以节点呈现，通过连线组织生成步骤，方便保留参考素材、比较结果并继续迭代。'],
    ['无限画布可以用来做什么？', '可以进行 AI 绘画、参考图创作、AI 视频生成、漫剧分镜和角色设计，也可以把配音、音乐与镜头素材放在同一工作流中管理，适合图片设计、短视频和漫剧创作。'],
    ['使用无限画布需要安装软件或编写代码吗？', '不需要安装桌面软件，也不需要编写代码。在浏览器中登录后即可创建画布，通过添加节点、上传素材和连线搭建工作流，也可以从社区模板开始。']
  ]
}

export function isDefaultHomepage(path, tenantId) {
  return path === '/' && tenantId === 'default-tenant-001'
}

export function defaultHomepageTitle(path, tenantId) {
  return isDefaultHomepage(path, tenantId) ? defaultHomeContent.pageTitle : ''
}
