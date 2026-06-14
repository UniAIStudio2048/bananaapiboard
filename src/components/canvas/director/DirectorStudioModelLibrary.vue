<script setup>
import { computed, ref } from 'vue'
import { Box, Move3D } from '@lucide/vue'
import { useDirectorStudioI18n } from './useDirectorStudioI18n.js'

const props = defineProps({
  categories: { type: Array, default: () => [] },
  models: { type: Array, default: () => [] },
  highlighted: { type: Boolean, default: false }
})

const emit = defineEmits(['add-model', 'add-pedestrian'])

const activeCategoryId = ref('basic')
const searchTerm = ref('')
const pedestrianMode = ref('single')
const pedestrianCount = ref(6)
const pedestrianColumns = ref(3)
const pedestrianSpacingX = ref(1.2)
const pedestrianSpacingZ = ref(1.2)
const pedestrianRadius = ref(3)
const { dt } = useDirectorStudioI18n()

const filteredModels = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()
  return props.models.filter(model => {
    if (model.categoryId !== activeCategoryId.value) return false
    if (!query) return true
    return [
      model.displayName,
      model.labelBase,
      model.presetId,
      model.visualId
    ].some(value => String(value || '').toLowerCase().includes(query))
  })
})

function clampInteger(value, fallback, min, max) {
  const numeric = Number.parseInt(value, 10)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function addPedestrians() {
  emit('add-pedestrian', {
    mode: pedestrianMode.value,
    count: pedestrianMode.value === 'single' ? 1 : clampInteger(pedestrianCount.value, 6, 1, 80),
    columns: clampInteger(pedestrianColumns.value, 3, 1, 20),
    spacingX: clampNumber(pedestrianSpacingX.value, 1.2, 0.2, 10),
    spacingZ: clampNumber(pedestrianSpacingZ.value, 1.2, 0.2, 10),
    radius: clampNumber(pedestrianRadius.value, 3, 0.2, 30)
  })
}
</script>

<template>
  <section class="director-model-library" :class="{ highlighted }">
    <div class="director-panel-heading">
      <div>
        <span>{{ dt('modelLibrary.title', '模型库') }}</span>
        <strong>{{ filteredModels.length }}</strong>
      </div>
      <Box :size="16" stroke-width="2" />
    </div>

    <input
      v-model="searchTerm"
      class="director-library-search"
      type="search"
      :placeholder="dt('modelLibrary.searchPlaceholder', '搜索模型')"
      autocomplete="off"
    >

    <div class="director-category-tabs" :aria-label="dt('modelLibrary.categoriesLabel', '模型分类')">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        :class="{ active: category.id === activeCategoryId }"
        @click="activeCategoryId = category.id"
      >
        {{ dt(category.labelKey, category.id) }}
      </button>
    </div>

    <div class="director-model-list">
      <button
        v-for="model in filteredModels"
        :key="model.id"
        type="button"
        class="director-model-row"
        @click="emit('add-model', model)"
      >
        <span class="director-model-swatch" :style="{ backgroundColor: model.color || '#38bdf8' }" />
        <span class="director-model-main">
          <strong>{{ model.displayName }}</strong>
          <small>{{ model.presetId }}</small>
        </span>
      </button>
      <div v-if="filteredModels.length === 0" class="director-empty-row">{{ dt('modelLibrary.empty', '暂无模型') }}</div>
    </div>

    <div class="director-pedestrian-panel">
      <div class="director-pedestrian-heading">
        <Move3D :size="14" stroke-width="2" />
        <span>{{ dt('modelLibrary.pedestrians', '行人') }}</span>
      </div>

      <div class="director-field-row">
        <label>{{ dt('modelLibrary.mode', '模式') }}</label>
        <select v-model="pedestrianMode">
          <option value="single">{{ dt('modelLibrary.modes.single', '单人') }}</option>
          <option value="array">{{ dt('modelLibrary.modes.array', '阵列') }}</option>
          <option value="random">{{ dt('modelLibrary.modes.random', '随机') }}</option>
        </select>
      </div>

      <div v-if="pedestrianMode !== 'single'" class="director-field-grid">
        <label>
          <span>{{ dt('modelLibrary.count', '数量') }}</span>
          <input v-model.number="pedestrianCount" type="number" min="1" max="80" step="1">
        </label>
        <label v-if="pedestrianMode === 'array'">
          <span>{{ dt('modelLibrary.columns', '列数') }}</span>
          <input v-model.number="pedestrianColumns" type="number" min="1" max="20" step="1">
        </label>
        <label v-if="pedestrianMode === 'array'">
          <span>{{ dt('modelLibrary.xSpacing', 'X 间距') }}</span>
          <input v-model.number="pedestrianSpacingX" type="number" min="0.2" max="10" step="0.1">
        </label>
        <label v-if="pedestrianMode === 'array'">
          <span>{{ dt('modelLibrary.zSpacing', 'Z 间距') }}</span>
          <input v-model.number="pedestrianSpacingZ" type="number" min="0.2" max="10" step="0.1">
        </label>
        <label v-if="pedestrianMode === 'random'">
          <span>{{ dt('modelLibrary.radius', '半径') }}</span>
          <input v-model.number="pedestrianRadius" type="number" min="0.2" max="30" step="0.1">
        </label>
      </div>

      <button type="button" class="director-add-pedestrians" @click="addPedestrians">
        {{ dt('modelLibrary.addPedestrians', '添加行人') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.director-model-library {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-model-library.highlighted {
  box-shadow: inset 2px 0 0 rgba(34, 211, 238, 0.82);
}

.director-panel-heading,
.director-pedestrian-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.director-panel-heading div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.director-panel-heading span,
.director-pedestrian-heading span {
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  text-transform: uppercase;
}

.director-panel-heading strong {
  color: #f4f4f5;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.director-panel-heading svg,
.director-pedestrian-heading svg {
  color: #67e8f9;
}

.director-library-search,
.director-field-row select,
.director-field-grid input {
  width: 100%;
  min-height: var(--director-control-height, 34px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #0f1114;
  color: #e5e7eb;
  font-size: 12px;
  line-height: var(--director-control-line-height, 1.35);
}

.director-library-search {
  padding: 0 8px;
}

.director-category-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.director-category-tabs button {
  min-height: 32px;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: #171a1f;
  color: #a1a1aa;
  font-size: 11px;
  line-height: var(--director-control-line-height, 1.35);
  cursor: pointer;
}

.director-category-tabs button.active {
  border-color: rgba(34, 211, 238, 0.42);
  background: rgba(8, 145, 178, 0.2);
  color: #a5f3fc;
}

.director-model-list {
  display: grid;
  max-height: 210px;
  gap: 5px;
  overflow: auto;
}

.director-model-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #111418;
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.director-model-row:hover {
  border-color: rgba(34, 211, 238, 0.28);
  background: #171b20;
}

.director-model-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.director-model-main {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.director-model-main strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-model-main small,
.director-empty-row {
  color: #8b949e;
  font-size: 10px;
  line-height: 1.15;
}

.director-empty-row {
  padding: 8px;
}

.director-pedestrian-panel {
  display: grid;
  gap: 7px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.director-field-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.director-field-row label,
.director-field-grid span {
  color: #a1a1aa;
  font-size: 11px;
}

.director-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.director-field-grid label {
  display: grid;
  gap: 3px;
}

.director-field-grid input {
  padding: 0 6px;
}

.director-add-pedestrians {
  min-height: var(--director-control-height, 34px);
  border: 1px solid rgba(34, 197, 94, 0.28);
  border-radius: 7px;
  background: rgba(21, 128, 61, 0.22);
  color: #bbf7d0;
  font-size: 12px;
  font-weight: 700;
  line-height: var(--director-control-line-height, 1.35);
  cursor: pointer;
}

.director-add-pedestrians:hover {
  background: rgba(21, 128, 61, 0.32);
}
</style>
