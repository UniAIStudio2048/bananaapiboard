<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import { isSeedanceFeaturesEnabled } from '@/config/tenant'
import { showToast } from '@/composables/useCanvasDialog'
import { createQuickSeedanceCharacterAsset, listAssetGroups, pollAssetStatus } from '@/api/canvas/volcengine-assets'
import { resolveSeedanceMediaUrl } from '@/api/canvas/seedance-media-upload'
import { getSeedanceSourceUrl } from '@/utils/seedanceMedia'
import { getSeedanceQuickAssetStatus } from '@/utils/seedanceQuickAsset'
import { createSeedanceReviewController } from '@/utils/seedanceReviewController'

const props = defineProps({ nodeId: String, data: Object, assetType: { type: String, default: 'Image' } })
const canvasStore = useCanvasStore()
const teamStore = useTeamStore()
const enabled = computed(() => isSeedanceFeaturesEnabled())
const submitting = ref(false)
const status = computed(() => getSeedanceQuickAssetStatus(props.data))
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
  getProvider: async () => (await listAssetGroups({ pageSize: 1 })).activeProvider || '',
  create: body => createQuickSeedanceCharacterAsset({ ...body, ...teamStore.getSpaceParams('current') }),
  poll: pollAssetStatus,
  notify: showToast
})

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try { await controller.submit() } finally { submitting.value = false }
}

watch(() => props.data?.seedanceQuickAsset?.assetId, () => controller.resume(), { immediate: true })
onUnmounted(() => controller.dispose())
</script>

<template>
  <button
    v-if="enabled"
    class="toolbar-btn seedance-review-btn nodrag"
    :class="{ active: status === 'approved', 'is-failed': status === 'failed' || queryFailed }"
    :disabled="submitting || (status === 'processing' && !queryFailed) || status === 'approved'"
    :title="data?.seedanceQuickAsset?.error || '提交 Seedance 素材审核，审核通过后可连接 Seedance 视频节点使用'"
    @mousedown.stop.prevent
    @click.stop.prevent="submit"
  >
    <svg v-if="submitting || (status === 'processing' && !queryFailed)" class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 3l7 4v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V7l7-4z" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M9 12l2 2 4-5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span>{{ buttonText }}</span>
  </button>
</template>

<style scoped>
.seedance-review-btn { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: none; background: transparent; color: #86efac; font-size: 12px; white-space: nowrap; cursor: pointer; }
.seedance-review-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
.seedance-review-btn:hover { color: var(--canvas-text-primary); background: var(--canvas-bg-hover); }
.seedance-review-btn.active { color: #86efac; }
.seedance-review-btn.is-failed { color: #fca5a5; }
.seedance-review-btn:disabled { cursor: default; }
.seedance-review-btn:focus-visible { outline: 2px solid var(--canvas-accent-primary); outline-offset: 2px; }
</style>
