<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  Image,
  LocateFixed,
  MoreHorizontal,
  Music,
  Pencil,
  Search,
  Video,
  Workflow
} from '@lucide/vue'
import { useI18n } from '@/i18n'
import {
  buildCanvasDirectory,
  isCanvasDirectoryMoveAllowed
} from '@/utils/canvasDirectory'
import { toSameOriginUrl } from '@/utils/canvasThumbnail'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedNodeId: { type: String, default: null },
  selectedNodeIds: { type: Array, default: () => [] },
  workflowKey: { type: String, default: '' }
})

const emit = defineEmits([
  'select-locate',
  'locate',
  'rename',
  'duplicate',
  'download',
  'move-to-group'
])

const { t } = useI18n()
const panelRef = ref(null)
const renameInputRef = ref(null)
const searchQuery = ref('')
const expandedFolderIds = ref(new Set())
const knownFolderIds = ref(new Set())
const openMenuId = ref(null)
const editingId = ref(null)
const editingValue = ref('')
const draggedNodeId = ref(null)
const dropTargetId = ref(null)

const directory = computed(() => buildCanvasDirectory(props.nodes, { search: searchQuery.value }))
const visibleGroupIds = computed(() => new Set(
  props.nodes.filter(node => node?.type === 'group').map(node => node.id)
))
const selectedIds = computed(() => new Set([
  ...(props.selectedNodeIds || []),
  ...(props.selectedNodeId ? [props.selectedNodeId] : [])
]))
const draggedNode = computed(() => props.nodes.find(node => node.id === draggedNodeId.value) || null)

watch(() => props.workflowKey, () => {
  searchQuery.value = ''
  expandedFolderIds.value = new Set()
  knownFolderIds.value = new Set()
  openMenuId.value = null
  editingId.value = null
  editingValue.value = ''
  draggedNodeId.value = null
  dropTargetId.value = null
})

watch(() => directory.value.folders.map(folder => folder.id), folderIds => {
  const nextKnown = new Set(knownFolderIds.value)
  const nextExpanded = new Set(expandedFolderIds.value)
  for (const folderId of folderIds) {
    if (!nextKnown.has(folderId)) nextExpanded.add(folderId)
    nextKnown.add(folderId)
  }
  knownFolderIds.value = nextKnown
  expandedFolderIds.value = nextExpanded
}, { immediate: true })

function isSelected(nodeId) {
  return selectedIds.value.has(nodeId)
}

function isFolderExpanded(folderId) {
  return expandedFolderIds.value.has(folderId)
}

function toggleFolder(folderId) {
  const next = new Set(expandedFolderIds.value)
  if (next.has(folderId)) next.delete(folderId)
  else next.add(folderId)
  expandedFolderIds.value = next
}

function getRowIcon(type) {
  if (type?.includes('video')) return Video
  if (type?.includes('image') || type === 'grid-preview') return Image
  if (type?.includes('audio')) return Music
  if (type === 'text' || type === 'text-input' || type?.startsWith('llm')) return FileText
  return Workflow
}

function activateRow(nodeId) {
  if (editingId.value === nodeId) return
  openMenuId.value = null
  emit('select-locate', nodeId)
}

function locateRow(nodeId) {
  openMenuId.value = null
  emit('locate', nodeId)
}

function toggleMenu(nodeId) {
  openMenuId.value = openMenuId.value === nodeId ? null : nodeId
}

function setRenameInputRef(element) {
  if (element) renameInputRef.value = element
}

function startRename(item, isGroup = false) {
  openMenuId.value = null
  editingId.value = item.id
  editingValue.value = item.name
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function commitRename(item, isGroup = false) {
  if (editingId.value !== item.id) return
  const name = editingValue.value.trim()
  editingId.value = null
  editingValue.value = ''
  if (!name || name === item.name) return
  emit('rename', { nodeId: item.id, name, isGroup })
}

function cancelRename() {
  editingId.value = null
  editingValue.value = ''
}

function duplicateRow(nodeId) {
  openMenuId.value = null
  emit('duplicate', nodeId)
}

function downloadRow(nodeId) {
  openMenuId.value = null
  emit('download', nodeId)
}

function startDrag(event, nodeId) {
  const node = props.nodes.find(item => item.id === nodeId)
  if (!node || node.type === 'group') return
  draggedNodeId.value = nodeId
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', nodeId)
}

function setDropTarget(event, targetGroupId) {
  if (!draggedNode.value || !isCanvasDirectoryMoveAllowed(
    draggedNode.value,
    targetGroupId,
    visibleGroupIds.value
  )) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTargetId.value = targetGroupId || 'root'
}

function dropNode(event, targetGroupId) {
  event.preventDefault()
  const node = draggedNode.value
  if (node && isCanvasDirectoryMoveAllowed(node, targetGroupId, visibleGroupIds.value)) {
    emit('move-to-group', { nodeId: node.id, targetGroupId: targetGroupId || null })
  }
  clearDrag()
}

function clearDrag() {
  draggedNodeId.value = null
  dropTargetId.value = null
}

function handleDocumentPointerDown(event) {
  if (!panelRef.value?.contains(event.target)) {
    openMenuId.value = null
    cancelRename()
  }
}

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))
</script>

