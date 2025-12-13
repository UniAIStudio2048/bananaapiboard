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
  GRID_PREVIEW: 'grid-preview'
}

// 节点类型配置
export const NODE_TYPE_CONFIG = {
  [NODE_TYPES.TEXT_INPUT]: {
    label: '文本',
    description: '脚本、广告词、品牌文案',
    icon: 'T',
    category: 'input',
    color: '#3b82f6',
    hasInput: false,
    hasOutput: true,
    outputType: 'text'
  },
  
  [NODE_TYPES.IMAGE_INPUT]: {
    label: '图片',
    description: '上传参考图片',
    icon: '🖼',
    category: 'input',
    color: '#22c55e',
    hasInput: false,
    hasOutput: true,
    outputType: 'image'
  },
  
  [NODE_TYPES.VIDEO_INPUT]: {
    label: '视频',
    description: '上传参考视频',
    icon: '🎬',
    category: 'input',
    color: '#f59e0b',
    hasInput: false,
    hasOutput: true,
    outputType: 'video'
  },
  
  [NODE_TYPES.TEXT_TO_IMAGE]: {
    label: '文生图',
    description: '文本生成图片',
    icon: '🎨',
    category: 'generate',
    color: '#8b5cf6',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_TO_IMAGE]: {
    label: '图生图',
    description: '图片风格转换',
    icon: '🔄',
    category: 'generate',
    color: '#ec4899',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'image',
    consumesPoints: true
  },
  
  [NODE_TYPES.TEXT_TO_VIDEO]: {
    label: '文生视频',
    description: '文本生成视频',
    icon: '📹',
    category: 'generate',
    color: '#f97316',
    hasInput: true,
    hasOutput: true,
    inputType: 'text',
    outputType: 'video',
    consumesPoints: true
  },
  
  [NODE_TYPES.IMAGE_TO_VIDEO]: {
    label: '图生视频',
    description: '图片生成视频',
    icon: '🎥',
    category: 'generate',
    color: '#ef4444',
    hasInput: true,
    hasOutput: true,
    inputType: 'image',
    outputType: 'video',
    consumesPoints: true
  },
  
  [NODE_TYPES.LLM_PROMPT_ENHANCE]: {
    label: '提示词优化',
    description: 'AI 优化提示词',
    icon: '✨',
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
    label: '图片描述',
    description: '图片反推提示词',
    icon: '🔍',
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
    label: '内容扩写',
    description: 'AI 内容扩写',
    icon: '📝',
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
    label: '分镜脚本',
    description: '生成分镜脚本',
    icon: '🎬',
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
    label: '预览输出',
    description: '展示最终结果',
    icon: '👁',
    category: 'output',
    color: '#64748b',
    hasInput: true,
    hasOutput: false,
    inputType: 'any'
  }
}

// 节点连接规则
export const CONNECTION_RULES = {
  [NODE_TYPES.TEXT_INPUT]: [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND,
    NODE_TYPES.LLM_STORYBOARD,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  // 文本节点别名
  'text': [
    NODE_TYPES.TEXT_TO_IMAGE,
    NODE_TYPES.TEXT_TO_VIDEO,
    NODE_TYPES.LLM_PROMPT_ENHANCE,
    NODE_TYPES.LLM_CONTENT_EXPAND,
    NODE_TYPES.LLM_STORYBOARD,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.IMAGE_INPUT]: [
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,
    NODE_TYPES.IMAGE_REPAINT,
    NODE_TYPES.IMAGE_ERASE,
    NODE_TYPES.IMAGE_UPSCALE,
    NODE_TYPES.IMAGE_CUTOUT,
    NODE_TYPES.IMAGE_EXPAND,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  // 统一图片节点别名（上传的图片、生成的图片都可以继续向下连接）
  'image': [
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,
    NODE_TYPES.IMAGE_REPAINT,
    NODE_TYPES.IMAGE_ERASE,
    NODE_TYPES.IMAGE_UPSCALE,
    NODE_TYPES.IMAGE_CUTOUT,
    NODE_TYPES.IMAGE_EXPAND,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  // 图生图节点别名
  'image-gen': [
    NODE_TYPES.IMAGE_TO_IMAGE,
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.LLM_IMAGE_DESCRIBE,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.VIDEO_INPUT]: [
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  // 统一视频节点别名
  'video': [
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  // 视频生成节点别名
  'video-gen': [
    NODE_TYPES.PREVIEW_OUTPUT
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
    NODE_TYPES.GRID_PREVIEW
  ],
  
  [NODE_TYPES.IMAGE_TO_IMAGE]: [
    NODE_TYPES.IMAGE_TO_VIDEO,
    NODE_TYPES.IMAGE_REPAINT,
    NODE_TYPES.IMAGE_UPSCALE,
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.TEXT_TO_VIDEO]: [
    NODE_TYPES.PREVIEW_OUTPUT
  ],
  
  [NODE_TYPES.IMAGE_TO_VIDEO]: [
    NODE_TYPES.PREVIEW_OUTPUT
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
  ]
}

// 节点分类
export const NODE_CATEGORIES = {
  input: {
    label: '添加节点',
    types: [NODE_TYPES.TEXT_INPUT, NODE_TYPES.IMAGE_INPUT, NODE_TYPES.VIDEO_INPUT]
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

