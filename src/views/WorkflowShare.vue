<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { clonePublicWorkflowShare, getPublicWorkflowShare } from '@/api/canvas/workflowShare'
import LoginModal from '@/components/community/LoginModal.vue'
import WorkflowShareNode from '@/components/canvas/WorkflowShareNode.vue'
import { normalizeWorkflowShareEdges, normalizeWorkflowShareNodes, normalizeWorkflowSharePayload } from '@/utils/workflowSharePreview'
import { useTeamStore } from '@/stores/team'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const route = useRoute()
const router = useRouter()
const teamStore = useTeamStore()
const loading = ref(true)
const pageError = ref('')
const shareData = ref(null)
const cloneError = ref('')
const cloneLoading = ref(false)
const showLoginModal = ref(false)
const pendingClone = ref(false)
const cloneIntentKey = ref('')
const shareMetaElements = []

const token = computed(() => String(route.params.token || ''))
const workflow = computed(() => shareData.value?.workflow || null)
const nodes = computed(() => normalizeWorkflowShareNodes(workflow.value?.nodes || []))
const edges = computed(() => normalizeWorkflowShareEdges(workflow.value?.edges || []))
const viewport = computed(() => workflow.value?.viewport || { x: 0, y: 0, zoom: 1 })
const warnings = computed(() => shareData.value?.warnings || [])
const canClone = computed(() => Boolean(shareData.value?.canClone && shareData.value?.mode === 'clone'))
const showWarnings = computed(() => {
  return warnings.value.length > 0 || (shareData.value?.mode === 'clone' && shareData.value?.canClone === false)
})
const nodeTypes = { 'workflow-share-node': markRaw(WorkflowShareNode) }

function getErrorMessage(error) {
  if (error?.status === 404) return '分享链接不存在或已失效。'
  if (error?.status === 403 && error?.code === 'share_tenant_mismatch') return '请登录分享所属站点后再试。'
  if (error?.status === 403) return '该分享链接当前不可访问。'
  if (error?.status === 429) return '访问过于频繁，请稍后再试。'
  if (error?.status === 413) return '工作流分享内容过大，暂时无法展示。'
  return '工作流分享加载失败，请稍后重试。'
}

function setShareMeta(name, content) {
  const selector = `meta[name="${name}"]`
  const existing = document.head.querySelector(selector)
  if (existing) {
    shareMetaElements.push({ element: existing, previous: existing.getAttribute('content') })
    existing.setAttribute('content', content)
    return
  }

  const element = document.createElement('meta')
  element.setAttribute('name', name)
  element.setAttribute('content', content)
  document.head.appendChild(element)
  shareMetaElements.push({ element, previous: null })
}

function applyShareMeta() {
  setShareMeta('robots', 'noindex, nofollow, noarchive')
  setShareMeta('referrer', 'no-referrer')
}

function restoreShareMeta() {
  for (const item of shareMetaElements.reverse()) {
    if (item.previous === null) item.element.remove()
    else item.element.setAttribute('content', item.previous)
  }
}

