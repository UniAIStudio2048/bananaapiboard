<script setup>
/**
 * WorkflowPreviewModal.vue - 窗口式只读工作流预览弹窗
 * 居中弹窗展示，点击克隆后才进入正式画布模式
 */
import { ref, computed, watch, nextTick, onBeforeUnmount, provide, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { getWorkWorkflow, forkWork, forkProject, cloneTemplate, getTemplateWorkflow, getFeatureWorkflow } from '@/api/community'
import { loadWorkflow } from '@/api/canvas/workflow'
import { useCommunityStore } from '@/stores/community'
import ForkDialog from './ForkDialog.vue'
import PurchaseDialog from './PurchaseDialog.vue'

// 自定义节点组件
import TextNode from '@/components/canvas/nodes/TextNode.vue'
import ImageNode from '@/components/canvas/nodes/ImageNode.vue'
import VideoNode from '@/components/canvas/nodes/VideoNode.vue'
import AudioNode from '@/components/canvas/nodes/AudioNode.vue'
import LLMNode from '@/components/canvas/nodes/LLMNode.vue'
import PreviewNode from '@/components/canvas/nodes/PreviewNode.vue'
import GroupNode from '@/components/canvas/nodes/GroupNode.vue'
import CharacterCardNode from '@/components/canvas/nodes/CharacterCardNode.vue'
import StoryboardNode from '@/components/canvas/nodes/StoryboardNode.vue'
import SeedanceCharacterNode from '@/components/canvas/nodes/SeedanceCharacterNode.vue'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@/styles/canvas.css'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  workflowId: { type: String, default: '' },
  title: { type: String, default: '' },
  workId: { type: Number, default: 0 },
  templateId: { type: Number, default: 0 },
  featureId: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false },
  isPurchased: { type: Boolean, default: false },
  isOwn: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  work: { type: Object, default: () => ({}) },
  projectWorkflows: { type: Array, default: () => [] },
  projectInfo: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'purchased'])

const previewUserInfo = ref(null)
provide('userInfo', previewUserInfo)

const isLocked = computed(() => props.isPaid && !props.isPurchased && !props.isOwn)
const isProject = computed(() => props.projectWorkflows.length > 0)
const showPurchaseDialog = ref(false)
const activeTabId = ref('')
const cloningProject = ref(false)

const router = useRouter()
const communityStore = useCommunityStore()

// 节点类型映射
const nodeTypes = {
  'text-input': markRaw(TextNode),
  'image-input': markRaw(ImageNode),
  'video-input': markRaw(VideoNode),
  'audio-input': markRaw(AudioNode),
  'audio': markRaw(AudioNode),
  'image': markRaw(ImageNode),
  'video': markRaw(VideoNode),
  'image-gen': markRaw(ImageNode),
  'video-gen': markRaw(VideoNode),
  'text-to-image': markRaw(ImageNode),
  'image-to-image': markRaw(ImageNode),
  'text-to-video': markRaw(VideoNode),
  'image-to-video': markRaw(VideoNode),
  'llm': markRaw(LLMNode),
  'llm-prompt-enhance': markRaw(LLMNode),
  'llm-image-describe': markRaw(LLMNode),
  'llm-content-expand': markRaw(LLMNode),
  'preview-output': markRaw(PreviewNode),
  'grid-preview': markRaw(ImageNode),
  'group': markRaw(GroupNode),
  'character-card': markRaw(CharacterCardNode),
  'seedance-character': markRaw(SeedanceCharacterNode),
  'storyboard': markRaw(StoryboardNode)
}

const defaultEdgeOptions = {
  type: 'default'
}

function normalizeEdgeType(type) {
  if (!type || type === 'bezier') return 'default'
  return type
}

// 状态
const loading = ref(false)
const error = ref('')
const workflowName = ref('')
const nodes = ref([])
const edges = ref([])
const viewport = ref({ x: 0, y: 0, zoom: 1 })
const showForkDialog = ref(false)
const cloneFn = ref(null)
const canvasContainerRef = ref(null)

// 自定义滚轮缩放（与正式画布 CanvasBoard 一致）
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.1
const PAN_SPEED = 50
const { getViewport, setViewport } = useVueFlow('preview-flow')

let wheelRAF = null
function handleWheel(event) {
  event.preventDefault()
  if (wheelRAF) return
  wheelRAF = requestAnimationFrame(() => {
    wheelRAF = null
    handleWheelInner(event)
  })
}
function handleWheelInner(event) {
  const vp = getViewport()

  if (event.shiftKey) {
    const dx = event.deltaY > 0 ? -PAN_SPEED : PAN_SPEED
    setViewport({ x: vp.x + dx, y: vp.y, zoom: vp.zoom })
    return
  }
  if (event.ctrlKey || event.metaKey) {
    const dy = event.deltaY > 0 ? -PAN_SPEED : PAN_SPEED
    setViewport({ x: vp.x, y: vp.y + dy, zoom: vp.zoom })
    return
  }

  const delta = event.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED
  const newZoom = Math.min(Math.max(vp.zoom * (1 + delta), MIN_ZOOM), MAX_ZOOM)
  if (newZoom === vp.zoom) return

  const container = canvasContainerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  const flowX = (mouseX - vp.x) / vp.zoom
  const flowY = (mouseY - vp.y) / vp.zoom
  setViewport({ x: mouseX - flowX * newZoom, y: mouseY - flowY * newZoom, zoom: newZoom })
}

