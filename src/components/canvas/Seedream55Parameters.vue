<script setup>
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
    <summary>Seedream 5.5 参数</summary>
    <div class="seedream55-fields">
      <label>尺寸方式<select :value="options.sizeMode" @change="update('sizeMode', $event.target.value)"><option value="resolution">分辨率档位</option><option value="custom">自定义像素</option></select></label>
      <template v-if="options.sizeMode === 'custom'">
        <label>宽度<input type="number" min="240" max="8595" :value="options.width" @input="update('width', Number($event.target.value))"></label>
        <label>高度<input type="number" min="240" max="8595" :value="options.height" @input="update('height', Number($event.target.value))"></label>
        <small>总像素 921600–4624220，宽高比 1:16–16:1</small>
      </template>
      <label>输出格式<select :value="options.outputFormat" @change="update('outputFormat', $event.target.value)"><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
      <label>背景<select :value="options.background" @change="update('background', $event.target.value)"><option value="auto">自动</option><option value="transparent" :disabled="options.outputFormat === 'jpeg'">透明</option><option value="opaque">不透明</option></select></label>
      <label>水印<input type="checkbox" :checked="options.watermark" @change="update('watermark', $event.target.checked)"></label>
      <label>用户标识<input maxlength="64" placeholder="可选英文标识" :value="options.safetyIdentifier" @input="update('safetyIdentifier', $event.target.value)"></label>
      <small>提示词优化：standard。单张输出，最多 10 张参考图。</small>
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
