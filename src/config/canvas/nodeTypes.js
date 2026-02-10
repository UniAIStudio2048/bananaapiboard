/**
 * 节点类型定义
 * 定义所有可用的节点类型及其配置
 */

// 节点类型枚举
export const NODE_TYPES = {
  // 输入类
  TEXT_INPUT: 'text-input',
  IMAGE_INPUT: 'image-input',
  VIDEO_INPUT: 'video-input',
  AUDIO_INPUT: 'audio-input',
  
  // 生成类
  TEXT_TO_IMAGE: 'text-to-image',
  IMAGE_TO_IMAGE: 'image-to-image',
  TEXT_TO_VIDEO: 'text-to-video',
  IMAGE_TO_VIDEO: 'image-to-video',
  
  // LLM 智能类
  LLM_PROMPT_ENHANCE: 'llm-prompt-enhance',
  LLM_IMAGE_DESCRIBE: 'llm-image-describe',
  LLM_CONTENT_EXPAND: 'llm-content-expand',
  LLM_STORYBOARD: 'llm-storyboard',
  
  // 图片编辑类
  IMAGE_REPAINT: 'image-repaint',
  IMAGE_ERASE: 'image-erase',
  IMAGE_UPSCALE: 'image-upscale',
  IMAGE_CUTOUT: 'image-cutout',
  IMAGE_EXPAND: 'image-expand',
  
  // 输出类
  PREVIEW_OUTPUT: 'preview-output',
  GRID_PREVIEW: 'grid-preview',
  
  // 分镜类
  STORYBOARD_GRID: 'storyboard-grid',
  
  // 视频处理类
  VIDEO_LAST_FRAME: 'video-last-frame',
  LLM_VIDEO_DESCRIBE: 'llm-video-describe',
  VIDEO_EDIT: 'video-edit',  // 视频编辑（连接下游视频节点）

  // 音频处理类
  AUDIO_TO_VIDEO: 'audio-to-video',
  AUDIO_TO_TEXT: 'audio-to-text',
  AUDIO_LIP_SYNC: 'audio-lip-sync'
}

