<template>
  <label class="subtitle-erase-controls">
    <span>擦除模式</span>
    <select :value="mode" @change="$emit('update:mode', $event.target.value)">
      <option value="standard">标准擦除</option>
      <option value="fine">精细擦除</option>
    </select>
  </label>
</template>

<script setup>
defineProps({
  mode: {
    type: String,
    default: 'standard'
  }
})

defineEmits(['update:mode'])
</script>

<style scoped>
.subtitle-erase-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #d4d4d4;
  font-size: 13px;
}

.subtitle-erase-controls select {
  min-width: 128px;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  background: #0f0f10;
  color: #f5f5f5;
  padding: 8px 28px 8px 10px;
  outline: none;
}

.subtitle-erase-controls select:focus {
  border-color: #fafafa;
}
</style>
