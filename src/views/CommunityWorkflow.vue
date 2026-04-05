<script setup>
/**
 * CommunityWorkflow.vue - 社区工作流只读预览页
 * 路由: /community/:id/workflow
 * 展示社区作品关联的工作流，支持免费/付费模式
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick, provide, markRaw } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { getWorkDetail, getWorkWorkflow, getProjectWorkflows } from '@/api/community'
import { useCommunityStore } from '@/stores/community'
import ForkDialog from '@/components/community/ForkDialog.vue'
import PurchaseDialog from '@/components/community/PurchaseDialog.vue'

// 自定义节点组件（与 CanvasBoard 保持一致）
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

const router = useRouter()
const route = useRoute()
const communityStore = useCommunityStore()

const previewUserInfo = ref(null)
provide('userInfo', previewUserInfo)

const workId = computed(() => route.params.id)

// --- 状态 ---
const loading = ref(true)
const error = ref('')
const work = ref(null)
const nodes = ref([])
const edges = ref([])
const viewport = ref({ x: 0, y: 0, zoom: 1 })
const workflowLoaded = ref(false)

// 弹窗
const showForkDialog = ref(false)
const showPurchaseDialog = ref(false)

// 项目信息
const projectInfo = ref(null)

// 自定义节点类型映射
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

// 自定义滚轮（与正式画布 CanvasBoard 一致）
const canvasAreaRef = ref(null)
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.1
const PAN_SPEED = 50
const { getViewport, setViewport } = useVueFlow('community-workflow')

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
  const container = canvasAreaRef.value
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
    canvasAreaRef.value?.addEventListener('wheel', handleWheel, { passive: false })
  })
}
function detachWheelListener() {
  canvasAreaRef.value?.removeEventListener('wheel', handleWheel)
}
onBeforeUnmount(detachWheelListener)

// --- 计算属性 ---
const isPaid = computed(() => work.value?.share_mode === 'paid')
const isLocked = computed(() => isPaid.value && !work.value?.is_purchased && !isOwnWork.value)
const isOwnWork = computed(() => {
  const userId = localStorage.getItem('userId')
  return userId && work.value?.user_id && String(work.value.user_id) === String(userId)
})
const canViewWorkflow = computed(() => !isPaid.value || work.value?.is_purchased || isOwnWork.value)

// --- 数据加载 ---
async function loadWorkDetail() {
  try {
    const data = await getWorkDetail(workId.value)
    work.value = data.work || data
    // 加载项目信息
    projectInfo.value = null
    if (work.value.project_id) {
      try {
        const projRes = await getProjectWorkflows(work.value.id)
        if (projRes.data?.project) {
          projectInfo.value = projRes.data.project
        }
      } catch (e) {
        console.error('[CommunityWorkflow] 加载项目信息失败:', e)
      }
    }
  } catch (e) {
    error.value = e.message || '加载作品信息失败'
    throw e
  }
}

async function loadWorkflow() {
  try {
    const data = await getWorkWorkflow(workId.value)
    const wf = data.workflow || data
    // 解析 nodes/edges（可能是 JSON 字符串）
    const rawNodes = typeof wf.nodes === 'string' ? JSON.parse(wf.nodes) : (wf.nodes || [])
    const rawEdges = typeof wf.edges === 'string' ? JSON.parse(wf.edges) : (wf.edges || [])
    // 标记所有节点为不可拖拽
    nodes.value = rawNodes.map(n => ({ ...n, draggable: false, selectable: true, connectable: false, data: { ...n.data, readonly: true } }))
    edges.value = rawEdges.map(e => ({
      ...e,
      type: normalizeEdgeType(e.type),
      selectable: false,
      updatable: false
    }))
    if (wf.viewport) {
      viewport.value = typeof wf.viewport === 'string' ? JSON.parse(wf.viewport) : wf.viewport
    }
    workflowLoaded.value = true
  } catch (e) {
    if (e.status === 403) {
      // 付费未购买，预期行为
      return
    }
    error.value = e.message || '加载工作流失败'
  }
}

// --- 操作 ---
function handleFork() {
  if (!communityStore.requireLogin()) return
  showForkDialog.value = true
}

function handlePurchase() {
  if (!communityStore.requireLogin()) return
  showPurchaseDialog.value = true
}

async function onPurchased() {
  // 购买成功后重新加载
  await loadWorkDetail()
  await loadWorkflow()
}

function goBack() {
  router.push('/community/' + workId.value)
}

// --- 生命周期 ---
onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    await loadWorkDetail()
    if (canViewWorkflow.value) {
      await loadWorkflow()
      if (workflowLoaded.value) attachWheelListener()
    }
  } catch {
    // error 已在子函数中设置
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="fixed inset-0 bg-gray-950 text-white flex flex-col canvas-container">
    <!-- 加载状态 -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-4">
      <p class="text-gray-400">{{ error }}</p>
      <button
        class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
        @click="goBack"
      >
        返回
      </button>
    </div>

    <!-- 主内容 -->
    <template v-else-if="work">
      <!-- 顶部工具栏 -->
      <div class="flex items-center justify-between px-4 py-3 bg-gray-900/80 backdrop-blur border-b border-gray-800 z-10 flex-shrink-0">
        <!-- 左侧：返回 -->
        <button
          class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
          aria-label="返回社区"
          @click="goBack"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          返回社区
        </button>
        <!-- 中间：标题 + 作者 -->
        <div class="flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
          <img
            v-if="work.author_avatar"
            :src="work.author_avatar"
            alt="作者头像"
            class="w-7 h-7 rounded-full object-cover"
          />
          <div class="text-center">
            <h1 class="text-sm font-medium truncate max-w-[300px]">{{ work.title }}</h1>
            <p v-if="work.author_name" class="text-xs text-gray-400">{{ work.author_name }}</p>
          </div>
        </div>
        <!-- 右侧占位 -->
        <div class="w-20" />
      </div>

      <!-- 画布区域 -->
      <div ref="canvasAreaRef" class="flex-1 relative overflow-hidden">
        <!-- 可查看：渲染工作流 -->
        <template v-if="canViewWorkflow && workflowLoaded">
          <VueFlow
            id="community-workflow"
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
        </template>

        <!-- 付费锁定：模糊遮罩 -->
        <template v-if="isLocked">
          <div class="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/40 backdrop-blur-md">
            <div class="flex flex-col items-center gap-5 p-8 rounded-2xl bg-gray-900/80 border border-gray-700 max-w-sm text-center">
              <!-- 锁图标 -->
              <div class="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p class="text-lg font-medium mb-1">付费工作流</p>
                <p class="text-sm text-gray-400">解锁后可查看完整工作流并复刻到你的空间</p>
              </div>
              <div class="text-2xl font-bold text-white">
                {{ work.price }} 积分
              </div>
              <button
                class="w-full px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 text-neutral-900 font-medium transition-colors"
                @click="handlePurchase"
              >
                支付 {{ work.price }} 积分解锁
              </button>
            </div>
          </div>
        </template>

        <!-- 加载工作流中 -->
        <div v-if="canViewWorkflow && !workflowLoaded && !error" class="absolute inset-0 flex items-center justify-center">
          <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>

      <!-- 底部操作栏（非锁定状态显示复刻按钮） -->
      <div v-if="!isLocked" class="flex items-center justify-center px-4 py-3 bg-gray-900/80 backdrop-blur border-t border-gray-800 z-10 flex-shrink-0">
        <button
          class="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
          @click="handleFork"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          复刻到我的空间
        </button>
      </div>
    </template>

    <!-- 弹窗（始终挂载，不受 v-if 条件影响） -->
    <ForkDialog
      v-model="showForkDialog"
      :work-id="Number(workId)"
      :work-title="work?.title || ''"
      :hasProject="!!projectInfo"
      :projectName="projectInfo?.name || ''"
      :projectWorkflowCount="projectInfo?.workflow_count || 0"
    />
    <PurchaseDialog
      v-model="showPurchaseDialog"
      :work="work || {}"
      @purchased="onPurchased"
    />
  </div>
</template>
