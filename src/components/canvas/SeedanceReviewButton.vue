<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useCanvasStore } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import { isSeedanceFeaturesEnabled } from '@/config/tenant'
import { showToast } from '@/composables/useCanvasDialog'
import { createQuickSeedanceCharacterAsset, getAssetReviewProviders, pollAssetStatus } from '@/api/canvas/volcengine-assets'
import { resolveSeedanceMediaUrl } from '@/api/canvas/seedance-media-upload'
import { getSeedanceSourceUrl } from '@/utils/seedanceMedia'
import { getSeedanceQuickAssetStatus } from '@/utils/seedanceQuickAsset'
import { createSeedanceReviewController } from '@/utils/seedanceReviewController'

const props = defineProps({ nodeId: String, data: Object, assetType: { type: String, default: 'Image' } })
const canvasStore = useCanvasStore()
const teamStore = useTeamStore()
const enabled = computed(() => isSeedanceFeaturesEnabled())
const submitting = ref(false)
const providers = ref([])
const selectedProvider = ref('')
const loadingProviders = ref(false)
const reviewControl = ref(null)
const reviewButton = ref(null)
const menuOpen = ref(false)
onClickOutside(reviewControl, () => { menuOpen.value = false })
const status = computed(() => getSeedanceQuickAssetStatus(props.data))

async function loadProviders() {
  loadingProviders.value = true
  try {
    const result = await getAssetReviewProviders()
    providers.value = (result.enabledProviders || []).filter(provider => provider.assetTypes.includes(props.assetType))
    if (!providers.value.some(provider => provider.id === selectedProvider.value)) {
      const savedProvider = props.data?.seedanceQuickAsset?.providerType
      selectedProvider.value = [savedProvider, result.activeProvider].find(id => providers.value.some(provider => provider.id === id)) || providers.value[0]?.id || ''
    }
  } finally { loadingProviders.value = false }
}

async function getProvider() {
  const selected = selectedProvider.value
  await loadProviders()
  if (selected && !providers.value.some(provider => provider.id === selected)) throw new Error('所选素材渠道已停用，请重新选择')
  if (!selectedProvider.value) throw new Error('暂无支持此素材的启用渠道，请联系管理员配置')
  return selectedProvider.value
}
const queryFailed = computed(() => status.value === 'processing' && !!props.data?.seedanceQuickAsset?.error)
const buttonText = computed(() => {
  if (submitting.value) return '提交中'
  if (queryFailed.value) return '查询失败，重试'
  return { approved: '已过审', processing: '审核中', failed: '审核失败，重试', expired: '已失效，重审' }[status.value] || '过审'
})
const controller = createSeedanceReviewController({
  getData: () => canvasStore.nodes.find(node => node.id === props.nodeId)?.data,
  getSourceUrl: () => getSeedanceSourceUrl(props.data, props.assetType),
  assetType: props.assetType,
  nodeId: props.nodeId,
  update: partial => canvasStore.updateNodeData(props.nodeId, { seedanceQuickAsset: { ...props.data?.seedanceQuickAsset, ...partial } }),
  resolveUrl: url => resolveSeedanceMediaUrl(url, props.assetType),
  getProvider,
  create: body => createQuickSeedanceCharacterAsset({ ...body, ...teamStore.getSpaceParams('current') }),
  poll: pollAssetStatus,
  notify: showToast
})

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try { await controller.submit() } finally { submitting.value = false }
}

function providerDisabled(providerId) {
  const savedProvider = props.data?.seedanceQuickAsset?.providerType
  return submitting.value || loadingProviders.value || (providerId === savedProvider && (status.value === 'approved' || (status.value === 'processing' && !queryFailed.value)))
}

async function handleReviewClick() {
  if (submitting.value || loadingProviders.value) return
  if (providers.value.length > 1) {
    menuOpen.value = !menuOpen.value
    return
  }
  if (!providerDisabled(selectedProvider.value)) await submit()
}

async function submitToProvider(providerId) {
  if (providerDisabled(providerId) || !providers.value.some(provider => provider.id === providerId)) return
  selectedProvider.value = providerId
  menuOpen.value = false
  reviewButton.value?.focus()
  await submit()
}

