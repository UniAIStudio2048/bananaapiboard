<script setup>
/**
 * AudioGenNode.vue - 音乐生成节点
 * 用于 Suno AI 音乐生成
 */
import { ref, computed, inject, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getTenantHeaders, getAvailableMusicModels } from '@/config/tenant'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import MusicTagsSelector from '@/components/canvas/MusicTagsSelector.vue'
import apiClient from '@/api/client'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例
const { updateNodeInternals } = useVueFlow()

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')

// 可用模型列表 - 从租户配置动态获取
const models = computed(() => {
  return getAvailableMusicModels()
})

// 生成参数
const selectedModel = ref(props.data.model || models.value[0]?.value || 'chirp-v4')
const customMode = ref(props.data.customMode || false)
const prompt = ref(props.data.prompt || '')
const title = ref(props.data.title || '')
const tags = ref(props.data.tags || '')
const negativeTags = ref(props.data.negativeTags || '')
const makeInstrumental = ref(props.data.makeInstrumental || false)

// 当前模型配置
const currentModelConfig = computed(() => {
  return models.value.find(m => m.value === selectedModel.value) || models.value[0]
})

// 积分消耗
const pointsCost = computed(() => currentModelConfig.value.pointsCost * 2) // 生成2首歌

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 监听参数变化，保存到store
watch([selectedModel, customMode, prompt, title, tags, negativeTags, makeInstrumental],
  ([model, mode, p, t, tgs, ntgs, inst]) => {
    canvasStore.updateNodeData(props.id, {
      model,
      customMode: mode,
      prompt: p,
      title: t,
      tags: tgs,
      negativeTags: ntgs,
      makeInstrumental: inst
    })
  }
)

// 同步选中状态到 canvasStore
watch(() => props.selected, (isSelected) => {
  if (isSelected && canvasStore.selectedNodeId !== props.id) {
    canvasStore.selectNode(props.id)
  }
}, { immediate: true })

// 节点尺寸
const nodeWidth = ref(props.data.width || 380)
const nodeHeight = ref(props.data.height || 280)

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'audio-gen-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'streaming': props.data.status === 'streaming',
  'success': props.data.status === 'completed',
  'error': props.data.status === 'error'
}))

// 节点内容样式
const contentStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  minHeight: `${nodeHeight.value}px`
}))

// 是否有输出
const hasOutput = computed(() =>
  props.data.status === 'streaming' || props.data.status === 'completed'
)

// 继承的数据（来自上游节点）
const inheritedText = computed(() => props.data.inheritedData?.content || '')

// 获取音乐历史记录（2首歌）
const musicHistory = computed(() => props.data.musicHistory || [])

// 获取第一首歌用于预览
const firstSong = computed(() => musicHistory.value[0] || null)

// 开始生成
async function handleGenerate() {
  // 检查积分
  if (userPoints.value < pointsCost.value) {
    await showInsufficientPointsDialog(pointsCost.value, userPoints.value, 1)
    return
  }

  // 检查输入
  const finalPrompt = inheritedText.value || prompt.value
  if (!finalPrompt && !customMode.value) {
    await showAlert('请输入歌词描述或提示词', '提示')
    return
  }

  if (customMode.value && !title.value) {
    await showAlert('自定义模式需要填写歌名', '提示')
    return
  }

  isGenerating.value = true
  errorMessage.value = ''

  // 更新状态为处理中
  canvasStore.updateNodeData(props.id, { status: 'processing' })

  try {
    const response = await apiClient.post('/api/music/generate', {
      custom_mode: customMode.value ? '1' : '0',
      prompt: finalPrompt,
      title: customMode.value ? title.value : undefined,
      tags: tags.value || undefined,
      negative_tags: negativeTags.value || undefined,
      model: selectedModel.value,
      make_instrumental: makeInstrumental.value ? '1' : '0'
    }, {
      headers: getTenantHeaders()
    })

    console.log('[AudioGenNode] 生成任务已提交:', response.data)

    const taskIds = response.data.task_ids || []

    // 保存任务ID到节点数据
    canvasStore.updateNodeData(props.id, {
      taskIds,
      status: 'processing'
    })

    // 任务提交成功，立即恢复按钮状态
    isGenerating.value = false

    // 开始轮询任务状态
    pollMusicStatus(taskIds)

  } catch (error) {
    console.error('[AudioGenNode] 生成失败:', error)
    // 统一积分不足错误提示
    if (error.response?.data?.error === 'insufficient_points' || error.response?.status === 402) {
      errorMessage.value = '当前积分余额不足，任务提交失败'
    } else {
      errorMessage.value = error.response?.data?.error || error.message || '生成失败'
    }
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: errorMessage.value
    })
    isGenerating.value = false
  }
}