// 节点类型配置 - 黑白灰简洁风格图标
// 注意：label 和 description 使用 i18n 翻译键
export const NODE_TYPE_CONFIG = {
  [NODE_TYPES.TEXT_INPUT]: {
    label: 'canvas.nodeConfig.textInput.label',
    description: 'canvas.nodeConfig.textInput.desc',
    icon: 'Aa',
    category: 'input',
    color: '#3b82f6',
    hasInput: false,
    hasOutput: true,
    outputType: 'text'
  },
  
  [NODE_TYPES.IMAGE_INPUT]: {
    label: 'canvas.nodeConfig.imageInput.label',
    description: 'canvas.nodeConfig.imageInput.desc',
    icon: '◫',
    category: 'input',
    color: '#22c55e',
    hasInput: false,
    hasOutput: true,
    outputType: 'image'
  },
  
  [NODE_TYPES.VIDEO_INPUT]: {
    label: 'canvas.nodeConfig.videoInput.label',
    description: 'canvas.nodeConfig.videoInput.desc',
    icon: '▷',
    category: 'input',
    color: '#f59e0b',
    hasInput: false,
    hasOutput: true,
    outputType: 'video'
  },
  
  [NODE_TYPES.AUDIO_INPUT]: {
    label: 'canvas.nodeConfig.audioInput.label',
    description: 'canvas.nodeConfig.audioInput.desc',
    icon: '♪',
    category: 'input',
    color: '#a855f7',
    hasInput: false,
    hasOutput: true,
    outputType: 'audio'
  },
  
  [NODE_TYPES.TEXT_TO_IMAGE]: {
    label: 'canvas.nodeConfig.textToImage.label',
    description: 'canvas.nodeConfig.textToImage.desc',
    icon: '⬡',
    category: 'generate',
    color: '#8b5cf6',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_TO_IMAGE]: {
    label: 'canvas.nodeConfig.imageToImage.label',
    description: 'canvas.nodeConfig.imageToImage.desc',
    icon: '⟲',
    category: 'generate',
    color: '#ec4899',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.TEXT_TO_VIDEO]: {
    label: 'canvas.nodeConfig.textToVideo.label',
    description: 'canvas.nodeConfig.textToVideo.desc',
    icon: '▶',
    category: 'generate',
    color: '#f97316',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'video',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_TO_VIDEO]: {
    label: 'canvas.nodeConfig.imageToVideo.label',
    description: 'canvas.nodeConfig.imageToVideo.desc',
    icon: '◈',
    category: 'generate',
    color: '#ef4444',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'video',
    consumesPoints: true
  },

  [NODE_TYPES.LLM_PROMPT_ENHANCE]: {
    label: 'canvas.nodeConfig.promptEnhance.label',
    description: 'canvas.nodeConfig.promptEnhance.desc',
    icon: 'A+',
    category: 'llm',
    color: '#06b6d4',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'text',
    consumesPoints: true,
    pointsCost: 1
  },
  
  [NODE_TYPES.LLM_IMAGE_DESCRIBE]: {
    label: 'canvas.nodeConfig.imageDescribe.label',
    description: 'canvas.nodeConfig.imageDescribe.desc',
    icon: '◎',
    category: 'llm',
    color: '#14b8a6',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'text',
    consumesPoints: true,
    pointsCost: 2
  },
  
  [NODE_TYPES.LLM_CONTENT_EXPAND]: {
    label: 'canvas.nodeConfig.contentExpand.label',
    description: 'canvas.nodeConfig.contentExpand.desc',
    icon: '≡',
    category: 'llm',
    color: '#0ea5e9',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'text',
    consumesPoints: true,
    pointsCost: 1
  },
  
  [NODE_TYPES.LLM_STORYBOARD]: {
    label: 'canvas.nodeConfig.storyboard.label',
    description: 'canvas.nodeConfig.storyboard.desc',
    icon: '⊞',
    category: 'llm',
    color: '#6366f1',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'text',
    consumesPoints: true,
    pointsCost: 3
  },
  
  [NODE_TYPES.PREVIEW_OUTPUT]: {
    label: 'canvas.nodeConfig.previewOutput.label',
    description: 'canvas.nodeConfig.previewOutput.desc',
    icon: '◉',
    category: 'output',
    color: '#64748b',
    hasInput: true,
    hasOutput: false,
    inputType: 'any'
  },
  
  // 分镜格子节点配置
  [NODE_TYPES.STORYBOARD_GRID]: {
    label: 'canvas.nodeConfig.storyboardGrid.label',
    description: 'canvas.nodeConfig.storyboardGrid.desc',
    icon: '⊞',
    category: 'input',
    color: '#6366f1',
    hasInput: true,
    hasOutput: true,
    outputType: 'image'
  },
  
  // 图片编辑类节点配置
  [NODE_TYPES.IMAGE_REPAINT]: {
    label: 'canvas.nodeConfig.imageRepaint.label',
    description: 'canvas.nodeConfig.imageRepaint.desc',
    icon: '✎',
    category: 'edit',
    color: '#f472b6',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_ERASE]: {
    label: 'canvas.nodeConfig.imageErase.label',
    description: 'canvas.nodeConfig.imageErase.desc',
    icon: '⌫',
    category: 'edit',
    color: '#fb923c',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_UPSCALE]: {
    label: 'canvas.nodeConfig.imageUpscale.label',
    description: 'canvas.nodeConfig.imageUpscale.desc',
    icon: '⇧',
    category: 'edit',
    color: '#a78bfa',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_CUTOUT]: {
    label: 'canvas.nodeConfig.imageCutout.label',
    description: 'canvas.nodeConfig.imageCutout.desc',
    icon: '✂',
    category: 'edit',
    color: '#4ade80',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_EXPAND]: {
    label: 'canvas.nodeConfig.imageExpand.label',
    description: 'canvas.nodeConfig.imageExpand.desc',
    icon: '⇔',
    category: 'edit',
    color: '#38bdf8',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.GRID_PREVIEW]: {
    label: 'canvas.nodeConfig.gridPreview.label',
    description: 'canvas.nodeConfig.gridPreview.desc',
    icon: '⊞',
    category: 'generate',  // 改为 generate 类别，因为它会生成图片
    color: '#94a3b8',
    hasInput: true,
    hasOutput: true,       // 改为 true，允许有下游输出
    inputType: 'image',
    outputType: 'image',   // 输出类型为图片
    consumesPoints: true   // 消耗积分
  },
  
  [NODE_TYPES.VIDEO_LAST_FRAME]: {
    label: 'canvas.nodeConfig.videoLastFrame.label',
    description: 'canvas.nodeConfig.videoLastFrame.desc',
    icon: '▮',
    category: 'video',
    color: '#f97316',
    hasInput: true,
    hasOutput: true,
    inputType: 'video',
    outputType: 'image'
  },
  
  [NODE_TYPES.LLM_VIDEO_DESCRIBE]: {
    label: 'canvas.nodeConfig.videoDescribe.label',
    description: 'canvas.nodeConfig.videoDescribe.desc',
    icon: '▷◎',
    category: 'llm',
    color: '#14b8a6',
    hasInput: true,
    hasOutput: true,
    inputType: 'video',
    outputType: 'text',
    consumesPoints: true,
    pointsCost: 2
  },
  
  [NODE_TYPES.VIDEO_EDIT]: {
    label: 'canvas.nodeConfig.videoEdit.label',
    description: 'canvas.nodeConfig.videoEdit.desc',
    icon: '▶✎',
    category: 'video',
    color: '#f97316',
    hasInput: true,
    hasOutput: true,
    inputType: 'video',
    outputType: 'video'
  },

  // 音频处理节点
  [NODE_TYPES.AUDIO_TO_VIDEO]: {
    label: 'canvas.nodeConfig.audioToVideo.label',
    description: 'canvas.nodeConfig.audioToVideo.desc',
    icon: '♪▶',
    category: 'generate',
    color: '#f97316',
    hasInput: true,
    hasOutput: true,
    inputType: 'audio',
    outputType: 'video',
    consumesPoints: true
  },

  [NODE_TYPES.AUDIO_TO_TEXT]: {
    label: 'canvas.nodeConfig.audioToText.label',
    description: 'canvas.nodeConfig.audioToText.desc',
    icon: '♪Aa',
    category: 'llm',
    color: '#06b6d4',
    hasInput: true,
    hasOutput: true,
    inputType: 'audio',
    outputType: 'text'
  },

  [NODE_TYPES.AUDIO_LIP_SYNC]: {
    label: 'canvas.nodeConfig.audioLipSync.label',
    description: 'canvas.nodeConfig.audioLipSync.desc',
    icon: '◐▶',
    category: 'generate',
    color: '#ec4899',
    hasInput: true,
    hasOutput: true,
    inputType: 'audio+image',
    outputType: 'video',
    consumesPoints: true
  }
}

