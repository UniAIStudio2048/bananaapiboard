<script setup>
import { useVueFlow } from '@vue-flow/core'
import { formatBreakdownTime } from '@/utils/videoBreakdown'
defineProps({ reference: { type: Object, required: true } })
const { fitView } = useVueFlow()
</script>

<template>
  <details class="breakdown-reference nodrag nopan" @mousedown.stop @click.stop>
    <summary>源片 {{ formatBreakdownTime(reference.time ?? reference.start) }}<span v-if="reference.time == null">–{{ formatBreakdownTime(reference.end) }}</span> · 分析详情</summary>
    <div class="reference-body">
      <p>{{ reference.description || '暂无补充说明' }}</p>
      <button @click="fitView({ nodes: [reference.sourceNodeId], duration: 300, padding: 0.6 })">定位源视频 ↗</button>
    </div>
  </details>
</template>

<style scoped>
.breakdown-reference{position:absolute;top:calc(100% + 5px);left:0;right:0;color:#aaa;font-size:11px;line-height:1.5;z-index:12}.breakdown-reference summary{cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.breakdown-reference[open]{z-index:100}.reference-body{padding:12px;border:1px solid #555;border-radius:9px;background:#242424;color:#ddd;box-shadow:0 8px 24px #0006;max-height:200px;overflow:auto}.reference-body p{white-space:pre-wrap;margin:0 0 10px}.reference-body button{color:#a8d6e2;background:transparent;border:0;padding:0;cursor:pointer}
</style>