<template>
  <section ref="panelRef" class="canvas-directory-panel" @keydown.escape="openMenuId = null; cancelRename(); clearDrag()">
    <div class="directory-heading">
      <span>{{ t('canvas.assetPanel.directory.title') }}</span>
      <span class="directory-count">{{ directory.total }}</span>
    </div>

    <label class="directory-search">
      <Search :size="15" aria-hidden="true" />
      <input
        v-model="searchQuery"
        type="search"
        :placeholder="t('canvas.assetPanel.directory.searchPlaceholder')"
        :aria-label="t('canvas.assetPanel.directory.searchPlaceholder')"
      />
    </label>

    <div
      class="directory-list"
      :class="{ 'directory-drop-active': dropTargetId === 'root' }"
      @dragover.self="setDropTarget($event, null)"
      @drop.self="dropNode($event, null)"
    >
      <div
        v-if="draggedNodeId"
        class="directory-root-drop"
        :class="{ 'directory-drop-active': dropTargetId === 'root' }"
        @dragover="setDropTarget($event, null)"
        @dragleave="dropTargetId === 'root' && (dropTargetId = null)"
        @drop.stop="dropNode($event, null)"
      >
        {{ t('canvas.assetPanel.directory.root') }}
      </div>

      <div v-if="directory.total === 0 && directory.folders.length === 0" class="directory-empty">
        <Workflow :size="28" aria-hidden="true" />
        <span>{{ t('canvas.assetPanel.directory.empty') }}</span>
      </div>

      <div v-for="folder in directory.folders" :key="folder.id" class="directory-folder">
        <div
          class="directory-row directory-folder-row"
          :class="{
            'directory-row-selected': isSelected(folder.id),
            'directory-drop-active': dropTargetId === folder.id
          }"
          @dragover="setDropTarget($event, folder.id)"
          @dragleave="dropTargetId === folder.id && (dropTargetId = null)"
          @drop.stop="dropNode($event, folder.id)"
        >
          <button
            class="directory-row-main"
            type="button"
            :aria-expanded="isFolderExpanded(folder.id)"
            @click="toggleFolder(folder.id)"
          >
            <component :is="isFolderExpanded(folder.id) ? ChevronDown : ChevronRight" :size="15" aria-hidden="true" />
            <Folder :size="18" class="directory-folder-icon" aria-hidden="true" />
            <input
              v-if="editingId === folder.id"
              :ref="setRenameInputRef"
              v-model="editingValue"
              class="directory-rename-input"
              @click.stop
              @blur="commitRename(folder, true)"
              @keydown.enter.prevent="commitRename(folder, true)"
              @keydown.escape.prevent.stop="cancelRename"
            />
            <span v-else class="directory-row-label">{{ folder.name }}</span>
            <span class="directory-folder-count">{{ folder.children.length }}</span>
          </button>
          <button
            class="directory-icon-button directory-more-button"
            type="button"
            :aria-label="t('common.more')"
            :title="t('common.more')"
            @click.stop="toggleMenu(folder.id)"
          >
            <MoreHorizontal :size="16" aria-hidden="true" />
          </button>
          <button
            class="directory-icon-button"
            type="button"
            :aria-label="t('canvas.assetPanel.directory.locate')"
            :title="t('canvas.assetPanel.directory.locate')"
            @click.stop="locateRow(folder.id)"
          >
            <LocateFixed :size="15" aria-hidden="true" />
          </button>
          <div v-if="openMenuId === folder.id" class="directory-menu" @click.stop>
            <button type="button" @click="startRename(folder, true)">
              <Pencil :size="15" aria-hidden="true" />
              {{ t('canvas.assetPanel.directory.rename') }}
            </button>
          </div>
        </div>

        <div v-if="isFolderExpanded(folder.id)" class="directory-folder-children">
          <div
            v-for="row in folder.children"
            :key="row.id"
            class="directory-row directory-node-row"
            :class="{ 'directory-row-selected': isSelected(row.id) }"
            draggable="true"
            @dragstart="startDrag($event, row.id)"
            @dragend="clearDrag"
          >
            <button class="directory-row-main" type="button" @click="activateRow(row.id)">
              <span class="directory-indent" aria-hidden="true" />
              <span class="directory-thumbnail">
                <img v-if="row.mediaKind === 'image' && row.previewUrl" :src="toSameOriginUrl(row.previewUrl)" alt="" />
                <video v-else-if="row.mediaKind === 'video' && row.previewUrl" :src="toSameOriginUrl(row.previewUrl)" muted preload="metadata" />
                <component v-else :is="getRowIcon(row.type)" :size="16" aria-hidden="true" />
              </span>
              <input
                v-if="editingId === row.id"
                :ref="setRenameInputRef"
                v-model="editingValue"
                class="directory-rename-input"
                @click.stop
                @blur="commitRename(row)"
                @keydown.enter.prevent="commitRename(row)"
                @keydown.escape.prevent.stop="cancelRename"
              />
              <span v-else class="directory-row-label">{{ row.name }}</span>
            </button>
            <button
              class="directory-icon-button directory-more-button"
              type="button"
              :aria-label="t('common.more')"
              :title="t('common.more')"
              @click.stop="toggleMenu(row.id)"
            >
              <MoreHorizontal :size="16" aria-hidden="true" />
            </button>
            <button
              class="directory-icon-button"
              type="button"
              :aria-label="t('canvas.assetPanel.directory.locate')"
              :title="t('canvas.assetPanel.directory.locate')"
              @click.stop="locateRow(row.id)"
            >
              <LocateFixed :size="15" aria-hidden="true" />
            </button>
            <div v-if="openMenuId === row.id" class="directory-menu" @click.stop>
              <button type="button" @click="startRename(row)">
                <Pencil :size="15" aria-hidden="true" />
                {{ t('canvas.assetPanel.directory.rename') }}
              </button>
              <button type="button" @click="duplicateRow(row.id)">
                <Copy :size="15" aria-hidden="true" />
                {{ t('canvas.assetPanel.directory.duplicate') }}
              </button>
              <button type="button" :disabled="!row.downloadable" @click="downloadRow(row.id)">
                <Download :size="15" aria-hidden="true" />
                {{ t('canvas.assetPanel.directory.download') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-for="row in directory.root"
        :key="row.id"
        class="directory-row directory-node-row"
        :class="{ 'directory-row-selected': isSelected(row.id) }"
        draggable="true"
        @dragstart="startDrag($event, row.id)"
        @dragend="clearDrag"
      >
        <button class="directory-row-main" type="button" @click="activateRow(row.id)">
          <span class="directory-thumbnail">
            <img v-if="row.mediaKind === 'image' && row.previewUrl" :src="toSameOriginUrl(row.previewUrl)" alt="" />
            <video v-else-if="row.mediaKind === 'video' && row.previewUrl" :src="toSameOriginUrl(row.previewUrl)" muted preload="metadata" />
            <component v-else :is="getRowIcon(row.type)" :size="16" aria-hidden="true" />
          </span>
          <input
            v-if="editingId === row.id"
            :ref="setRenameInputRef"
            v-model="editingValue"
            class="directory-rename-input"
            @click.stop
            @blur="commitRename(row)"
            @keydown.enter.prevent="commitRename(row)"
            @keydown.escape.prevent.stop="cancelRename"
          />
          <span v-else class="directory-row-label">{{ row.name }}</span>
        </button>
        <button
          class="directory-icon-button directory-more-button"
          type="button"
          :aria-label="t('common.more')"
          :title="t('common.more')"
          @click.stop="toggleMenu(row.id)"
        >
          <MoreHorizontal :size="16" aria-hidden="true" />
        </button>
        <button
          class="directory-icon-button"
          type="button"
          :aria-label="t('canvas.assetPanel.directory.locate')"
          :title="t('canvas.assetPanel.directory.locate')"
          @click.stop="locateRow(row.id)"
        >
          <LocateFixed :size="15" aria-hidden="true" />
        </button>
        <div v-if="openMenuId === row.id" class="directory-menu" @click.stop>
          <button type="button" @click="startRename(row)">
            <Pencil :size="15" aria-hidden="true" />
            {{ t('canvas.assetPanel.directory.rename') }}
          </button>
          <button type="button" @click="duplicateRow(row.id)">
            <Copy :size="15" aria-hidden="true" />
            {{ t('canvas.assetPanel.directory.duplicate') }}
          </button>
          <button type="button" :disabled="!row.downloadable" @click="downloadRow(row.id)">
            <Download :size="15" aria-hidden="true" />
            {{ t('canvas.assetPanel.directory.download') }}
          </button>
        </div>
      </div>
    </div>

    <footer class="directory-footer">
      {{ t('canvas.assetPanel.directory.total', { count: directory.total }) }}
    </footer>
  </section>
</template>

<style scoped>
.canvas-directory-panel {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  color: #e5e7eb;
}

.directory-heading,
.directory-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #9ca3af;
  font-size: 12px;
}

.directory-heading {
  padding: 12px 14px 8px;
  font-weight: 600;
}

.directory-count {
  font-variant-numeric: tabular-nums;
}

.directory-search {
  display: flex;
  height: 34px;
  margin: 0 12px 8px;
  align-items: center;
  gap: 8px;
  border: 1px solid #343840;
  border-radius: 6px;
  padding: 0 10px;
  color: #737985;
  background: #202227;
}

.directory-search:focus-within {
  border-color: #4f7cff;
}

.directory-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: #e5e7eb;
  background: transparent;
  font-size: 12px;
}

