<script setup>
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { getWorkflowShareNodePreview } from '@/utils/workflowSharePreview'

const props = defineProps({
  id: { type: String, default: '' },
  data: { type: Object, default: () => ({}) }
})

const failedMedia = ref(new Set())
const preview = computed(() => getWorkflowShareNodePreview({ id: props.id, data: props.data }))
const textLabels = {
  prompt: '提示词',
  positivePrompt: '正向提示词',
  negativePrompt: '反向提示词',
  text: '文本',
  content: '内容',
  description: '描述',
  inputText: '输入文本',
  systemPrompt: '系统提示词',
  userPrompt: '用户提示词',
  script: '脚本',
  lyrics: '歌词'
}

function getTextLabel(fieldName) {
  return textLabels[fieldName] || fieldName
}

function markMediaFailed(url) {
  failedMedia.value = new Set([...failedMedia.value, url])
}

function isMediaVisible(media) {
  return media.safe && !failedMedia.value.has(media.url)
}
</script>

<template>
  <article class="workflow-share-node">
    <Handle type="target" :position="Position.Left" class="workflow-share-handle" />
    <header class="workflow-share-node-header">
      <div class="workflow-share-node-title">{{ preview.title }}</div>
      <span class="workflow-share-node-type">{{ preview.type }}</span>
    </header>

    <div class="workflow-share-node-body">
      <section v-for="section in preview.textSections" :key="`${section.label}-${section.value}`" class="workflow-share-node-section">
        <h3>{{ getTextLabel(section.label) }}</h3>
        <p>{{ section.value }}</p>
      </section>

      <section v-for="media in preview.media" :key="`${media.kind}-${media.url}`" class="workflow-share-node-media">
        <template v-if="isMediaVisible(media)">
          <img
            v-if="media.kind === 'image'"
            :src="media.url"
            :alt="`${preview.title} 媒体`"
            loading="lazy"
            @error="markMediaFailed(media.url)"
          />
          <video
            v-else-if="media.kind === 'video'"
            :src="media.url"
            controls
            preload="metadata"
            @error="markMediaFailed(media.url)"
          ></video>
          <audio
            v-else
            :src="media.url"
            controls
            preload="metadata"
            @error="markMediaFailed(media.url)"
          ></audio>
        </template>
        <div v-else class="workflow-share-media-placeholder">媒体仅在原工作区可用</div>
      </section>

      <details v-if="preview.parameterJson" class="workflow-share-node-details">
        <summary>公开参数与结果</summary>
        <pre>{{ preview.parameterJson }}</pre>
      </details>

      <p v-if="preview.textSections.length === 0 && preview.media.length === 0" class="workflow-share-node-empty">
        只读节点，无可公开展示的详情
      </p>
    </div>
    <Handle type="source" :position="Position.Right" class="workflow-share-handle" />
  </article>
</template>

<style scoped>
.workflow-share-node {
  width: 360px;
  max-width: min(460px, 62vw);
  overflow: hidden;
  color: #f5f5f5;
  background: rgba(24, 24, 24, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
}

.workflow-share-node-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 14px; background: rgba(255, 255, 255, 0.06); border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.workflow-share-node-title { min-width: 0; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.workflow-share-node-type { flex-shrink: 0; max-width: 42%; padding: 3px 6px; color: #a3a3a3; background: rgba(255, 255, 255, 0.08); border-radius: 5px; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.workflow-share-node-body { display: grid; gap: 12px; padding: 13px 14px 14px; }
.workflow-share-node-section { display: grid; gap: 5px; }
.workflow-share-node-section h3 { margin: 0; color: #a3a3a3; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
.workflow-share-node-section p { margin: 0; color: #e5e5e5; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.workflow-share-node-media { overflow: hidden; background: rgba(0, 0, 0, 0.24); border-radius: 8px; }
.workflow-share-node-media img,
.workflow-share-node-media video { display: block; width: 100%; max-height: 360px; object-fit: contain; }
.workflow-share-node-media audio { display: block; width: calc(100% - 16px); margin: 8px; }
.workflow-share-media-placeholder { display: grid; min-height: 72px; place-items: center; padding: 12px; color: #a3a3a3; font-size: 12px; text-align: center; }
.workflow-share-node-details { overflow: hidden; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.workflow-share-node-details summary { padding-top: 2px; color: #a3a3a3; font-size: 11px; cursor: pointer; }
.workflow-share-node-details pre { margin: 8px 0 0; color: #d4d4d4; font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.workflow-share-node-empty { margin: 0; color: #a3a3a3; font-size: 12px; line-height: 1.5; }
.workflow-share-handle { width: 8px; height: 8px; background: #d4d4d4; border: 2px solid #171717; }
</style>