// 节点连接规则
export const CONNECTION_RULES = {
  [NODE_TYPES.TEXT_INPUT]: [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND,
    NODE_TYPES.LLM_STORYBOARD
  ],
  
  // 文本节点别名
  'text': [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND,
    NODE_TYPES.LLM_STORYBOARD
  ],
  
  [NODE_TYPES.IMAGE_INPUT]: [
    NODE_TYPES.IMAGE_TO_IMAGE,      // 图生图
    NODE_TYPES.IMAGE_TO_VIDEO,      // 图生视频
    NODE_TYPES.LLM_IMAGE_DESCRIBE,  // 图片反推
    NODE_TYPES.STORYBOARD_GRID      // 分镜格子
  ],
  
  // 统一图片节点别名
  'image': [
    NODE_TYPES.IMAGE_TO_IMAGE,      // 图生图
    NODE_TYPES.IMAGE_TO_VIDEO,      // 图生视频
    NODE_TYPES.LLM_IMAGE_DESCRIBE,  // 图片反推
    NODE_TYPES.STORYBOARD_GRID      // 分镜格子
  ],
  
  // 图生图节点别名
  'image-gen': [
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,  // 图片反推
    NODE_TYPES.STORYBOARD_GRID      // 分镜格子
  ],
  
  [NODE_TYPES.VIDEO_INPUT]: [
    NODE_TYPES.VIDEO_LAST_FRAME,    // 截取尾帧
    NODE_TYPES.LLM_VIDEO_DESCRIBE,  // 视频反推
    NODE_TYPES.VIDEO_EDIT           // 视频编辑
  ],
  
  [NODE_TYPES.AUDIO_INPUT]: [
    NODE_TYPES.AUDIO_TO_VIDEO,
    NODE_TYPES.AUDIO_TO_TEXT,
    NODE_TYPES.AUDIO_LIP_SYNC
  ],

  // 统一音频节点别名
  'audio': [
    NODE_TYPES.AUDIO_TO_VIDEO,
    NODE_TYPES.AUDIO_TO_TEXT,
    NODE_TYPES.AUDIO_LIP_SYNC
  ],

  'audio-input': [
    NODE_TYPES.AUDIO_TO_VIDEO,
    NODE_TYPES.AUDIO_TO_TEXT,
    NODE_TYPES.AUDIO_LIP_SYNC
  ],
  
  // 统一视频节点别名
  'video': [
    NODE_TYPES.VIDEO_LAST_FRAME,    // 截取尾帧
    NODE_TYPES.LLM_VIDEO_DESCRIBE,  // 视频反推
    NODE_TYPES.VIDEO_EDIT           // 视频编辑
  ],
  
  // 视频生成节点别名
  'video-gen': [
    NODE_TYPES.VIDEO_LAST_FRAME,    // 截取尾帧
    NODE_TYPES.LLM_VIDEO_DESCRIBE,  // 视频反推
    NODE_TYPES.VIDEO_EDIT           // 视频编辑
  ],
  
  [NODE_TYPES.TEXT_TO_IMAGE]: [
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.IMAGE_REPAINT,
    NODE_TYPES.IMAGE_ERASE,
    NODE_TYPES.IMAGE_UPSCALE,
    NODE_TYPES.IMAGE_CUTOUT,
    NODE_TYPES.IMAGE_EXPAND,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,
    NODE_TYPES.PREVIEW_OUTPUT,
    NODE_TYPES.GRID_PREVIEW,
    'storyboard'                    // 分镜格子
  ],
  
  [NODE_TYPES.IMAGE_TO_IMAGE]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.IMAGE_REPAINT,
    NODE_TYPES.IMAGE_UPSCALE,
    NODE_TYPES.PREVIEW_OUTPUT,
    'storyboard'                    // 分镜格子
  ],
  
  [NODE_TYPES.TEXT_TO_VIDEO]: [
    NODE_TYPES.VIDEO_LAST_FRAME,    // 截取尾帧
    NODE_TYPES.LLM_VIDEO_DESCRIBE,  // 视频反推
    NODE_TYPES.VIDEO_EDIT           // 视频编辑
  ],
  
  [NODE_TYPES.IMAGE_TO_VIDEO]: [
    NODE_TYPES.VIDEO_LAST_FRAME,    // 截取尾帧
    NODE_TYPES.LLM_VIDEO_DESCRIBE,  // 视频反推
    NODE_TYPES.VIDEO_EDIT           // 视频编辑
  ],
  
  [NODE_TYPES.LLM_PROMPT_ENHANCE]: [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.LLM_IMAGE_DESCRIBE]: [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.LLM_CONTENT_EXPAND]: [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.LLM_STORYBOARD]: [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.PREVIEW_OUTPUT,
    NODE_TYPES.GRID_PREVIEW
  ],
  
  // 9宫格分镜节点的下游选项
  [NODE_TYPES.GRID_PREVIEW]: [
    NODE_TYPES.IMAGE_INPUT,      // 图片节点
    NODE_TYPES.IMAGE_TO_IMAGE,   // 图生图
    NODE_TYPES.IMAGE_TO_VIDEO,   // 图生视频
    NODE_TYPES.PREVIEW_OUTPUT    // 预览输出
  ],
  
  // 图片编辑类节点的下游选项
  [NODE_TYPES.IMAGE_REPAINT]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.IMAGE_ERASE]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.IMAGE_UPSCALE]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.IMAGE_CUTOUT]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.IMAGE_EXPAND]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.PREVIEW_OUTPUT
  ]
}

