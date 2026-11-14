<script setup>
import { t as translateUi } from '@/i18n'

import { computed } from 'vue'
const props = defineProps({ modelValue: { type: Object, default: () => ({}) } })
const emit = defineEmits(['update:modelValue'])
const options = computed(() => ({ sizeMode: 'resolution', width: 1024, height: 1024, outputFormat: 'png', background: 'auto', watermark: false, safetyIdentifier: '', ...props.modelValue }))
function update(key, value) {
  emit('update:modelValue', { ...options.value, [key]: value })
}
</script>

<template>
  <details class="seedream55-parameters nodrag nowheel" @click.stop @wheel.stop>
    <summary>{{ translateUi('uiMessages.mc103f6517087') }}</summary>
    <div class="seedream55-fields">
      <label>{{ translateUi('uiMessages.ma4e90de473a2') }}<select :value="options.sizeMode" @change="update('sizeMode', $event.target.value)"><option value="resolution">{{ translateUi('uiMessages.m0ab4860aeea3') }}</option><option value="custom">{{ translateUi('uiMessages.ma69135eaa354') }}</option></select></label>
      <template v-if="options.sizeMode === 'custom'">
        <label>{{ translateUi('uiMessages.m3b730da0ad1a') }}<input type="number" min="240" max="8595" :value="options.width" @input="update('width', Number($event.target.value))"></label>
        <label>{{ translateUi('uiMessages.m968dd036cbb1') }}<input type="number" min="240" max="8595" :value="options.height" @input="update('height', Number($event.target.value))"></label>
        <small>{{ translateUi('uiMessages.m047ef55c00d4') }}</small>
      </template>
      <label>{{ translateUi('uiMessages.m41d0e52f0a91') }}<select :value="options.outputFormat" @change="update('outputFormat', $event.target.value)"><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
      <label>{{ translateUi('uiMessages.mf4b669c55756') }}<select :value="options.background" @change="update('background', $event.target.value)"><option value="auto">{{ translateUi('imageGen.auto') }}</option><option value="transparent" :disabled="options.outputFormat === 'jpeg'">{{ translateUi('uiMessages.m9dddd9f908b2') }}</option><option value="opaque">{{ translateUi('uiMessages.m1bc0b872e7fd') }}</option></select></label>
      <label>{{ translateUi('uiMessages.maa9f217c8186') }}<input type="checkbox" :checked="options.watermark" @change="update('watermark', $event.target.checked)"></label>
      <label>{{ translateUi('uiMessages.mcf434320708a') }}<input maxlength="64" :placeholder="translateUi('uiMessages.m5005c20db8e1')" :value="options.safetyIdentifier" @input="update('safetyIdentifier', $event.target.value)"></label>
      <small>{{ translateUi('uiMessages.ma53e6e29fb73') }}</small>
    </div>
  </details>
</template>

<style scoped>
.seedream55-parameters { position: relative; color: inherit; font-size: 13px; }
summary { cursor: pointer; padding: 6px 8px; border: 1px solid var(--canvas-border-default); border-radius: 6px; }
.seedream55-fields { position: absolute; bottom: 100%; right: 0; z-index: 20; width: 260px; display: grid; gap: 8px; padding: 12px; background: var(--canvas-bg-elevated); color: var(--canvas-text-primary); border: 1px solid var(--canvas-border-default); border-radius: 8px; box-shadow: var(--canvas-shadow-lg); }
label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
select, input { max-width: 150px; padding: 4px; background: transparent; color: inherit; border: 1px solid #8886; border-radius: 4px; }
select option { color: var(--canvas-text-primary); background: var(--canvas-bg-elevated); }
summary:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--canvas-text-primary); outline-offset: 2px; }
small { opacity: .7; }

</style>
