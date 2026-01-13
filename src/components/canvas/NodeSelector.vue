<script setup>
/**
 * NodeSelector.vue - 节点选择器面板
 */
import { ref, computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { NODE_TYPES, NODE_TYPE_CONFIG, NODE_CATEGORIES, getDownstreamOptions, getUpstreamOptions } from '@/config/canvas/nodeTypes'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  trigger: {
    type: String,
    default: 'canvas' // 'toolbar' | 'canvas' | 'node'
  },
  triggerNodeId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['close'])
const canvasStore = useCanvasStore()

// 文件上传输入框引用
const fileInputRef = ref(null)

// 选中的节点类型
const selectedType = ref(null)

// 获取触发节点
const triggerNode = computed(() => {
  if (!props.triggerNodeId) return null
  return canvasStore.nodes.find(n => n.id === props.triggerNodeId)
})

// 是否是左侧添加（添加上游节点）
const isLeftTrigger = computed(() => props.trigger === 'node-left')

// 可选节点类型列表
const availableNodes = computed(() => {
  // 如果是从节点创建
  if (triggerNode.value) {
    // 左侧添加 = 添加上游节点
    if (isLeftTrigger.value) {
      return getUpstreamOptions(triggerNode.value.type)
    }
    // 右侧添加 = 添加下游节点
    return getDownstreamOptions(triggerNode.value.type)
  }

  // 输入类节点（文本、图片、视频、音频等需要上传文件的节点）
  const inputNodes = NODE_CATEGORIES.input.types.map(type => ({
    type,
    category: 'input',
    ...NODE_TYPE_CONFIG[type]
  }))

  // 双击画布时只显示输入节点，不显示生成节点
  // 生成节点应该从输入节点的右侧+按钮添加，形成工作流
  if (props.trigger === 'canvas') {
    return inputNodes
  }

  // 点击工具栏+按钮时显示输入节点和生成节点
  // 生成类节点
  const generateNodes = NODE_CATEGORIES.generate.types
    .map(type => ({
      type,
      category: 'generate',
      ...NODE_TYPE_CONFIG[type]
    }))

  return [...inputNodes, ...generateNodes]
})

// 按分类分组的节点
const nodesByCategory = computed(() => {
  if (triggerNode.value) {
    // 如果是从节点触发，不分组
    return null
  }

  const grouped = {}
  availableNodes.value.forEach(node => {
    const category = node.category || 'other'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(node)
  })

  return grouped
})

// 面板位置样式
const panelStyle = computed(() => {
  let x = props.position.x
  let y = props.position.y
  
  // 确保不超出屏幕
  const panelWidth = 240
  const panelHeight = 300
  
  if (x + panelWidth > window.innerWidth) {
    x = window.innerWidth - panelWidth - 20
  }
  if (y + panelHeight > window.innerHeight) {
    y = window.innerHeight - panelHeight - 20
  }
  
  return {
    left: `${x}px`,
    top: `${y}px`
  }
})

// LLM 预设映射表：将 LLM 节点类型映射到文本节点 + 预设
const LLM_PRESET_MAP = {
  'llm-prompt-enhance': 'prompt-enhance',
  'llm-image-describe': 'image-describe',  // 图片描述 → 文本节点
  'llm-video-describe': 'video-describe',  // 视频反推 → 文本节点
  'llm-content-expand': 'content-expand',
  'llm-storyboard': 'storyboard'
}