// 节点分类
export const NODE_CATEGORIES = {
  input: {
    label: '添加节点',
    types: [NODE_TYPES.TEXT_INPUT, NODE_TYPES.IMAGE_INPUT, NODE_TYPES.VIDEO_INPUT, NODE_TYPES.AUDIO_INPUT]
  },
  generate: {
    label: '生成',
    types: [NODE_TYPES.TEXT_TO_IMAGE, NODE_TYPES.IMAGE_TO_IMAGE, NODE_TYPES.TEXT_TO_VIDEO, NODE_TYPES.IMAGE_TO_VIDEO]
  },
  llm: {
    label: 'AI 智能',
    types: [NODE_TYPES.LLM_PROMPT_ENHANCE, NODE_TYPES.LLM_IMAGE_DESCRIBE, NODE_TYPES.LLM_CONTENT_EXPAND]
  },
  output: {
    label: '输出',
    types: [NODE_TYPES.PREVIEW_OUTPUT]
  }
}

// 获取节点配置
export function getNodeConfig(type) {
  return NODE_TYPE_CONFIG[type] || null
}

// 获取可连接的节点类型
export function getConnectableTypes(sourceType) {
  return CONNECTION_RULES[sourceType] || []
}

// 检查两个节点是否可以连接
export function canConnect(sourceType, targetType) {
  const allowed = CONNECTION_RULES[sourceType] || []
  return allowed.includes(targetType)
}

