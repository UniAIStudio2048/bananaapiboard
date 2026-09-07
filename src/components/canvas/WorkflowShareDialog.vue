<script setup>
import { computed, ref, watch } from 'vue'
import { useTeamStore } from '@/stores/team'
import {
  getWorkflowShare,
  getWorkflowShareStatus,
  resetWorkflowShare,
  updateWorkflowShare
} from '@/api/canvas/workflowShare'
import {
  buildWorkflowShareUrl,
  getWorkflowShareAccess,
  normalizeWorkflowShareMode
} from '@/utils/workflowShare'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  workflow: { type: Object, default: null },
  workflowId: { type: [String, Number], default: '' },
  spaceType: { type: String, default: '' },
  teamId: { type: [String, Number], default: '' }
})

const emit = defineEmits(['update:modelValue', 'updated'])

const teamStore = useTeamStore()
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const shareState = ref(null)
const selectedMode = ref('disabled')
const confirmed = ref(false)
const copied = ref(false)
const loadedWorkflowKey = ref('')

const resolvedWorkflowId = computed(() => props.workflowId || props.workflow?.id || '')
const resolvedSpaceType = computed(() => props.spaceType || props.workflow?.space_type || 'personal')
const resolvedTeamId = computed(() => props.teamId || props.workflow?.team_id || '')
const workflowKey = computed(() => String(resolvedWorkflowId.value || ''))
const workflowTitle = computed(() => props.workflow?.name || '工作流')
const currentMode = computed(() => normalizeWorkflowShareMode(shareState.value?.mode))
const shareUrl = computed(() => buildWorkflowShareUrl(
  window.location.origin,
  shareState.value?.token
))
const access = computed(() => getWorkflowShareAccess({
  spaceType: resolvedSpaceType.value,
  teamId: resolvedTeamId.value,
  teams: teamStore.myTeams.value
}))
const canManage = computed(() => Boolean(shareState.value?.canManage && access.value.canManage))
const needsConfirmation = computed(() => {
  return canManage.value && selectedMode.value !== 'disabled' && selectedMode.value !== currentMode.value
})
const hasChanges = computed(() => selectedMode.value !== currentMode.value)

const modeOptions = [
  {
    value: 'disabled',
    title: '关闭公开分享',
    description: '链接立即失效，其他人无法查看。'
  },
  {
    value: 'view',
    title: '仅查看',
    description: '访客可以查看工作流和节点详情，但不能克隆。'
  },
  {
    value: 'clone',
    title: '查看并克隆',
    description: '访客可以查看，并将副本克隆到自己的个人空间。'
  }
]

function close() {
  emit('update:modelValue', false)
}

function resetLocalState() {
  loading.value = false
  saving.value = false
  errorMessage.value = ''
  shareState.value = null
  selectedMode.value = 'disabled'
  confirmed.value = false
  copied.value = false
}

function applyShareState(data) {
  shareState.value = data || {}
  selectedMode.value = currentMode.value
  confirmed.value = false
  copied.value = false
}

async function resolveAccess() {
  if (resolvedSpaceType.value !== 'team') return access.value
  const team = teamStore.myTeams.value.find(item => String(item?.id) === String(resolvedTeamId.value))
  if (!team) {
    await teamStore.loadMyTeams()
  }
  return access.value
}

async function loadStatus() {
  if (!workflowKey.value) {
    errorMessage.value = '工作流尚未保存，保存成功后才能分享。'
    return
  }

  resetLocalState()
  loadedWorkflowKey.value = workflowKey.value
  loading.value = true
  try {
    const currentAccess = await resolveAccess()
    const result = currentAccess.statusEndpoint
      ? await getWorkflowShareStatus(workflowKey.value)
      : await getWorkflowShare(workflowKey.value)
    applyShareState(result?.data || result)
  } catch (error) {
    errorMessage.value = error.message || '获取分享状态失败'
  } finally {
    loading.value = false
  }
}

function selectMode(mode) {
  selectedMode.value = mode
  confirmed.value = false
}

function notifyUpdated(data) {
  emit('updated', {
    workflowId: workflowKey.value,
    mode: normalizeWorkflowShareMode(data?.mode),
    token: data?.token || null,
    canManage: Boolean(data?.canManage)
  })
}