// 处理音频节点的特殊操作
function handleAudioOperation(operationType) {
  if (!triggerNode.value) return

  const audioNodeId = triggerNode.value.id
  const audioPosition = triggerNode.value.position

  if (operationType === 'audio-to-video') {
    // 音频生视频：创建视频节点并连接
    const videoPosition = {
      x: audioPosition.x + 500,
      y: audioPosition.y
    }
    const videoNode = canvasStore.addNode({
      type: 'video',
      position: videoPosition,
      data: {
        title: t('canvas.nodes.video'),
        label: t('canvas.nodes.video'),
        status: 'idle',
        generationMode: 'audio-to-video'
      }
    })
    if (videoNode?.id) {
      canvasStore.addEdge({
        source: audioNodeId,
        target: videoNode.id,
        sourceHandle: 'output',
        targetHandle: 'input'
      })
      canvasStore.selectNode(videoNode.id)
    }
  } else if (operationType === 'audio-to-text') {
    // 音频提取文案：创建文本节点并连接
    const textPosition = {
      x: audioPosition.x + 500,
      y: audioPosition.y
    }
    const textNode = canvasStore.addNode({
      type: 'text-input',
      position: textPosition,
      data: {
        title: '提取文案',
        text: '',
        placeholder: '音频转文字结果将显示在这里...'
      }
    })
    if (textNode?.id) {
      canvasStore.addEdge({
        source: audioNodeId,
        target: textNode.id,
        sourceHandle: 'output',
        targetHandle: 'input'
      })
      canvasStore.selectNode(textNode.id)
    }
  } else if (operationType === 'audio-lip-sync') {
    // 图片对口型：创建图片节点 + 视频节点，两者都连接到视频节点
    const imagePosition = {
      x: audioPosition.x,
      y: audioPosition.y - 350
    }
    const imageNode = canvasStore.addNode({
      type: 'image-input',
      position: imagePosition,
      data: {
        title: '人物图片',
        sourceImages: ['/logo.svg'],
        status: 'success'
      }
    })

    const videoPosition = {
      x: audioPosition.x + 500,
      y: audioPosition.y - 100
    }
    const videoNode = canvasStore.addNode({
      type: 'video',
      position: videoPosition,
      data: {
        title: t('canvas.nodes.video'),
        label: t('canvas.nodes.video'),
        status: 'idle',
        generationMode: 'lip-sync'
      }
    })

    if (imageNode?.id && videoNode?.id) {
      // 连接图片节点到视频节点
      canvasStore.addEdge({
        source: imageNode.id,
        target: videoNode.id,
        sourceHandle: 'output',
        targetHandle: 'input'
      })
      // 连接音频节点到视频节点
      canvasStore.addEdge({
        source: audioNodeId,
        target: videoNode.id,
        sourceHandle: 'output',
        targetHandle: 'input'
      })
      canvasStore.selectNode(videoNode.id)
    }
  }
}