// 根据上游节点类型获取可创建的下游节点
export function getDownstreamOptions(sourceType) {
  const connectableTypes = getConnectableTypes(sourceType)
  return connectableTypes.map(type => ({
    type,
    ...NODE_TYPE_CONFIG[type]
  }))
}

// 上游连接规则（某节点类型可以接收哪些类型作为输入）
export const UPSTREAM_RULES = {
  // 文本节点：可以接收其他文本、图片、音频、视频作为输入参考（对话流）
  [NODE_TYPES.TEXT_INPUT]: [
    NODE_TYPES.TEXT_INPUT,       // 其他文本作为上下文
    NODE_TYPES.IMAGE_INPUT,      // 图片作为参考
    NODE_TYPES.VIDEO_INPUT,      // 视频作为参考
    NODE_TYPES.TEXT_TO_IMAGE,    // 生成的图片
    NODE_TYPES.IMAGE_TO_IMAGE,   // 处理后的图片
    NODE_TYPES.LLM_PROMPT_ENHANCE,  // 优化后的提示词
    NODE_TYPES.LLM_IMAGE_DESCRIBE,  // 图片描述
    NODE_TYPES.LLM_CONTENT_EXPAND   // 扩写的内容
  ],
  'text-input': [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.VIDEO_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  
  // 视频节点：可以接收文本和图片作为输入
  [NODE_TYPES.VIDEO_INPUT]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE,    // 可以接收文生图的输出作为参考图
    NODE_TYPES.IMAGE_TO_IMAGE,   // 可以接收图生图的输出作为参考图
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  'video': [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  
  // 图片节点：可以接收文本作为提示词
  [NODE_TYPES.IMAGE_INPUT]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  'image': [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  'image-gen': [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.LLM_PROMPT_ENHANCE
  ],
  
  // 文生图节点：可以接收文本或图片
  [NODE_TYPES.TEXT_TO_IMAGE]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_IMAGE_DESCRIBE
  ],
  
  // 图生图节点：可以接收文本和图片
  [NODE_TYPES.IMAGE_TO_IMAGE]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE
  ],
  
  // 文生视频节点：可以接收文本
  [NODE_TYPES.TEXT_TO_VIDEO]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  
  // 图生视频节点：可以接收图片和文本
  [NODE_TYPES.IMAGE_TO_VIDEO]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_IMAGE
  ],
  
  // 分镜脚本节点：可以接收文本和图片（图片会先转为描述再生成分镜）
  [NODE_TYPES.LLM_STORYBOARD]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,
    NODE_TYPES.LLM_CONTENT_EXPAND
  ],
  
  // 预览输出节点：可以接收任何类型
  [NODE_TYPES.PREVIEW_OUTPUT]: [
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.IMAGE_INPUT,
    NODE_TYPES.VIDEO_INPUT,
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.IMAGE_TO_VIDEO
  ]
}

// 获取可连接到当前节点输入端的上游节点类型
export function getUpstreamTypes(targetType) {
  return UPSTREAM_RULES[targetType] || []
}

// 根据下游节点类型获取可创建的上游节点
export function getUpstreamOptions(targetType) {
  const upstreamTypes = getUpstreamTypes(targetType)
  return upstreamTypes.map(type => ({
    type,
    ...NODE_TYPE_CONFIG[type]
  }))
}

