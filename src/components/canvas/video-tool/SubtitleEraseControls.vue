<template>
  <label class="subtitle-erase-controls">
    <span>{{ translateUi('uiMessages.m730eff0a1b31') }}</span>
    <select :value="mode" @change="$emit('update:mode', $event.target.value)">
      <optgroup :label="translateUi('user.ledgerType.subtitle_erase')">
        <option value="subtitle_all_area">{{ translateUi('uiMessages.m94ecd6ccc205') }}</option>
        <option value="subtitle_sel_area">{{ translateUi('uiMessages.m3aac65393e9d') }}</option>
      </optgroup>
      <optgroup :label="translateUi('uiMessages.mb47b5d585533')">
        <option value="watermark_all_area">{{ translateUi('uiMessages.m38c8454ea9c7') }}</option>
        <option value="watermark_sel_area">{{ translateUi('uiMessages.mdc389c05c626') }}</option>
      </optgroup>
    </select>
  </label>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

defineProps({
  mode: {
    type: String,
    default: 'subtitle_all_area'
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