// 选择节点类型
function selectNodeType(type) {
  selectedType.value = type

  // 特殊处理：音频节点的操作类型
  if (type === 'audio-to-video' || type === 'audio-to-text' || type === 'audio-lip-sync') {
    handleAudioOperation(type)
    emit('close')
    return
  }


  // 计算新节点位置
  let position = { x: 200, y: 200 }

  // 优先使用 store 中传入的 flowPosition
  if (canvasStore.nodeSelectorFlowPosition) {
    position = { ...canvasStore.nodeSelectorFlowPosition }

    // 稍微偏移一点，让节点中心对准鼠标（假设节点宽240）
    position.x -= 120
    position.y -= 50
  } else if (triggerNode.value) {
    if (isLeftTrigger.value) {
      // 左侧添加：在触发节点左侧创建
      position = {
        x: triggerNode.value.position.x - 450,
        y: triggerNode.value.position.y
      }
    } else {
      // 右侧添加：在触发节点右侧创建
      position = {
        x: triggerNode.value.position.x + 400,
        y: triggerNode.value.position.y
      }
    }
  } else if (props.trigger === 'canvas') {
    // Fallback: 如果没有 flowPosition (例如点击工具栏添加)，则使用默认位置或基于屏幕位置估算
    position = {
      x: 100,
      y: 100
    }
  }
  
  // 准备节点初始数据
  const nodeData = {}
  
  // 检查是否是 LLM 预设类型，如果是，转换为文本节点 + 预设
  let actualNodeType = type
  if (LLM_PRESET_MAP[type]) {
    actualNodeType = 'text-input'
    nodeData.selectedPreset = LLM_PRESET_MAP[type]
    nodeData.title = NODE_TYPE_CONFIG[type]?.label || '文本'
  }
  
  // 特殊处理：9宫格分镜节点（从图片节点触发时）
  if (type === 'grid-preview' && triggerNode.value) {
    const sourceData = triggerNode.value.data
    // 检查是否从图片节点触发
    if (sourceData?.sourceImages?.length > 0 || sourceData?.output?.urls?.length > 0) {
      // 设置默认提示词
      nodeData.prompt = '根据图片内容生成9宫格分镜保持场景人物一致性'
      // 设置默认比例为 16:9
      nodeData.aspectRatio = '16:9'
      // 标记这是9宫格模式
      nodeData.gridMode = true
      // 设置节点角色为输出（会生成图片）
      nodeData.nodeRole = 'output'
      // 设置生成数量为 9（但实际通过 count 参数控制）
      nodeData.count = 9
      // 设置标题
      nodeData.title = '9宫格分镜'
    }
  }
  
  // 特殊处理：视频编辑节点（从视频节点触发时）
  if (type === 'video-edit' && triggerNode.value) {
    const sourceData = triggerNode.value.data
    // 检查是否从视频节点触发且有视频输出
    if (sourceData?.output?.url) {
      // 将节点类型改为视频节点
      actualNodeType = 'video'
      // 设置标题
      nodeData.title = '视频编辑'
      nodeData.label = '视频编辑'
      // 设置节点角色为编辑
      nodeData.nodeRole = 'edit'
      // 标记这是视频编辑模式
      nodeData.editMode = true
      // 传递源视频URL
      nodeData.sourceVideoUrl = sourceData.output.url
      // 设置输出为源视频（可以后续编辑）
      nodeData.output = {
        type: 'video',
        url: sourceData.output.url
      }
      nodeData.status = 'success'
    }
  }
  
  // 特殊处理：截取尾帧节点（从视频节点触发时）
  if (type === 'video-last-frame' && triggerNode.value) {
    const sourceData = triggerNode.value.data
    // 检查是否从视频节点触发且有视频输出
    if (sourceData?.output?.url) {
      // 将节点类型改为图像节点
      actualNodeType = 'image-input'
      // 设置标题
      nodeData.title = '尾帧图片'
      // 设置节点角色为源节点（显示提取的图片）
      nodeData.nodeRole = 'source'
      // 标记这是从视频提取的
      nodeData.extractedFromVideo = true
      nodeData.videoUrl = sourceData.output.url
      // 注意：实际的尾帧提取需要后端支持，这里先标记
      // 前端会在节点挂载后调用后端API提取尾帧
      nodeData.needsFrameExtraction = true
    }
  }
  
  // 右侧添加：新节点接收来自触发节点的数据
  if (triggerNode.value && !isLeftTrigger.value) {
    nodeData.hasUpstream = true
    nodeData.inheritedFrom = props.triggerNodeId
    
    // 从上游节点继承相关数据
    const sourceData = triggerNode.value.data
    if (sourceData) {
      // 如果上游是图片节点，传递图片作为参考
      if (sourceData.sourceImages?.length > 0) {
        nodeData.referenceImages = [...sourceData.sourceImages]
        nodeData.inheritedData = {
          type: 'image',
          urls: sourceData.sourceImages
        }
      } else if (sourceData.output?.urls?.length > 0) {
        // 上游节点有输出结果
        nodeData.referenceImages = [...sourceData.output.urls]
        nodeData.inheritedData = {
          type: 'image',
          urls: sourceData.output.urls
        }
      } else if (sourceData.text) {
        // 文本节点传递文本
        nodeData.inheritedData = {
          type: 'text',
          content: sourceData.text
        }
      }
    }
  }
  
  console.log('[NodeSelector] 创建节点:', { 
    type: actualNodeType,
    originalType: type,
    position, 
    nodeData, 
    triggerNodeId: props.triggerNodeId,
    isLeftTrigger: isLeftTrigger.value
  })
  
  // 保存触发节点ID（因为 addNode 可能会清除它）
  const savedTriggerNodeId = props.triggerNodeId
  const savedTriggerNode = triggerNode.value
  
  // 左侧添加时，先清除 store 中的 triggerNodeId，防止 addNode 自动创建错误方向的连线
  if (isLeftTrigger.value && savedTriggerNodeId) {
    canvasStore.triggerNodeId = null
  }
  
  // 创建节点（使用 actualNodeType 而不是 type）
  const newNode = canvasStore.addNode({
    type: actualNodeType,
    position,
    data: nodeData
  })
  
  // 如果有触发节点，手动创建正确方向的连接
  if (savedTriggerNode && newNode?.id) {
    if (isLeftTrigger.value) {
      // 左侧添加：新节点 → 触发节点（新节点是上游，触发节点是下游）
      // 连线方向：新节点的 output → 触发节点的 input
      canvasStore.addEdge({
        source: newNode.id,
        sourceHandle: 'output',
        target: savedTriggerNodeId,
        targetHandle: 'input'
      })
      // 更新触发节点的状态，标记有上游连接
      canvasStore.updateNodeData(savedTriggerNodeId, {
        hasUpstream: true,
        inheritedFrom: newNode.id
      })
    }
    // 右侧添加：addNode 内部已经自动创建了正确方向的连接（触发节点 → 新节点）
  }
  
  emit('close')
}