// 轮询音乐生成状态
async function pollMusicStatus(taskIds) {
  const maxAttempts = 60 // 最多轮询2分钟
  let attempts = 0

  const poll = async () => {
    if (attempts >= maxAttempts) {
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: '生成超时，请稍后查看历史记录'
      })
      return
    }

    attempts++

    try {
      // 查询所有任务状态
      const promises = taskIds.map(taskId =>
        apiClient.get(`/api/music/query/${taskId}`, {
          headers: getTenantHeaders()
        })
      )

      const responses = await Promise.all(promises)
      const histories = responses.map(r => r.data)

      // 检查状态
      const allCompleted = histories.every(h => h.status === 'completed')
      const anyFailed = histories.some(h => h.status === 'failed')
      const anyStreaming = histories.some(h => h.status === 'streaming')

      if (anyFailed) {
        const failedSong = histories.find(h => h.status === 'failed')
        canvasStore.updateNodeData(props.id, {
          status: 'error',
          error: failedSong.error_message || '生成失败',
          musicHistory: histories
        })
      } else if (allCompleted) {
        canvasStore.updateNodeData(props.id, {
          status: 'completed',
          musicHistory: histories
        })
      } else if (anyStreaming) {
        // 至少有一首歌流式音频已就绪
        canvasStore.updateNodeData(props.id, {
          status: 'streaming',
          musicHistory: histories
        })
        // 继续轮询直到完全完成
        setTimeout(poll, 2000)
      } else {
        // 仍在处理中
        setTimeout(poll, 2000)
      }

    } catch (error) {
      console.error('[AudioGenNode] 轮询失败:', error)
      setTimeout(poll, 2000)
    }
  }

  poll()
}

// 重新生成
function handleRegenerate() {
  errorMessage.value = ''
  canvasStore.updateNodeData(props.id, {
    status: 'idle',
    musicHistory: [],
    error: null
  })
  handleGenerate()
}

// 快速创建节点
function createNodeForOutput(type, songData) {
  console.log('[AudioGenNode] 创建节点:', type, songData)

  // 根据类型创建不同的节点
  let nodeType = ''
  let nodeData = {}

  switch(type) {
    case 'audio':
      // 创建音频节点（两首歌的音频）
      nodeType = 'audio'
      nodeData = {
        title: '音乐音频',
        urls: musicHistory.value.map(h => h.audio_url || h.audio_stream_url).filter(Boolean),
        output: {
          type: 'audio',
          urls: musicHistory.value.map(h => h.audio_url || h.audio_stream_url).filter(Boolean)
        }
      }
      break

    case 'cover':
      // 创建封面图片节点
      nodeType = 'image'
      nodeData = {
        title: '音乐封面',
        urls: [songData.image_large_url || songData.image_url].filter(Boolean),
        output: {
          type: 'image',
          urls: [songData.image_large_url || songData.image_url].filter(Boolean)
        }
      }
      break

    case 'mv':
      // 创建MV视频节点
      nodeType = 'video'
      nodeData = {
        title: '音乐MV',
        url: songData.video_url,
        output: {
          type: 'video',
          url: songData.video_url
        }
      }
      break

    case 'lyrics':
      // 创建歌词文本节点
      nodeType = 'text'
      nodeData = {
        title: '歌词',
        content: songData.prompt || '歌词',
        output: {
          type: 'text',
          content: songData.prompt || '歌词'
        }
      }
      break
  }

  // 在当前节点右侧创建新节点
  canvasStore.addNodeRelative(props.id, nodeType, nodeData, 'right')
}

