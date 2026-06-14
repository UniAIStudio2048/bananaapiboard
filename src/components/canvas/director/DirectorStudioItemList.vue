<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedItemId: { type: String, default: null }
})

const emit = defineEmits(['select-item'])

const visibleItems = computed(() => (
  Array.isArray(props.items)
    ? props.items.filter(item => item && item.id != null)
    : []
))

function itemLabel(item, index) {
  return item.label || item.title || item.name || item.id || `Item ${index + 1}`
}

function itemCategory(item) {
  return item.category || item.itemCategory || 'object'
}
</script>

<template>
  <section class="director-item-list">
    <div class="director-item-list-heading">
      <div>
        <span>Items</span>
        <strong>{{ visibleItems.length }}</strong>
      </div>
    </div>

    <div class="director-item-list-body">
      <button
        v-for="(item, index) in visibleItems"
        :key="String(item.id)"
        type="button"
        class="director-item-row"
        :class="{ active: String(item.id) === selectedItemId }"
        @click="emit('select-item', String(item.id))"
      >
        <span class="director-item-swatch" :style="{ backgroundColor: item.color || '#38bdf8' }" />
        <span class="director-item-main">
          <strong>{{ itemLabel(item, index) }}</strong>
          <small>{{ itemCategory(item) }}</small>
        </span>
      </button>
      <div v-if="visibleItems.length === 0" class="director-empty-row">No items</div>
    </div>
  </section>
</template>

<style scoped>
.director-item-list {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-item-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.director-item-list-heading div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.director-item-list-heading span {
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  text-transform: uppercase;
}

.director-item-list-heading strong {
  color: #f4f4f5;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.director-item-list-body {
  display: grid;
  max-height: 170px;
  gap: 5px;
  overflow: auto;
}

.director-item-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #111418;
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.director-item-row:hover {
  border-color: rgba(34, 211, 238, 0.28);
  background: #171b20;
}

.director-item-row.active {
  border-color: rgba(34, 211, 238, 0.5);
  background: rgba(8, 145, 178, 0.2);
}

.director-item-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.director-item-main {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.director-item-main strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-item-main small,
.director-empty-row {
  color: #8b949e;
  font-size: 10px;
  line-height: 1.15;
}

.director-empty-row {
  padding: 8px;
}
</style>