.directory-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 8px;
}

.directory-root-drop {
  display: flex;
  height: 32px;
  margin: 2px 4px 6px;
  align-items: center;
  justify-content: center;
  border: 1px dashed #464b55;
  border-radius: 5px;
  color: #8d94a1;
  font-size: 11px;
}

.directory-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px 28px;
  min-height: 40px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  color: #cfd3da;
}

.directory-row:hover {
  background: #272a30;
}

.directory-row-selected {
  border-color: rgba(76, 124, 255, 0.5);
  background: rgba(65, 108, 232, 0.2);
  color: #f5f7ff;
}

.directory-row-selected:hover {
  background: rgba(65, 108, 232, 0.25);
}

.directory-drop-active {
  border-color: #5b8cff !important;
  background: rgba(65, 108, 232, 0.16) !important;
}

.directory-row-main {
  display: flex;
  min-width: 0;
  height: 38px;
  align-items: center;
  gap: 7px;
  border: 0;
  padding: 0 6px;
  color: inherit;
  background: transparent;
  text-align: left;
}

.directory-row-label {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-folder-icon {
  flex: none;
  color: #e2ad48;
}

.directory-folder-count {
  color: #747b87;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.directory-folder-children {
  position: relative;
  margin-left: 10px;
  padding-left: 5px;
  border-left: 1px solid #343840;
}

.directory-indent {
  width: 8px;
  flex: none;
}

.directory-thumbnail {
  display: flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #383c44;
  border-radius: 4px;
  color: #8d94a1;
  background: #181a1e;
}

.directory-thumbnail img,
.directory-thumbnail video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.directory-icon-button {
  display: flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  color: #777e8a;
  background: transparent;
}

.directory-icon-button:hover,
.directory-icon-button:focus-visible {
  color: #e6e9ef;
  background: #383c44;
}

.directory-more-button {
  opacity: 0;
}

.directory-row:hover .directory-more-button,
.directory-row:focus-within .directory-more-button,
.directory-row-selected .directory-more-button {
  opacity: 1;
}

.directory-menu {
  position: absolute;
  top: 34px;
  right: 30px;
  z-index: 20;
  width: 122px;
  overflow: hidden;
  border: 1px solid #40444d;
  border-radius: 6px;
  padding: 4px;
  background: #25282e;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
}

.directory-menu button {
  display: flex;
  width: 100%;
  height: 30px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 4px;
  padding: 0 8px;
  color: #d8dce3;
  background: transparent;
  font-size: 12px;
}

.directory-menu button:hover:not(:disabled) {
  background: #353942;
}

.directory-menu button:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.directory-rename-input {
  min-width: 0;
  height: 26px;
  flex: 1;
  border: 1px solid #5b8cff;
  border-radius: 4px;
  outline: 0;
  padding: 0 6px;
  color: #f5f7ff;
  background: #17191d;
  font-size: 12px;
}

.directory-empty {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #717783;
  font-size: 12px;
}

.directory-footer {
  min-height: 38px;
  justify-content: center;
  border-top: 1px solid #30333a;
  padding: 0 12px;
}

@media (max-width: 640px) {
  .directory-row {
    grid-template-columns: minmax(0, 1fr) 34px 34px;
    min-height: 44px;
  }

  .directory-row-main {
    height: 42px;
  }

  .directory-icon-button {
    width: 32px;
    height: 32px;
  }
}
</style>

<style>
:root.canvas-theme-light .canvas-directory-panel {
  color: #263142;
}

:root.canvas-theme-light .directory-search,
:root.canvas-theme-light .directory-thumbnail {
  border-color: #d8dde6;
  background: #f4f6f9;
}

:root.canvas-theme-light .directory-search input {
  color: #263142;
}

:root.canvas-theme-light .directory-row:hover {
  background: #edf1f6;
}

:root.canvas-theme-light .directory-row-selected,
:root.canvas-theme-light .directory-row-selected:hover {
  border-color: rgba(43, 102, 218, 0.45);
  background: #e3ecff;
  color: #18376f;
}

:root.canvas-theme-light .directory-menu {
  border-color: #d3d9e2;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(35, 45, 60, 0.15);
}

:root.canvas-theme-light .directory-menu button {
  color: #263142;
}

:root.canvas-theme-light .directory-menu button:hover:not(:disabled) {
  background: #edf1f6;
}

:root.canvas-theme-light .directory-rename-input {
  color: #22304a;
  background: #ffffff;
}
</style>