// 下载音频
function downloadAudio(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'music.mp3'
  a.click()
}

// 播放音频的ref
const audioPlayerRef = ref(null)

// 组件卸载时停止播放
onUnmounted(() => {
  if (audioPlayerRef.value) {
    audioPlayerRef.value.pause()
  }
})
</script>

<template>
  <div :class="nodeClass">
    <!-- 节点头部 -->
    <div class="canvas-node-header">
      <div class="canvas-node-title">
        <span class="icon">🎵</span>
        {{ data.title || '音乐生成' }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="更多">≡</button>
      </div>
    </div>

    <!-- 节点内容 -->
    <div class="canvas-node-content" :style="contentStyle">
      <!-- 预览区域 -->
      <div class="canvas-node-preview">
        <!-- 加载中 -->
        <div v-if="data.status === 'processing'" class="preview-loading">
          <div class="canvas-loading-spinner"></div>
          <span>正在生成音乐...</span>
          <div class="loading-hint">预计20-120秒</div>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="data.status === 'error'" class="preview-error">
          <div class="error-icon">❌</div>
          <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
          <button class="retry-btn" @click="handleRegenerate">重试</button>
        </div>

        <!-- 流式播放就绪 / 完成状态 -->
        <div v-else-if="hasOutput && firstSong" class="preview-result">
          <!-- 封面图 -->
          <div class="music-cover">
            <img
              :src="firstSong.image_large_url || firstSong.image_url"
              alt="音乐封面"
            />
            <div v-if="data.status === 'streaming'" class="streaming-badge">
              🔴 流式播放中
            </div>
            <div v-else class="completed-badge">
              ✓ 已完成
            </div>
          </div>

          <!-- 音乐信息 -->
          <div class="music-info">
            <div class="music-title">{{ firstSong.title || '无标题' }}</div>
            <div class="music-tags">{{ firstSong.tags || '无标签' }}</div>
          </div>

          <!-- 音频播放器 -->
          <audio
            ref="audioPlayerRef"
            controls
            class="audio-player"
            :src="firstSong.audio_url || firstSong.audio_stream_url"
          >
            您的浏览器不支持音频播放
          </audio>

          <!-- 快速操作按钮 -->
          <div class="quick-actions">
            <div class="quick-actions-label">快速创建节点：</div>
            <div class="quick-actions-buttons">
              <button
                class="quick-action-btn"
                @click="createNodeForOutput('audio', firstSong)"
                title="创建音频节点"
              >
                🎵 音频
              </button>
              <button
                v-if="firstSong.image_url || firstSong.image_large_url"
                class="quick-action-btn"
                @click="createNodeForOutput('cover', firstSong)"
                title="创建封面图片节点"
              >
                🖼️ 封面
              </button>
              <button
                v-if="firstSong.video_url && data.status === 'completed'"
                class="quick-action-btn"
                @click="createNodeForOutput('mv', firstSong)"
                title="创建MV视频节点"
              >
                🎬 MV
              </button>
              <button
                v-if="firstSong.prompt"
                class="quick-action-btn"
                @click="createNodeForOutput('lyrics', firstSong)"
                title="创建歌词节点"
              >
                📝 歌词
              </button>
            </div>
          </div>

          <!-- 生成结果提示 -->
          <div class="generation-summary">
            共生成 <strong>{{ musicHistory.length }}</strong> 首歌曲
            <span v-if="data.status === 'streaming'">（音频流已就绪，完整版生成中...）</span>
          </div>
        </div>

        <!-- 等待输入 -->
        <div v-else class="canvas-node-preview-empty">
          <div v-if="inheritedText">
            <div class="inherited-label">继承的提示词：</div>
            <div class="inherited-text">{{ inheritedText.slice(0, 100) }}{{ inheritedText.length > 100 ? '...' : '' }}</div>
          </div>
          <div v-else>
            <div class="empty-icon">🎵</div>
            <div class="empty-text">配置参数后点击生成</div>
          </div>
        </div>
      </div>

      <!-- 生成控制 -->
      <div class="gen-controls">
        <div class="gen-params">
          <span class="param-item">{{ currentModelConfig.label }}</span>
          <span class="param-item">{{ customMode ? '自定义' : '灵感' }}</span>
          <span class="param-item">{{ makeInstrumental ? '纯音乐' : '有歌词' }}</span>
        </div>

        <div class="gen-actions">
          <!-- 积分显示 -->
          <span class="points-cost">{{ pointsCost }} 积分</span>

          <!-- 生成按钮 -->
          <button
            v-if="!hasOutput"
            class="canvas-node-btn"
            :disabled="isGenerating"
            @click="handleGenerate"
          >
            {{ isGenerating ? '...' : '→ 生成' }}
          </button>

          <!-- 重新生成按钮 -->
          <button
            v-else
            class="canvas-node-btn secondary"
            @click="handleRegenerate"
          >
            ⟲ 重新生成
          </button>
        </div>
      </div>
    </div>

    <!-- 输入端口 -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />

    <!-- 输出端口 -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />

    <!-- 底部配置面板 - 选中时显示 -->
    <div v-show="selected" class="config-panel">
      <div class="settings-header">
        <span class="settings-title">生成设置</span>
      </div>

      <div class="settings-body">
        <!-- 模型选择 -->
        <div class="setting-group">
          <label class="setting-label">模型</label>
          <select v-model="selectedModel" class="setting-select">
            <option v-for="m in models" :key="m.value" :value="m.value">
              {{ m.icon }} {{ m.label }} - {{ m.description }}
            </option>
          </select>
        </div>

        <!-- 生成模式 -->
        <div class="setting-group">
          <label class="setting-label">生成模式</label>
          <div class="toggle-group">
            <button
              :class="['toggle-btn', { active: !customMode }]"
              @click="customMode = false"
            >
              💡 灵感模式
            </button>
            <button
              :class="['toggle-btn', { active: customMode }]"
              @click="customMode = true"
            >
              ✏️ 自定义模式
            </button>
          </div>
        </div>

        <!-- 提示词 -->
        <div class="setting-group">
          <label class="setting-label">
            {{ customMode ? '歌词内容' : '音乐描述' }}
          </label>
          <textarea
            v-model="prompt"
            class="setting-textarea"
            :placeholder="customMode ? '输入完整歌词...' : '描述想要的音乐风格、情绪...'"
            rows="3"
          ></textarea>
        </div>

        <!-- 歌名（仅自定义模式） -->
        <div v-if="customMode" class="setting-group">
          <label class="setting-label">歌名</label>
          <input
            v-model="title"
            type="text"
            class="setting-input"
            placeholder="输入歌名..."
          />
        </div>

        <!-- 风格标签 -->
        <div class="setting-group">
          <label class="setting-label">风格标签</label>
          <MusicTagsSelector v-model="tags" />
        </div>

        <!-- 排除标签 -->
        <div class="setting-group">
          <label class="setting-label">排除标签（可选）</label>
          <input
            v-model="negativeTags"
            type="text"
            class="setting-input"
            placeholder="输入要排除的风格标签，逗号分隔..."
          />
        </div>

        <!-- 纯音乐 -->
        <div class="setting-group">
          <label class="setting-checkbox">
            <input
              v-model="makeInstrumental"
              type="checkbox"
            />
            <span>生成纯音乐（无人声）</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-gen-node {
  position: relative;
  min-width: 380px;
}

/* 预览结果 */
.preview-result {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.music-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
}

.music-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.streaming-badge,
.completed-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(8px);
}