function closeMenu() {
  menuOpen.value = false
  reviewButton.value?.focus()
}

watch(() => props.data?.seedanceQuickAsset?.assetId, () => controller.resume(), { immediate: true })
onMounted(() => { if (enabled.value) loadProviders().catch(() => {}) })
onUnmounted(() => controller.dispose())
</script>

<template>
  <span v-if="enabled" ref="reviewControl" class="seedance-review-control nodrag" @mousedown.stop @keydown.stop @keydown.esc.prevent="closeMenu" @focusout="!reviewControl?.contains($event.relatedTarget) && (menuOpen = false)">
  <button
    ref="reviewButton"
    type="button"
    class="toolbar-btn seedance-review-btn nodrag"
    :class="{ active: status === 'approved', 'is-failed': status === 'failed' || queryFailed }"
    :disabled="submitting || loadingProviders || (providers.length <= 1 && providerDisabled(selectedProvider))"
    :aria-haspopup="providers.length > 1 ? 'menu' : undefined"
    :aria-expanded="providers.length > 1 ? menuOpen : undefined"
    :title="data?.seedanceQuickAsset?.error || '提交 Seedance 素材审核，审核通过后可连接 Seedance 视频节点使用'"
    @mousedown.stop.prevent
    @click.stop.prevent="handleReviewClick"
  >
    <svg v-if="submitting || (status === 'processing' && !queryFailed)" class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 3l7 4v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V7l7-4z" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M9 12l2 2 4-5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span>{{ providers.length > 1 && !submitting ? '过审' : buttonText }}</span>
    <svg v-if="providers.length > 1" class="review-dropdown-arrow" :class="{ open: menuOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
  <span v-if="menuOpen && providers.length > 1" class="seedance-review-menu nowheel" role="menu" aria-label="素材审核渠道" @click.stop @wheel.stop>
    <button v-for="provider in providers" :key="provider.id" type="button" role="menuitem" class="seedance-review-menu-item" :disabled="providerDisabled(provider.id)" @click.stop.prevent="submitToProvider(provider.id)">
      <span>{{ provider.label }}</span>
      <span v-if="provider.id === data?.seedanceQuickAsset?.providerType" class="review-provider-status">{{ buttonText }}</span>
    </button>
  </span>
  </span>
</template>

<style scoped>
.seedance-review-control { position: relative; display: inline-flex; align-items: center; }
.seedance-review-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border: none; border-radius: 6px; background: transparent; color: var(--canvas-text-secondary); font-size: 12px; white-space: nowrap; cursor: pointer; }
.seedance-review-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
.seedance-review-btn:hover { color: var(--canvas-text-primary); background: var(--canvas-bg-tertiary); }
.seedance-review-btn.active { color: var(--canvas-accent-success); }
.seedance-review-btn.is-failed { color: var(--canvas-accent-error); }
.seedance-review-btn:disabled { cursor: default; }
.seedance-review-btn .review-dropdown-arrow { width: 12px; height: 12px; opacity: 0.7; transition: transform 0.15s ease; }
.review-dropdown-arrow.open { transform: rotate(180deg); }
.seedance-review-menu { position: absolute; top: calc(100% + 8px); left: 0; z-index: 9999; display: flex; flex-direction: column; gap: 2px; min-width: 180px; padding: 6px; border: 1px solid var(--canvas-border-default); border-radius: 12px; background: var(--canvas-bg-elevated); box-shadow: var(--canvas-shadow-lg); }
.seedance-review-menu-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 8px 10px; border: none; border-radius: 8px; background: transparent; color: var(--canvas-text-secondary); font-size: 12px; white-space: nowrap; text-align: left; cursor: pointer; }
.seedance-review-menu-item:hover:not(:disabled) { color: var(--canvas-text-primary); background: var(--canvas-bg-tertiary); }
.seedance-review-menu-item:disabled { opacity: 0.6; cursor: default; }
.review-provider-status { font-size: 11px; color: var(--canvas-text-tertiary); }
.seedance-review-btn:focus-visible, .seedance-review-menu-item:focus-visible { outline: 2px solid var(--canvas-accent-primary); outline-offset: 2px; }
</style>