function attachWheelListener() {
  nextTick(() => {
    canvasContainerRef.value?.addEventListener('wheel', handleWheel, { passive: false })
  })
}
function detachWheelListener() {
  canvasContainerRef.value?.removeEventListener('wheel', handleWheel)
}
onBeforeUnmount(detachWheelListener)

// 监听弹窗打开，加载工作流数据
watch(() => props.modelValue, async (visible) => {
  if (!visible) return
  activeTabId.value = props.workflowId || (props.projectWorkflows[0]?.workflow_id || '')
  loading.value = true
  error.value = ''
  nodes.value = []
  edges.value = []
  if (isLocked.value) {
    loading.value = false
    return
  }
  await loadWorkflowData(activeTabId.value)
}, { flush: 'post' })

watch(() => props.workflowId, (newId, oldId) => {
  if (newId && newId !== oldId && props.modelValue) {
    activeTabId.value = newId
    loading.value = true
    error.value = ''
    nodes.value = []
    edges.value = []
    loadWorkflowData(newId)
  }
})

function switchTab(wfId) {
  if (wfId === activeTabId.value || loading.value) return
  activeTabId.value = wfId
  loading.value = true
  error.value = ''
  nodes.value = []
  edges.value = []
  loadWorkflowData(wfId)
}

function close() {
  detachWheelListener()
  emit('update:modelValue', false)
}

function handleClone() {
  if (!communityStore.requireLogin()) return
  if (props.workId) {
    cloneFn.value = (data) => forkWork(props.workId, {
      ...data,
      workflow_id: activeTabId.value || props.workflowId || undefined
    })
  } else if (props.templateId) {
    cloneFn.value = (data) => cloneTemplate(props.templateId, data)
  } else {
    cloneFn.value = null
  }
  showForkDialog.value = true
}

function onCloned(result) {
  showForkDialog.value = false
  close()
  if (result?.data?.workflow_id || result?.workflow_id || result?.workflowId) {
    const wfId = result.data?.workflow_id || result.workflow_id || result.workflowId
    router.push(`/canvas?load=${wfId}`)
  }
}
function onPurchased() {
  showPurchaseDialog.value = false
  emit('purchased')
  // 购买成功后重新触发加载
  loading.value = true
  error.value = ''
  nodes.value = []
  edges.value = []
  loadWorkflowData()
}

async function loadWorkflowData(targetWorkflowId) {
  try {
    let wf
    const wfId = targetWorkflowId || activeTabId.value || props.workflowId
    if (props.workId) {
      const data = await getWorkWorkflow(props.workId, wfId)
      wf = data.workflow || data
    } else if (props.templateId) {
      const data = await getTemplateWorkflow(props.templateId)
      wf = data.workflow || data
    } else if (props.featureId) {
      const data = await getFeatureWorkflow(props.featureId)
      wf = data.workflow || data
    } else if (wfId) {
      const data = await loadWorkflow(wfId)
      wf = data.workflow || data
    } else {
      error.value = '缺少工作流参数'
      return
    }
    workflowName.value = wf.name || ''
    const rawNodes = typeof wf.nodes === 'string' ? JSON.parse(wf.nodes) : (wf.nodes || [])
    const rawEdges = typeof wf.edges === 'string' ? JSON.parse(wf.edges) : (wf.edges || [])
    nodes.value = rawNodes.map(n => ({ ...n, draggable: false, selectable: true, connectable: false, data: { ...n.data, readonly: true } }))
    edges.value = rawEdges.map(e => ({ ...e, type: normalizeEdgeType(e.type), selectable: false, updatable: false }))
    if (wf.viewport) {
      viewport.value = typeof wf.viewport === 'string' ? JSON.parse(wf.viewport) : wf.viewport
    }
  } catch (e) {
    error.value = e.message || '加载工作流失败'
  } finally {
    loading.value = false
    if (nodes.value.length) attachWheelListener()
  }
}

async function handleCloneProject() {
  if (!communityStore.requireLogin()) return
  if (cloningProject.value) return
  cloningProject.value = true
  try {
    const res = await forkProject(props.workId)
    if (res.data?.project_id) {
      close()
      router.push('/canvas')
    }
  } catch (e) {
    alert(e.message || '克隆项目失败')
  } finally {
    cloningProject.value = false
  }
}