.streaming-badge {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.completed-badge {
  background: rgba(34, 197, 94, 0.9);
  color: white;
}

.music-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.music-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.music-tags {
  font-size: 12px;
  color: #6b7280;
}

.audio-player {
  width: 100%;
  height: 40px;
  border-radius: 6px;
}

/* 快速操作 */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.quick-actions-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.quick-actions-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-action-btn {
  padding: 6px 12px;
  border: 1.5px solid #d1d5db;
  background: white;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-action-btn:hover {
  border-color: #667eea;
  background: #eef2ff;
  color: #667eea;
  transform: translateY(-1px);
}

.generation-summary {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.generation-summary strong {
  color: #667eea;
  font-weight: 600;
}

/* 加载提示 */
.loading-hint {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 8px;
}

/* 空状态 */
.empty-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
  color: #9ca3af;
}

/* 配置面板 */
.config-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 12px;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 100;
  overflow: visible;
}

.settings-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.settings-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--canvas-text-primary, #fff);
}

.settings-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #a0a0a0);
}

/* 设置面板控件 */
.toggle-group {
  display: flex;
  gap: 8px;
}

.toggle-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1.5px solid var(--canvas-border-default, #3a3a3a);
  background: var(--canvas-bg-secondary, #141414);
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-text-primary, #fff);
}

.toggle-btn.active {
  border-color: var(--canvas-accent-primary, #3b82f6);
  background: var(--canvas-accent-primary, #3b82f6);
  color: white;
  font-weight: 500;
}

.setting-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  background: var(--canvas-bg-secondary, #141414);
  color: var(--canvas-text-primary, #fff);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s;
}

.setting-textarea:focus {
  outline: none;
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.setting-textarea::placeholder {
  color: var(--canvas-text-placeholder, #4a4a4a);
}

.setting-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  background: var(--canvas-bg-secondary, #141414);
  color: var(--canvas-text-primary, #fff);
  border-radius: 8px;
  font-size: 13px;
  transition: border-color 0.2s;
}

.setting-input:focus {
  outline: none;
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.setting-input::placeholder {
  color: var(--canvas-text-placeholder, #4a4a4a);
}

.setting-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  background: var(--canvas-bg-secondary, #141414);
  color: var(--canvas-text-primary, #fff);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.setting-select:focus {
  outline: none;
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.setting-select option {
  background: var(--canvas-bg-secondary, #141414);
  color: var(--canvas-text-primary, #fff);
}

.setting-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--canvas-text-primary, #fff);
}

.setting-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   AudioGenNode 白昼模式样式适配
   ======================================== */

/* 配置面板 - 白昼模式 */
:root.canvas-theme-light .audio-gen-node .config-panel {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .audio-gen-node .settings-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .audio-gen-node .settings-title {
  color: #1c1917;
}

:root.canvas-theme-light .audio-gen-node .setting-label {
  color: #57534e;
}

/* 输入框 - 白昼模式 */
:root.canvas-theme-light .audio-gen-node .setting-input {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .audio-gen-node .setting-input:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .audio-gen-node .setting-input::placeholder {
  color: #a8a29e;
}

/* 文本域 - 白昼模式 */
:root.canvas-theme-light .audio-gen-node .setting-textarea {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .audio-gen-node .setting-textarea:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .audio-gen-node .setting-textarea::placeholder {
  color: #a8a29e;
}

/* 下拉选择 - 白昼模式 */
:root.canvas-theme-light .audio-gen-node .setting-select {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .audio-gen-node .setting-select:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .audio-gen-node .setting-select option {
  background: #ffffff;
  color: #1c1917;
}

/* 复选框 - 白昼模式 */
:root.canvas-theme-light .audio-gen-node .setting-checkbox {
  color: #1c1917;
}

/* 节点标题和其他文本 - 白昼模式 */
:root.canvas-theme-light .audio-gen-node .node-label {
  color: #f59e0b;
}

:root.canvas-theme-light .audio-gen-node .empty-text {
  color: #78716c;
}
</style>
