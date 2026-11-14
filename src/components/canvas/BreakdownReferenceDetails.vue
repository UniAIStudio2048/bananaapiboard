<script setup>
import { t as translateUi } from '@/i18n'

import { useVueFlow } from '@vue-flow/core'
import { formatBreakdownTime } from '@/utils/videoBreakdown'
defineProps({ reference: { type: Object, required: true } })
const { fitView } = useVueFlow()
</script>

<template>
  <details class="breakdown-reference nodrag nopan" @mousedown.stop @click.stop>
    <summary>{{ translateUi('uiMessages.m2c49ab0fd91f', { value1: (formatBreakdownTime(reference.time ?? reference.start)) }) }}<span v-if="reference.time == null">–{{ formatBreakdownTime(reference.end) }}</span> {{ translateUi('uiMessages.m668a8a770ecc') }}</summary>
    <div class="reference-body">
      <p>{{ reference.description || translateUi('uiMessages.m4ddb66e41719') }}</p>
      <button @click="fitView({ nodes: [reference.sourceNodeId], duration: 300, padding: 0.6 })">{{ translateUi('uiMessages.m6979c2d752d4') }}</button>
    </div>
  </details>
</template>

<style scoped>
.breakdown-reference{position:absolute;top:calc(100% + 5px);left:0;right:0;color:#aaa;font-size:11px;line-height:1.5;z-index:12}.breakdown-reference summary{cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.breakdown-reference[open]{z-index:100}.reference-body{padding:12px;border:1px solid #555;border-radius:9px;background:#242424;color:#ddd;box-shadow:0 8px 24px #0006;max-height:200px;overflow:auto}.reference-body p{white-space:pre-wrap;margin:0 0 10px}.reference-body button{color:#a8d6e2;background:transparent;border:0;padding:0;cursor:pointer}
:root.canvas-theme-light .breakdown-reference{color:#777}:root.canvas-theme-light .reference-body{border-color:#dedede;background:#fff;color:#303030;box-shadow:0 8px 24px rgba(0,0,0,.12)}:root.canvas-theme-light .reference-body button{color:#171717}
</style>