// ESC 关闭
function onKeydown(e) {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="modelValue" class="fixed inset-0 z-[9999] flex items-center justify-center" @keydown="onKeydown" tabindex="-1">
        <!-- 半透明遮罩 -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close" />

        <!-- 弹窗主体 -->
        <div class="relative w-[96vw] max-w-[1920px] h-[94vh] bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
          <!-- 顶部栏 -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <span class="text-white font-medium text-sm truncate">{{ workflowName || title }}</span>
              <span class="text-[11px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full shrink-0">只读预览</span>
            </div>
            <button
              class="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition shrink-0"
              aria-label="关闭"
              @click="close"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- 项目工作流标签卡 -->
          <div v-if="isProject" class="flex items-center gap-1 px-5 py-2 border-b border-white/[0.06] shrink-0 overflow-x-auto scrollbar-hide bg-neutral-900/60">
            <button
              v-for="wf in projectWorkflows"
              :key="wf.workflow_id"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all"
              :class="activeTabId === wf.workflow_id
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent'"
              @click="switchTab(wf.workflow_id)"
            >
              <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="6" height="6" rx="1" stroke-width="2"/><rect x="15" y="3" width="6" height="6" rx="1" stroke-width="2"/><rect x="9" y="15" width="6" height="6" rx="1" stroke-width="2"/><path d="M6 9v3h3M18 9v3h-3M12 15v-3" stroke-width="2"/>
              </svg>
              {{ wf.name || '未命名' }}
            </button>
          </div>

          <!-- VueFlow 画布 -->
          <div ref="canvasContainerRef" class="flex-1 relative overflow-hidden canvas-container">
            <!-- 付费锁定界面 -->
            <template v-if="isLocked">
              <div class="absolute inset-0 z-20 flex items-center justify-center bg-neutral-900/40 backdrop-blur-md">
                <div class="flex flex-col items-center gap-5 p-8 rounded-2xl bg-neutral-900/80 border border-neutral-700 max-w-sm text-center">
                  <div class="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
                    <svg class="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p class="text-lg font-medium text-white mb-1">付费工作流</p>
                    <p class="text-sm text-neutral-400">支付 {{ price }} 积分解锁制作过程</p>
                  </div>
                  <div class="text-2xl font-bold text-white">{{ price }} 积分</div>
                  <button
                    class="w-full px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 text-neutral-900 font-medium transition-colors"
                    @click="showPurchaseDialog = true"
                  >
                    支付解锁
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
                <div class="w-7 h-7 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
              </div>
              <div v-else-if="error" class="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
                {{ error }}
              </div>
              <VueFlow
                v-else-if="nodes.length"
                id="preview-flow"
                :nodes="nodes"
                :edges="edges"
                :node-types="nodeTypes"
                :default-viewport="viewport"
                :default-edge-options="defaultEdgeOptions"
                :nodes-draggable="false"
                :nodes-connectable="false"
                :elements-selectable="false"
                :zoom-on-scroll="false"
                :zoom-on-pinch="false"
                :pan-on-drag="[0, 2]"
                :pan-on-scroll="false"
                :zoom-on-double-click="false"
                :prevent-scrolling="true"
                :min-zoom="0.1"
                :max-zoom="5"
                fit-view-on-init
                class="w-full h-full"
              >
                <Background :gap="20" :size="1" pattern-color="rgba(255,255,255,0.03)" />
                <Controls :show-interactive="false" position="bottom-right" />
                <MiniMap position="bottom-left" />
              </VueFlow>
              <div v-else-if="!loading" class="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
                工作流不存在
              </div>
            </template>
          </div>

          <!-- 底部操作栏 -->
          <div class="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] shrink-0 bg-neutral-900/80">
            <template v-if="isLocked">
              <span class="text-xs text-neutral-500">需要付费解锁查看</span>
              <button
                class="px-4 py-1.5 bg-white hover:bg-neutral-200 text-neutral-900 text-sm rounded-lg transition flex items-center gap-1.5"
                @click="showPurchaseDialog = true"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                支付 {{ price }} 积分解锁
              </button>
            </template>
            <template v-else>
              <span class="text-xs text-neutral-500">如需创建请点击 →</span>
              <div class="flex items-center gap-2">
                <button
                  class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition flex items-center gap-1.5"
                  @click="handleClone"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  克隆工作流
                </button>
                <button
                  v-if="isProject"
                  class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition flex items-center gap-1.5"
                  :disabled="cloningProject"
                  @click="handleCloneProject"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  {{ cloningProject ? '克隆中...' : '克隆项目' }}
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- ForkDialog -->
        <ForkDialog
          v-model="showForkDialog"
          :work-id="workId || 0"
          :work-title="title"
          :clone-fn="cloneFn"
          @forked="onCloned"
        />

        <!-- PurchaseDialog -->
        <PurchaseDialog
          v-model="showPurchaseDialog"
          :work="work"
          @purchased="onPurchased"
        />
      </div>
    </transition>
  </Teleport>
</template>