async function saveShareMode() {
  if (!canManage.value || !hasChanges.value || (needsConfirmation.value && !confirmed.value) || saving.value) return

  saving.value = true
  errorMessage.value = ''
  try {
    const result = await updateWorkflowShare(workflowKey.value, selectedMode.value)
    const data = result?.data || result
    applyShareState(data)
    notifyUpdated(data)
  } catch (error) {
    errorMessage.value = error.message || '更新分享设置失败'
  } finally {
    saving.value = false
  }
}

async function resetShareLink() {
  if (!canManage.value || saving.value || !shareUrl.value) return

  saving.value = true
  errorMessage.value = ''
  try {
    const result = await resetWorkflowShare(workflowKey.value)
    const data = result?.data || result
    applyShareState(data)
    notifyUpdated(data)
    await copyShareLink(data?.token)
  } catch (error) {
    errorMessage.value = error.message || '重置分享链接失败'
  } finally {
    saving.value = false
  }
}

async function copyShareLink(token = shareState.value?.token) {
  const url = buildWorkflowShareUrl(window.location.origin, token)
  if (!url) return false

  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1800)
    return true
  } catch {
    errorMessage.value = '复制失败，请手动复制链接。'
    return false
  }
}

watch(
  () => [props.modelValue, workflowKey.value],
  ([visible]) => {
    if (visible && loadedWorkflowKey.value !== workflowKey.value) {
      loadStatus()
    }
    if (!visible) {
      loadedWorkflowKey.value = ''
    }
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="workflow-share-overlay" @click.self="close">
      <section class="workflow-share-dialog" role="dialog" aria-modal="true" aria-labelledby="workflow-share-title">
        <header class="workflow-share-header">
          <div>
            <p class="workflow-share-eyebrow">WORKFLOW SHARE</p>
            <h2 id="workflow-share-title">公开分享</h2>
            <p class="workflow-share-subtitle">{{ workflowTitle }}</p>
          </div>
          <button class="workflow-share-close" type="button" aria-label="关闭" @click="close">×</button>
        </header>

        <div class="workflow-share-body">
          <div v-if="loading" class="workflow-share-loading">正在读取分享状态…</div>
          <template v-else>
            <div v-if="errorMessage" class="workflow-share-error" role="alert">{{ errorMessage }}</div>

            <div v-if="!workflowKey" class="workflow-share-empty">
              请先保存工作流，保存成功后再创建公开链接。
            </div>

            <template v-else>
              <div v-if="!canManage" class="workflow-share-readonly">
                <strong>团队分享状态只读</strong>
                <span>你可以查看当前状态；只有团队 owner/admin 可以修改分享范围。</span>
              </div>

              <fieldset v-if="canManage" class="workflow-share-options">
                <legend>公开范围</legend>
                <label
                  v-for="option in modeOptions"
                  :key="option.value"
                  class="workflow-share-option"
                  :class="{ selected: selectedMode === option.value }"
                >
                  <input
                    type="radio"
                    name="workflow-share-mode"
                    :value="option.value"
                    :checked="selectedMode === option.value"
                    @change="selectMode(option.value)"
                  />
                  <span class="workflow-share-option-copy">
                    <strong>{{ option.title }}</strong>
                    <span>{{ option.description }}</span>
                  </span>
                </label>
              </fieldset>

              <div v-else class="workflow-share-current">
                <span>当前状态</span>
                <strong>{{ modeOptions.find(option => option.value === currentMode)?.title }}</strong>
              </div>

              <label v-if="canManage && needsConfirmation" class="workflow-share-confirm">
                <input v-model="confirmed" type="checkbox" />
                <span>我确认：提示词、参数、素材及结果将公开，后续成功保存的修改也会公开。请先检查内容中是否包含秘密；只读不防复制，关闭或重置链接无法收回已获取的内容和副本。</span>
              </label>

              <div v-if="shareUrl" class="workflow-share-link-card">
                <div class="workflow-share-link-heading">
                  <span>分享链接</span>
                  <span class="workflow-share-status">{{ currentMode === 'clone' ? '可克隆' : '仅查看' }}</span>
                </div>
                <div class="workflow-share-link-row">
                  <input :value="shareUrl" readonly aria-label="分享链接" @focus="$event.target.select()" />
                  <button type="button" @click="copyShareLink()">{{ copied ? '已复制' : '复制' }}</button>
                </div>
                <div class="workflow-share-link-actions">
                  <a :href="shareUrl" target="_blank" rel="noopener noreferrer">打开预览</a>
                  <button v-if="canManage" type="button" :disabled="saving" @click="resetShareLink">重置并复制</button>
                </div>
              </div>
              <p v-else-if="currentMode !== 'disabled'" class="workflow-share-no-token">当前成员可以看到分享状态，但链接仅对管理者显示。</p>
            </template>
          </template>
        </div>

        <footer class="workflow-share-footer">
          <button class="workflow-share-cancel" type="button" @click="close">关闭</button>
          <button
            v-if="canManage && workflowKey"
            class="workflow-share-save"
            type="button"
            :disabled="saving || loading || !hasChanges || (needsConfirmation && !confirmed)"
            @click="saveShareMode"
          >
            {{ saving ? '保存中…' : '保存分享设置' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.workflow-share-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
}

.workflow-share-dialog {
  width: min(560px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: auto;
  color: #f5f5f5;
  background: #171717;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.56);
}

.workflow-share-header,
.workflow-share-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-color: rgba(255, 255, 255, 0.1);
}

.workflow-share-header { border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.workflow-share-footer { border-top: 1px solid rgba(255, 255, 255, 0.1); justify-content: flex-end; }
.workflow-share-eyebrow { margin: 0 0 5px; color: #a3a3a3; font-size: 10px; letter-spacing: 0.16em; }
.workflow-share-header h2 { margin: 0; font-size: 20px; font-weight: 650; }
.workflow-share-subtitle { max-width: 420px; margin: 5px 0 0; overflow: hidden; color: #a3a3a3; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.workflow-share-close { width: 32px; height: 32px; padding: 0; color: #a3a3a3; background: transparent; border: 0; border-radius: 8px; font-size: 25px; line-height: 1; cursor: pointer; }
.workflow-share-close:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
.workflow-share-body { display: grid; gap: 16px; padding: 24px; }
.workflow-share-loading,
.workflow-share-empty,
.workflow-share-no-token { color: #a3a3a3; font-size: 14px; line-height: 1.6; }
.workflow-share-error { padding: 11px 13px; color: #fecaca; background: rgba(127, 29, 29, 0.35); border: 1px solid rgba(248, 113, 113, 0.35); border-radius: 9px; font-size: 13px; line-height: 1.5; }
.workflow-share-readonly { display: grid; gap: 4px; padding: 13px 14px; color: #d4d4d4; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; font-size: 13px; line-height: 1.5; }
.workflow-share-readonly span { color: #a3a3a3; }
.workflow-share-options { display: grid; gap: 9px; padding: 0; border: 0; }
.workflow-share-options legend { margin-bottom: 1px; color: #d4d4d4; font-size: 13px; font-weight: 600; }
.workflow-share-option { display: flex; gap: 12px; align-items: flex-start; padding: 13px 14px; background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; cursor: pointer; transition: border-color 0.18s, background 0.18s; }
.workflow-share-option:hover,
.workflow-share-option.selected { background: rgba(255, 255, 255, 0.07); border-color: rgba(255, 255, 255, 0.28); }
.workflow-share-option input { margin-top: 3px; accent-color: #f5f5f5; }
.workflow-share-option-copy { display: grid; gap: 4px; }
.workflow-share-option-copy strong { font-size: 14px; }
.workflow-share-option-copy span { color: #a3a3a3; font-size: 12px; line-height: 1.5; }
.workflow-share-current { display: flex; align-items: center; justify-content: space-between; padding: 13px 14px; color: #a3a3a3; background: rgba(255, 255, 255, 0.04); border-radius: 10px; font-size: 13px; }
.workflow-share-current strong { color: #f5f5f5; }
.workflow-share-confirm { display: flex; gap: 9px; align-items: flex-start; color: #d4d4d4; font-size: 13px; line-height: 1.5; cursor: pointer; }
.workflow-share-confirm input { margin-top: 3px; accent-color: #f5f5f5; }
.workflow-share-link-card { display: grid; gap: 10px; padding: 14px; background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; }
.workflow-share-link-heading,
.workflow-share-link-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.workflow-share-link-heading { color: #d4d4d4; font-size: 13px; font-weight: 600; }
.workflow-share-status { padding: 3px 7px; color: #d4d4d4; background: rgba(255, 255, 255, 0.08); border-radius: 999px; font-size: 11px; font-weight: 500; }
.workflow-share-link-row { display: flex; gap: 8px; }
.workflow-share-link-row input { min-width: 0; flex: 1; padding: 9px 10px; color: #d4d4d4; background: #0f0f0f; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 7px; font-size: 12px; }
.workflow-share-link-row button,
.workflow-share-link-actions button,
.workflow-share-link-actions a { padding: 8px 10px; color: #f5f5f5; background: transparent; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 7px; font-size: 12px; text-decoration: none; cursor: pointer; }
.workflow-share-link-row button:hover,
.workflow-share-link-actions button:hover,
.workflow-share-link-actions a:hover { background: rgba(255, 255, 255, 0.1); }
.workflow-share-link-actions { justify-content: flex-start; }
.workflow-share-link-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
.workflow-share-cancel,
.workflow-share-save { padding: 10px 15px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.workflow-share-cancel { color: #d4d4d4; background: transparent; border: 1px solid rgba(255, 255, 255, 0.16); }
.workflow-share-save { color: #171717; background: #f5f5f5; border: 1px solid #f5f5f5; font-weight: 600; }
.workflow-share-cancel:hover { background: rgba(255, 255, 255, 0.08); }
.workflow-share-save:hover:not(:disabled) { background: #fff; }
.workflow-share-save:disabled { opacity: 0.45; cursor: not-allowed; }

:global(:root.canvas-theme-light) .workflow-share-dialog { color: #1c1917; background: #fff; border-color: rgba(0, 0, 0, 0.12); }
:global(:root.canvas-theme-light) .workflow-share-header { border-bottom-color: rgba(0, 0, 0, 0.1); }
:global(:root.canvas-theme-light) .workflow-share-footer { border-top-color: rgba(0, 0, 0, 0.1); }
:global(:root.canvas-theme-light) .workflow-share-eyebrow,
:global(:root.canvas-theme-light) .workflow-share-subtitle,
:global(:root.canvas-theme-light) .workflow-share-loading,
:global(:root.canvas-theme-light) .workflow-share-empty,
:global(:root.canvas-theme-light) .workflow-share-no-token,
:global(:root.canvas-theme-light) .workflow-share-option-copy span,
:global(:root.canvas-theme-light) .workflow-share-readonly span { color: #78716c; }
:global(:root.canvas-theme-light) .workflow-share-option,
:global(:root.canvas-theme-light) .workflow-share-readonly,
:global(:root.canvas-theme-light) .workflow-share-current,
:global(:root.canvas-theme-light) .workflow-share-link-card { background: #fafaf9; border-color: rgba(0, 0, 0, 0.1); }
:global(:root.canvas-theme-light) .workflow-share-option:hover,
:global(:root.canvas-theme-light) .workflow-share-option.selected { background: #f5f5f4; border-color: rgba(0, 0, 0, 0.24); }
:global(:root.canvas-theme-light) .workflow-share-option-copy strong,
:global(:root.canvas-theme-light) .workflow-share-options legend,
:global(:root.canvas-theme-light) .workflow-share-current strong,
:global(:root.canvas-theme-light) .workflow-share-link-heading { color: #292524; }
:global(:root.canvas-theme-light) .workflow-share-link-row input { color: #44403c; background: #fff; border-color: rgba(0, 0, 0, 0.12); }
:global(:root.canvas-theme-light) .workflow-share-link-row button,
:global(:root.canvas-theme-light) .workflow-share-link-actions button,
:global(:root.canvas-theme-light) .workflow-share-link-actions a,
:global(:root.canvas-theme-light) .workflow-share-cancel { color: #44403c; border-color: rgba(0, 0, 0, 0.16); }
:global(:root.canvas-theme-light) .workflow-share-status { color: #57534e; background: rgba(0, 0, 0, 0.06); }
:global(:root.canvas-theme-light) .workflow-share-save { color: #fff; background: #292524; border-color: #292524; }
</style>
