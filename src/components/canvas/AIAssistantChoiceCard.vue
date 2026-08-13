<template>
  <div class="ai-message-choices" :class="{ 'is-locked': choiceLocked }">
    <p v-if="choices.question" class="ai-message-choices__question">{{ choices.question }}</p>
    <div class="ai-message-choices__grid">
      <button
        v-for="option in choices.options"
        :key="`${option.value}:${option.label}`"
        type="button"
        class="ai-message-choice"
        :class="{ selected: selectedChoiceValue === option.value }"
        :disabled="choiceLocked"
        @click="selectChoice(option)"
      >
        <span class="ai-message-choice__value">{{ option.value }}</span>
        <span class="ai-message-choice__label">{{ option.label }}</span>
      </button>
    </div>
    <form v-if="choices.allowInput" class="ai-message-choice-input" @submit.prevent="submitChoiceInput">
      <input v-model="choiceInput" type="text" :placeholder="choices.inputPlaceholder" :disabled="choiceLocked" aria-label="自定义回复" />
      <button type="submit" :disabled="choiceLocked || !choiceInput.trim()">发送</button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 选择卡片独立子组件：选中/输入状态内聚在此，选项选择时只重渲染本卡片，
// 不再触发整条 AI 消息的 markdown 重渲染（性能优化，Task：选择卡片渲染性能）。
const props = defineProps({
  choices: { type: Object, required: true },
})
const emit = defineEmits(['select'])

const choiceInput = ref('')
const selectedChoiceValue = ref('')
const choiceLocked = computed(() => Boolean(selectedChoiceValue.value))

function selectChoice(option) {
  if (choiceLocked.value || !option?.value) return
  selectedChoiceValue.value = option.value
  emit('select', option.value)
}

function submitChoiceInput() {
  const value = choiceInput.value.trim()
  if (!value || choiceLocked.value) return
  selectedChoiceValue.value = value
  choiceInput.value = ''
  emit('select', value)
}
</script>

<style scoped>
.ai-message-choices {
  margin-top: 10px;
}

.ai-message-choices__question {
  margin: 0 0 8px;
  color: var(--ai-message-muted, #a1a1aa);
  font-size: 12px;
}

.ai-message-choices__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.ai-message-choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--ai-message-border, rgba(255, 255, 255, 0.16));
  border-radius: 10px;
  background: var(--ai-message-list-bg, rgba(255, 255, 255, 0.04));
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ai-message-choice:hover:not(:disabled),
.ai-message-choice.selected {
  border-color: var(--ai-message-choice-active, #a1a1aa);
  background: var(--ai-message-choice-active-bg, rgba(255, 255, 255, 0.1));
}

.ai-message-choice:disabled {
  cursor: default;
  opacity: 0.58;
}

.ai-message-choice__value {
  flex: 0 0 auto;
  color: var(--ai-message-muted, #a1a1aa);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.ai-message-choice__label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ai-message-choice-input {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.ai-message-choice-input input {
  min-width: 0;
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--ai-message-border, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

.ai-message-choice-input button {
  padding: 0 12px;
  border: 1px solid var(--ai-message-border, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.ai-message-choice-input button:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>