async function loadShare() {
  if (!token.value) {
    pageError.value = '分享链接无效。'
    loading.value = false
    return
  }

  loading.value = true
  pageError.value = ''
  cloneError.value = ''
  cloneIntentKey.value = ''
  try {
    const result = await getPublicWorkflowShare(token.value)
    shareData.value = normalizeWorkflowSharePayload(result?.data || result)
  } catch (error) {
    pageError.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function createCloneIntentKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const randomPart = Math.random().toString(16).slice(2).padEnd(30, '0')
  return `${Date.now().toString(16).padStart(8, '0')}-${randomPart.slice(0, 4)}-4${randomPart.slice(4, 7)}-8${randomPart.slice(7, 10)}-${randomPart.slice(10, 22)}`
}

function ensureCloneIntentKey() {
  if (!cloneIntentKey.value) cloneIntentKey.value = createCloneIntentKey()
  return cloneIntentKey.value
}

async function cloneWorkflow() {
  if (!canClone.value || cloneLoading.value) return

  cloneLoading.value = true
  cloneError.value = ''
  const idempotencyKey = ensureCloneIntentKey()
  try {
    const result = await clonePublicWorkflowShare(token.value, shareData.value.sourceRevision, idempotencyKey)
    const workflowId = result?.data?.workflow_id
    if (!workflowId) throw new Error('clone_missing_workflow_id')
    cloneIntentKey.value = ''
    teamStore.switchToPersonalSpace()
    router.push({ path: '/canvas', query: { load: String(workflowId) } })
  } catch (error) {
    if (error?.status === 401) {
      pendingClone.value = true
      showLoginModal.value = true
    } else if (error?.status === 403 && error?.code === 'share_tenant_mismatch') {
      cloneError.value = '请登录分享所属站点后再试。'
    } else if (error?.status === 403) {
      cloneError.value = '当前账号无权克隆此工作流。'
    } else if (error?.status === 409) {
      cloneIntentKey.value = ''
      cloneError.value = '分享内容已更新，请刷新页面后重试。'
    } else if (error?.status === 413) {
      cloneError.value = '工作流过大，无法克隆到个人空间。'
    } else if (error?.status === 429) {
      cloneError.value = '克隆请求过于频繁，请稍后再试。'
    } else {
      cloneError.value = '克隆失败，请稍后重试。'
    }
  } finally {
    cloneLoading.value = false
  }
}

function handleClone() {
  if (!canClone.value) return
  ensureCloneIntentKey()
  if (!localStorage.getItem('token')) {
    pendingClone.value = true
    showLoginModal.value = true
    return
  }
  cloneWorkflow()
}

function refreshShare() {
  loadShare()
}

async function handleLoginSuccess() {
  showLoginModal.value = false
  if (pendingClone.value) {
    pendingClone.value = false
    await cloneWorkflow()
  }
}

function goHome() {
  router.push('/')
}

onMounted(() => {
  applyShareMeta()
  loadShare()
})

watch(token, (nextToken, previousToken) => {
  if (nextToken !== previousToken) loadShare()
})

onBeforeUnmount(restoreShareMeta)
</script>

<template>
  <main class="workflow-share-page">
    <div v-if="loading" class="workflow-share-state">
      <div class="workflow-share-spinner"></div>
      <p>正在加载公开工作流…</p>
    </div>

    <div v-else-if="pageError" class="workflow-share-state">
      <div class="workflow-share-state-icon">⌁</div>
      <h1>无法打开分享</h1>
      <p>{{ pageError }}</p>
      <div class="workflow-share-state-actions">
        <button type="button" @click="refreshShare">重新加载</button>
        <button type="button" @click="goHome">返回首页</button>
      </div>
    </div>

    <template v-else-if="shareData && workflow">
      <header class="workflow-share-topbar">
        <div class="workflow-share-brand">
          <span class="workflow-share-brand-mark">⌘</span>
          <span>公开工作流</span>
        </div>
        <div class="workflow-share-heading">
          <h1>{{ workflow.name || '未命名工作流' }}</h1>
          <p v-if="workflow.updated_at">更新于 {{ new Date(workflow.updated_at).toLocaleString('zh-CN') }}</p>
        </div>
        <div class="workflow-share-top-actions">
          <span class="workflow-share-readonly-pill">只读预览</span>
          <button class="workflow-share-refresh" type="button" :disabled="loading" @click="refreshShare">刷新</button>
          <button v-if="canClone" class="workflow-share-clone" type="button" :disabled="cloneLoading" @click="handleClone">
            {{ cloneLoading ? '克隆中…' : '克隆到我的空间' }}
          </button>
          <span v-else class="workflow-share-clone-disabled">当前分享不可克隆</span>
        </div>
      </header>

      <section class="workflow-share-info">
        <p v-if="workflow.description" class="workflow-share-description">{{ workflow.description }}</p>
        <p v-else class="workflow-share-description workflow-share-description-muted">该工作流没有描述。</p>
        <div class="workflow-share-counts">
          <span>{{ nodes.length }} 个节点</span>
          <span>{{ edges.length }} 条连接</span>
          <span>滚轮缩放 · 拖动画布平移</span>
        </div>
      </section>

      <section v-if="showWarnings" class="workflow-share-warnings" aria-live="polite">
        <strong>只读保护提示</strong>
        <ul>
          <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
          <li v-if="shareData.mode === 'clone' && !shareData.canClone && warnings.length === 0">当前分享包含无法安全克隆的内容，仅支持只读预览。</li>
        </ul>
      </section>

      <section class="workflow-share-flow-shell" aria-label="工作流只读画布">
        <VueFlow
          id="workflow-share-preview"
          :nodes="nodes"
          :edges="edges"
          :node-types="nodeTypes"
          :default-viewport="viewport"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :elements-selectable="false"
          :zoom-on-scroll="true"
          :zoom-on-pinch="true"
          :pan-on-drag="[0, 2]"
          :pan-on-scroll="false"
          :zoom-on-double-click="false"
          :prevent-scrolling="true"
          :min-zoom="0.1"
          :max-zoom="5"
          class="workflow-share-flow"
        >
          <Background :gap="24" :size="1" pattern-color="rgba(255,255,255,0.055)" />
          <Controls :show-interactive="false" position="bottom-right" />
        </VueFlow>
      </section>

      <p v-if="cloneError" class="workflow-share-clone-error" role="alert">{{ cloneError }}</p>

      <LoginModal v-model="showLoginModal" @login-success="handleLoginSuccess" />
    </template>
  </main>
</template>

<style scoped>
.workflow-share-page { min-height: 100vh; color: #f5f5f5; background: #090909; }
.workflow-share-topbar { position: relative; z-index: 4; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; min-height: 68px; padding: 12px 22px; background: rgba(16, 16, 16, 0.92); border-bottom: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(12px); }
.workflow-share-brand, .workflow-share-top-actions { display: flex; align-items: center; gap: 9px; }
.workflow-share-brand { color: #d4d4d4; font-size: 13px; font-weight: 600; }
.workflow-share-brand-mark { display: grid; width: 28px; height: 28px; place-items: center; color: #171717; background: #f5f5f5; border-radius: 8px; font-weight: 800; }
.workflow-share-heading { min-width: 0; text-align: center; }
.workflow-share-heading h1 { max-width: min(520px, 45vw); margin: 0; overflow: hidden; font-size: 16px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.workflow-share-heading p { margin: 4px 0 0; color: #a3a3a3; font-size: 11px; }
.workflow-share-top-actions { justify-content: flex-end; }
.workflow-share-readonly-pill, .workflow-share-clone-disabled { padding: 5px 8px; color: #a3a3a3; background: rgba(255, 255, 255, 0.07); border-radius: 999px; font-size: 11px; white-space: nowrap; }
.workflow-share-clone { padding: 9px 13px; color: #171717; background: #f5f5f5; border: 1px solid #f5f5f5; border-radius: 8px; font-size: 12px; font-weight: 650; cursor: pointer; }
.workflow-share-clone:hover:not(:disabled) { background: #fff; }
.workflow-share-clone:disabled { cursor: wait; opacity: 0.55; }
.workflow-share-info { position: relative; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 16px 22px; background: #101010; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
.workflow-share-description { max-width: 900px; margin: 0; color: #d4d4d4; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.workflow-share-description-muted { color: #737373; }
.workflow-share-counts { display: flex; flex-shrink: 0; gap: 12px; color: #737373; font-size: 11px; white-space: nowrap; }
.workflow-share-warnings { position: relative; z-index: 2; display: grid; gap: 5px; margin: 14px 22px 0; padding: 11px 13px; color: #fde68a; background: rgba(120, 83, 0, 0.2); border: 1px solid rgba(250, 204, 21, 0.22); border-radius: 9px; font-size: 12px; line-height: 1.5; }
.workflow-share-warnings strong { font-size: 12px; }
.workflow-share-warnings ul { display: grid; gap: 3px; margin: 0; padding-left: 18px; }
.workflow-share-flow-shell { position: fixed; inset: 68px 0 0; }
.workflow-share-flow { width: 100%; height: 100%; background: #0d0d0d; }
.workflow-share-clone-error { position: fixed; right: 22px; bottom: 20px; z-index: 5; max-width: min(360px, calc(100vw - 44px)); margin: 0; padding: 11px 13px; color: #fecaca; background: rgba(127, 29, 29, 0.9); border: 1px solid rgba(248, 113, 113, 0.35); border-radius: 9px; font-size: 12px; }
.workflow-share-state { display: flex; min-height: 100vh; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; color: #a3a3a3; text-align: center; }
.workflow-share-state h1 { margin: 0; color: #f5f5f5; font-size: 20px; }
.workflow-share-state p { margin: 0; font-size: 13px; }
.workflow-share-state-actions { display: flex; gap: 8px; }
.workflow-share-state button,
.workflow-share-refresh { margin-top: 8px; padding: 9px 14px; color: #171717; background: #f5f5f5; border: 0; border-radius: 8px; cursor: pointer; }
.workflow-share-refresh { margin-top: 0; padding: 6px 9px; color: #d4d4d4; background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.14); font-size: 11px; }
.workflow-share-refresh:disabled { cursor: wait; opacity: 0.55; }
.workflow-share-state-icon { display: grid; width: 48px; height: 48px; place-items: center; color: #171717; background: #f5f5f5; border-radius: 14px; font-size: 26px; }
.workflow-share-spinner { width: 28px; height: 28px; border: 2px solid rgba(255, 255, 255, 0.16); border-top-color: #f5f5f5; border-radius: 50%; animation: workflow-share-spin 0.8s linear infinite; }
@keyframes workflow-share-spin { to { transform: rotate(360deg); } }

@media (max-width: 760px) {
  .workflow-share-topbar { grid-template-columns: 1fr auto; }
  .workflow-share-heading { grid-column: 1 / -1; grid-row: 2; order: 3; }
  .workflow-share-heading h1 { max-width: 80vw; }
  .workflow-share-info { flex-direction: column; gap: 8px; }
  .workflow-share-counts { flex-wrap: wrap; white-space: normal; }
  .workflow-share-flow-shell { inset: 122px 0 0; }
  .workflow-share-top-actions { gap: 6px; }
  .workflow-share-readonly-pill { display: none; }
}
</style>