// 阻止点击冒泡
function handlePanelClick(event) {
  event.stopPropagation()
}

// 打开文件选择对话框
function handleUploadClick() {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理文件上传
async function handleFileUpload(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  // 计算节点位置
  let position = { x: 200, y: 200 }
  if (canvasStore.nodeSelectorFlowPosition) {
    position = { ...canvasStore.nodeSelectorFlowPosition }
    position.x -= 120
    position.y -= 50
  } else {
    position = { x: 100, y: 100 }
  }
  
  // 处理每个文件
  let offsetX = 0
  let offsetY = 0
  
  for (const file of files) {
    const fileType = file.type
    
    try {
      // 根据文件类型创建不同的节点
      let nodeType = null
      let nodeData = {}
      
      // 图片文件 - 与拖拽上传保持一致
      if (fileType.startsWith('image/')) {
        const dataUrl = await readFileAsBase64(file)
        nodeType = 'image-input'
        nodeData = {
          title: file.name || '图片',
          nodeRole: 'source',
          sourceImages: [dataUrl]
        }
      }
      // 视频文件 - 与拖拽上传保持一致
      else if (fileType.startsWith('video/')) {
        const dataUrl = await readFileAsBase64(file)
        nodeType = 'video'
        nodeData = {
          title: file.name || '视频',
          status: 'success',
          output: {
            type: 'video',
            url: dataUrl
          }
        }
      }
      // 音频文件 - 与拖拽上传保持一致
      else if (fileType.startsWith('audio/')) {
        const dataUrl = await readFileAsBase64(file)
        nodeType = 'text-input'
        nodeData = {
          title: `🎵 ${file.name || '音频'}`,
          text: `音频文件: ${file.name}`,
          audioData: dataUrl
        }
      }
      // 文本文件
      else if (fileType.startsWith('text/') || 
               fileType === 'application/json' ||
               file.name.endsWith('.txt') ||
               file.name.endsWith('.md') ||
               file.name.endsWith('.json')) {
        const textContent = await readFileAsText(file)
        nodeType = 'text-input'
        nodeData = {
          title: file.name,
          text: textContent
        }
      }
      // 其他文件类型
      else {
        nodeType = 'text-input'
        nodeData = {
          title: file.name,
          text: `已上传文件: ${file.name}\n类型: ${fileType}\n大小: ${formatFileSize(file.size)}`
        }
      }
      
      // 创建节点
      if (nodeType) {
        const nodePosition = {
          x: position.x + offsetX,
          y: position.y + offsetY
        }
        
        canvasStore.addNode({
          type: nodeType,
          position: nodePosition,
          data: nodeData
        })
        
        // 多文件时错开位置
        offsetX += 50
        offsetY += 50
      }
      
    } catch (error) {
      console.error('[NodeSelector] 文件上传失败:', error, file.name)
    }
  }
  
  // 清空文件选择，允许重复上传同一文件
  event.target.value = ''
  
  // 关闭面板
  emit('close')
}

// 读取文件为 Base64（与 CanvasBoard 中的实现保持一致）
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 读取文件为文本
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
</script>

<template>
  <div 
    class="node-selector" 
    :style="panelStyle"
    @click="handlePanelClick"
  >
    <!-- 标题 -->
    <div class="node-selector-title">
      {{ triggerNode ? (isLeftTrigger ? t('canvas.addUpstream') : t('canvas.referenceGenerate')) : t('canvas.addNode') }}
    </div>
    
    <!-- 节点列表 -->
    <template v-if="availableNodes.length > 0">
      <!-- 按分类显示（双击空白处或点击工具栏时） -->
      <template v-if="nodesByCategory">
        <!-- 输入节点分类 -->
        <template v-if="nodesByCategory.input && nodesByCategory.input.length > 0">
          <div
            v-for="node in nodesByCategory.input"
            :key="node.type"
            class="node-selector-item"
            :class="{ selected: selectedType === node.type }"
            @click="selectNodeType(node.type)"
          >
            <div class="node-selector-icon">{{ node.icon }}</div>
            <div class="node-selector-info">
              <div class="node-selector-name">{{ t(node.label) }}</div>
              <div class="node-selector-desc" v-if="node.description">{{ t(node.description) }}</div>
            </div>
          </div>
        </template>

        <!-- 生成节点分类（仅工具栏触发时显示） -->
        <template v-if="nodesByCategory.generate && nodesByCategory.generate.length > 0">
          <div class="node-selector-divider"></div>
          <div
            v-for="node in nodesByCategory.generate"
            :key="node.type"
            class="node-selector-item"
            :class="{ selected: selectedType === node.type }"
            @click="selectNodeType(node.type)"
          >
            <div class="node-selector-icon">{{ node.icon }}</div>
            <div class="node-selector-info">
              <div class="node-selector-name">{{ t(node.label) }}</div>
              <div class="node-selector-desc" v-if="node.description">{{ t(node.description) }}</div>
            </div>
          </div>
        </template>
      </template>

      <!-- 不分类显示（从节点触发时） -->
      <template v-else>
        <div
          v-for="node in availableNodes"
          :key="node.type"
          class="node-selector-item"
          :class="{ selected: selectedType === node.type }"
          @click="selectNodeType(node.type)"
        >
          <div class="node-selector-icon">{{ node.icon }}</div>
          <div class="node-selector-info">
            <div class="node-selector-name">{{ t(node.label) }}</div>
            <div class="node-selector-desc" v-if="node.description">{{ t(node.description) }}</div>
          </div>
        </div>
      </template>
    </template>
    
    <!-- 无可用节点提示 -->
    <div v-else class="node-selector-empty">
      <div class="empty-icon">○</div>
      <div class="empty-text">{{ t('canvas.noNodeTypes') }}</div>
    </div>
    
    <!-- 分隔线和上传选项（仅非节点触发时显示） -->
    <template v-if="!triggerNode">
      <div class="node-selector-divider"></div>
      <div class="node-selector-title">{{ t('canvas.addResource') }}</div>
      <div class="node-selector-item" @click="handleUploadClick">
        <div class="node-selector-icon">↑</div>
        <div class="node-selector-info">
          <div class="node-selector-name">{{ t('common.upload') }}</div>
        </div>
      </div>
    </template>
    
    <!-- 隐藏的文件上传输入框 -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="*/*"
      style="display: none"
      @change="handleFileUpload"
    />
  </div>
</template>

<style scoped>
/* 节点选择器样式已在 canvas.css 中定义 */

/* 分类标题 */
.node-selector-category {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--canvas-text-tertiary, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

.node-selector-category:first-of-type {
  margin-top: 0;
}

/* 空状态提示 */
.node-selector-empty {
  padding: 24px 16px;
  text-align: center;
}

.node-selector-empty .empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.6;
}

.node-selector-empty .empty-text {
  color: var(--canvas-text-tertiary, #666);
  font-size: 13px;
}
</style>

