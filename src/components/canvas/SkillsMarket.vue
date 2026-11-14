<template>
  <div class="skills-market-backdrop" :class="{ 'is-popover-backdrop': !showAll }" @click.self="emit('close')">
    <section class="skills-market" :class="{ 'is-popover': !showAll, 'is-full-market': showAll, 'has-anchor': !showAll && anchor }" :style="showAll ? undefined : anchor" role="dialog" :aria-modal="showAll ? 'true' : 'false'" aria-labelledby="skills-market-title">
      <header class="market-header">
        <div>
          <h2 id="skills-market-title">Skill</h2>
        </div>
        <div class="market-header-actions">
          <button class="create-button" type="button" @click="startCreate"><Plus :size="15" /> {{ translateUi('uiMessages.mcde2cd071d25') }}</button>
          <button v-if="!showAll && !editing" class="all-button" type="button" @click="showAll = true">{{ translateUi('common.all') }}</button>
          <button v-else-if="showAll && !editing" class="all-button" type="button" @click="showAll = false">{{ translateUi('common.back') }}</button>
          <button class="icon-button" type="button" :aria-label="translateUi('uiMessages.m36f612f1b8e9')" @click="emit('close')"><X :size="18" /></button>
        </div>
      </header>

      <!-- @reference 由 Canvas.vue 接收，打开 AI 助手并将 Skill 固定为本轮引用。 -->
      <template v-if="!editing">
        <div class="market-toolbar">
          <div class="market-tabs" role="tablist" :aria-label="translateUi('uiMessages.m4b6abd9fabe3')">
            <button v-for="item in tabs" :key="item.key" type="button" :class="{ active: activeTab === item.key }" @click="selectTab(item.key)">{{ item.label }}</button>
          </div>
          <label class="search-box"><Search :size="15" /><input v-model="query" type="search" :placeholder="translateUi('uiMessages.madb3dcb1d5e3')" /></label>
        </div>
        <p class="market-selection-hint">{{ translateUi('uiMessages.m10340978d9f5') }}</p>

        <p v-if="error" class="market-alert">{{ error }}</p>
        <div v-if="viewing" class="market-detail">
          <header class="market-header">
            <div><h3>{{ viewing.name }}</h3></div>
            <div class="market-header-actions">
              <button class="icon-button" type="button" :aria-label="translateUi('uiMessages.mf0add5a61bf1')" @click="viewing = null"><X :size="18" /></button>
            </div>
          </header>
          <div class="detail-body">
            <p class="detail-summary"><code>{{ viewing.trigger || `/${viewing.slug}` }}</code><span>{{ typeLabel(viewing.skill_type) }}</span></p>
            <p class="detail-desc">{{ viewing.description || viewing.usage_scenario || translateUi('uiMessages.mc62a5f2f28d6') }}</p>
            <dl v-if="viewing.usage_scenario || viewing.usage_guide || viewing.output_description" class="detail-fields">
              <template v-if="viewing.usage_scenario"><dt>{{ translateUi('uiMessages.mc222fdf19e47') }}</dt><dd>{{ viewing.usage_scenario }}</dd></template>
              <template v-if="viewing.usage_guide"><dt>{{ translateUi('uiMessages.m26eb7cff0f41') }}</dt><dd>{{ viewing.usage_guide }}</dd></template>
              <template v-if="viewing.output_description"><dt>{{ translateUi('uiMessages.m87b0fa42c896') }}</dt><dd>{{ viewing.output_description }}</dd></template>
            </dl>
          </div>
        </div>
        <div v-else-if="loading" class="market-empty">{{ translateUi('uiMessages.m598e07fd77c8') }}</div>
        <div v-else-if="filteredSkills.length" class="market-grid">
          <article
            v-for="skill in filteredSkills"
            :key="skill.id"
            class="market-card"
            :class="{ selectable: skill.status === 'published' }"
            :tabindex="skill.status === 'published' ? 0 : -1"
            :aria-disabled="skill.status !== 'published'"
            @click="skill.status === 'published' && reference(skill)"
            @keydown.enter.prevent="skill.status === 'published' && reference(skill)"
            @keydown.space.prevent="skill.status === 'published' && reference(skill)"
          >
            <div class="market-cover" :class="`type-${skill.skill_type || 'text'}`">
              <img v-if="skill.cover_url" :src="skill.cover_url" :alt="translateUi('uiMessages.med467ecd8b08', { value1: (skill.name) })" />
              <component v-else :is="typeIcon(skill.skill_type)" :size="22" aria-hidden="true" />
            </div>
            <div class="card-copy">
              <div class="card-title-row">
                <h3>{{ skill.name }}</h3>
                <code class="card-trigger">{{ skill.trigger || `/${skill.slug}` }}</code>
              </div>
              <p>{{ skill.description || skill.usage_scenario || translateUi('uiMessages.mc62a5f2f28d6') }}</p>
              <div class="card-meta"><span>{{ typeLabel(skill.skill_type) }}</span></div>
            </div>
            <div class="card-actions">
              <button v-if="skill.owner_type === 'tenant'" class="ghost-button" type="button" :title="skill.is_favorite ? translateUi('uiMessages.mdca60869e7d2') : translateUi('canvas.assetPanel.favorite')" @click.stop="toggleFavorite(skill)">
                <Heart :size="15" :fill="skill.is_favorite ? 'currentColor' : 'none'" />
              </button>
              <button v-if="skill.owner_type === 'user'" class="ghost-button" type="button" :title="translateUi('common.edit')" @click.stop="startEdit(skill)"><Pencil :size="15" /></button>
              <button class="reference-button" type="button" :disabled="skill.status !== 'published'" @click.stop="viewDetail(skill)">{{ translateUi('uiMessages.ma748cc074f78') }}</button>
            </div>
          </article>
        </div>
        <div v-else class="market-empty">{{ activeTab === 'favorites' ? translateUi('uiMessages.m6b70ce73ba6f') : translateUi('uiMessages.mb446603c8980') }}</div>
      </template>

      <form v-else class="skill-editor" @submit.prevent="save">
        <div class="editor-header"><div><p class="market-kicker">{{ translateUi('uiMessages.m33c7823a56bd') }}</p><h3>{{ editing.id ? translateUi('uiMessages.m6113534fd918') : translateUi('uiMessages.ma6bd15751b64') }}</h3></div><button class="all-button" type="button" @click="editing = null">{{ translateUi('uiMessages.m37270849d0c9') }}</button></div>
        <p class="editor-hint">{{ translateUi('uiMessages.mb6973c484655') }}</p>
        <label>{{ translateUi('directorStudio.inspector.name') }}<input v-model.trim="editing.name" required maxlength="120" :placeholder="translateUi('uiMessages.m5a0032c0dc8d')" /></label>
        <label>{{ translateUi('uiMessages.m00e871947a6d') }}<textarea v-model.trim="editing.description" rows="2" :placeholder="translateUi('uiMessages.m1e017ec29139')" /></label>
        <label>{{ translateUi('canvas.assetPanel.type') }}<select v-model="editing.skill_type"><option value="text">{{ translateUi('canvas.nodes.text') }}</option><option value="image">{{ translateUi('canvas.nodes.image') }}</option><option value="video">{{ translateUi('canvas.nodes.video') }}</option><option value="audio">{{ translateUi('canvas.nodes.audio') }}</option></select></label>
        <label>{{ translateUi('uiMessages.mc222fdf19e47') }}<textarea v-model.trim="editing.usage_scenario" rows="2" /></label>
        <label>{{ translateUi('uiMessages.m26eb7cff0f41') }}<textarea v-model.trim="editing.usage_guide" rows="2" /></label>
        <label>{{ translateUi('uiMessages.m87b0fa42c896') }}<textarea v-model.trim="editing.output_description" rows="2" /></label>
        <label class="file-field"><span>SKILL.md</span><input type="file" accept=".md,text/markdown" @change="importSkillMarkdown" /><small>{{ translateUi('uiMessages.m1c2536c9485c') }}</small></label>
        <label>{{ translateUi('uiMessages.mb67d306ffbcf') }}<textarea v-model="editing.instructions" rows="11" required :placeholder="translateUi('uiMessages.m989387cf20fa')" /></label>
        <div class="editor-actions"><button class="reference-button" type="submit" :disabled="saving">{{ saving ? translateUi('uiMessages.mff509c9ba052') : translateUi('uiMessages.mded7a215db0b') }}</button><button v-if="editing.id" class="danger-button" type="button" @click="disable">{{ translateUi('uiMessages.m4e6fd0e28c55') }}</button></div>
      </form>
    </section>
  </div>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

import { computed, onMounted, ref } from 'vue'
import { FileText, Heart, Image, Pencil, Plus, Search, Type, Video, Volume2, X } from '@lucide/vue'
import { createMySkill, disableMySkill, favoriteSkill, getFavoriteSkills, getMySkills, getSkillCatalog, referenceSkill, unfavoriteSkill, updateMySkill } from '@/api/agent'

const props = defineProps({
  anchor: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'reference'])

const tabs = [{ key: 'general', get label() { return translateUi('uiMessages.m835b700e028c') } }, { key: 'favorites', get label() { return translateUi('canvas.assetPanel.favorite') } }, { key: 'mine', get label() { return translateUi('directorStudio.modelLibrary.categories.mine') } }]
const activeTab = ref('general')
const query = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const catalog = ref([])
const favorites = ref([])
const mine = ref([])
const editing = ref(null)
const showAll = ref(false)
const viewing = ref(null)
const anchor = computed(() => props.anchor)

const sourceSkills = computed(() => ({ general: catalog.value.filter(item => item.owner_type === 'tenant'), favorites: favorites.value, mine: mine.value })[activeTab.value] || [])
const filteredSkills = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return sourceSkills.value
  return sourceSkills.value.filter(skill => [skill.name, skill.description, skill.trigger, skill.usage_scenario].filter(Boolean).join(' ').toLowerCase().includes(needle))
})

function typeLabel(type) { return ({ image: translateUi('canvas.nodeConfig.imageInput.label'), video: translateUi('canvas.nodeConfig.videoInput.label'), audio: translateUi('canvas.nodeConfig.audioInput.label'), text: translateUi('canvas.nodeConfig.textInput.label') })[type] || translateUi('canvas.nodes.text') }
function typeIcon(type) { return ({ image: Image, video: Video, audio: Volume2, text: Type })[type] || FileText }
function typeCapabilities(type) { return ({ image: ['image:generate'], video: ['video:generate'], audio: ['audio:generate'], text: ['llm:generate'] })[type] || ['llm:generate'] }
function viewDetail(skill) { viewing.value = skill }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [catalogResult, favoriteResult, mineResult] = await Promise.all([getSkillCatalog(), getFavoriteSkills(), getMySkills()])
    catalog.value = catalogResult.skills || []
    favorites.value = favoriteResult.skills || []
    mine.value = mineResult.skills || []
  } catch (err) { error.value = err.message || translateUi('uiMessages.m006d7cb87cac') } finally { loading.value = false }
}

async function selectTab(tab) { activeTab.value = tab; if (tab !== 'general') await load() }
function blankSkill() { return { name: '', description: '', instructions: '', skill_type: 'text', usage_scenario: '', usage_guide: '', output_description: '', status: 'published' } }
function startCreate() { showAll.value = true; editing.value = blankSkill() }
function startEdit(skill) { showAll.value = true; editing.value = JSON.parse(JSON.stringify({ ...blankSkill(), ...skill })) }

function parseSkillMarkdown(markdown) {
  const source = String(markdown || '')
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  const frontmatter = match?.[1] || ''
  const body = source.slice(match?.[0]?.length || 0).trim()
  const field = key => frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'mi'))?.[1]?.trim() || ''
  const title = field('name') || field('title') || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
  return { name: title, description: field('description'), instructions: body || source.trim() }
}

async function importSkillMarkdown(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const parsed = parseSkillMarkdown(await file.text())
  editing.value = { ...editing.value, ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => value)) }
  event.target.value = ''
}

async function toggleFavorite(skill) {
  try {
    if (skill.is_favorite) await unfavoriteSkill(skill.id)
    else await favoriteSkill(skill.id)
    await load()
  } catch (err) { error.value = err.message || translateUi('uiMessages.m31c1399f6eae') }
}

async function reference(skill) {
  try {
    const result = await referenceSkill(skill.id)
    emit('reference', result.skill || skill)
  } catch (err) { error.value = err.message || translateUi('uiMessages.m64c684642fab') }
}

async function save() {
  if (!editing.value?.name || !editing.value?.instructions) return
  saving.value = true
  try {
    const payload = { ...editing.value, capabilities: typeCapabilities(editing.value.skill_type), tool_bindings: {}, allow_canvas_write: false, status: 'published' }
    if (editing.value.id) await updateMySkill(editing.value.id, payload)
    else await createMySkill(payload)
    editing.value = null
    activeTab.value = 'mine'
    await load()
  } catch (err) { error.value = err.message || translateUi('uiMessages.m14784b31183e') } finally { saving.value = false }
}

async function disable() {
  if (!editing.value?.id) return
  try { await disableMySkill(editing.value.id); editing.value = null; await load() } catch (err) { error.value = err.message || translateUi('uiMessages.m00c8fbad6524') }
}

onMounted(load)
</script>

<style scoped>
.skills-market-backdrop { position: fixed; inset: 0; z-index: 9300; display: grid; place-items: center; padding: 24px; background: rgba(2, 6, 23, .62); backdrop-filter: blur(8px); }
.skills-market-backdrop.is-popover-backdrop { display: block; padding: 0; background: transparent; backdrop-filter: none; }
.skills-market { width: min(900px, calc(100vw - 32px)); max-height: min(780px, calc(100vh - 48px)); overflow: auto; border: 1px solid var(--canvas-border-subtle); border-radius: 14px; background: var(--canvas-bg-secondary); color: var(--canvas-text-primary); box-shadow: 0 30px 100px rgba(0, 0, 0, .45); color-scheme: dark; }
.skills-market.is-popover { position: fixed; top: 50%; left: 50%; width: min(780px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 24px)); transform: translate(-50%, -50%); background: var(--canvas-bg-elevated); box-shadow: 0 18px 52px rgba(0, 0, 0, .45); }
.skills-market.is-popover.has-anchor { transform: none; }
.skills-market.is-full-market { width: min(1560px, calc(100vw - 48px)); max-height: min(820px, calc(100vh - 48px)); }
.market-header,.market-toolbar,.market-header-actions,.card-title-row,.card-meta,.card-actions,.editor-header,.editor-actions { display: flex; align-items: center; gap: 10px; }
.market-header,.editor-header { justify-content: space-between; padding: 17px 20px; border-bottom: 1px solid var(--canvas-border-subtle); }
.market-kicker { margin: 0 0 4px; color: var(--canvas-text-secondary); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }.market-header h2,.editor-header h3 { margin: 0; font-size: 17px; }
.icon-button,.ghost-button,.create-button,.all-button,.reference-button,.danger-button,.market-tabs button { border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--canvas-text-primary); cursor: pointer; }.icon-button,.ghost-button { display: inline-grid; place-items: center; width: 32px; height: 32px; }.icon-button:hover,.ghost-button:hover { background: rgba(148,163,184,.16); }
.market-toolbar { padding: 14px 20px; border-bottom: 1px solid var(--canvas-border-subtle); flex-wrap: wrap; }.market-tabs { display: flex; padding: 3px; border-radius: 9px; background: rgba(148,163,184,.12); }.market-tabs button { padding: 6px 11px; color: var(--canvas-text-secondary); font-size: 12px; }.market-tabs button.active { background: rgba(255,255,255,.14); color: var(--canvas-text-primary); box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.search-box { display: flex; align-items: center; flex: 1 1 180px; gap: 7px; min-width: 160px; padding: 7px 10px; border: 1px solid var(--canvas-border-subtle); border-radius: 8px; color: var(--canvas-text-secondary); }.search-box input,.skill-editor input,.skill-editor textarea,.skill-editor select { width: 100%; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }.create-button,.reference-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 11px; border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.12); color: var(--canvas-text-primary); font-size: 12px; }.create-button:hover,.reference-button:hover { background: rgba(255,255,255,.2); }.all-button { padding: 7px 12px; border-color: var(--canvas-border-subtle); color: var(--canvas-text-primary); font-size: 12px; }.all-button:hover { background: rgba(255,255,255,.12); }.reference-button:disabled { opacity: .45; cursor: not-allowed; }.market-selection-hint { margin: 0; padding: 9px 20px; border-bottom: 1px solid var(--canvas-border-subtle); color: var(--canvas-text-secondary); font-size: 12px; }.market-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; padding: 16px; }.market-card { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; padding: 10px; border: 1px solid var(--canvas-border-subtle); border-radius: 11px; background: rgba(255,255,255,.035); }.market-card.selectable { cursor: pointer; }.market-card.selectable:hover { border-color: rgba(255,255,255,.32); background: rgba(255,255,255,.08); }.market-card.selectable:focus-visible { outline: 2px solid rgba(255,255,255,.72); outline-offset: 2px; }.market-cover { display: grid; place-items: center; width: 44px; height: 44px; overflow: hidden; border-radius: 9px; background: rgba(255,255,255,.1); color: var(--canvas-text-secondary); }.market-cover img { width: 100%; height: 100%; object-fit: cover; }.card-copy { min-width: 0; }.card-title-row { justify-content: space-between; }.card-title-row h3 { overflow: hidden; margin: 0; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }.card-trigger { flex: none; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,.08); color: var(--canvas-text-secondary); font-size: 10px; white-space: nowrap; }.market-card p { margin: 6px 0; color: var(--canvas-text-secondary); font-size: 12px; line-height: 1.45; }.card-meta { justify-content: space-between; color: var(--canvas-text-secondary); font-size: 11px; }.card-actions { grid-column: 1 / -1; justify-content: flex-end; }.card-actions .reference-button { padding: 6px 11px; }.market-empty,.market-alert { padding: 38px 20px; color: var(--canvas-text-secondary); text-align: center; }.market-alert { padding: 10px 20px; color: var(--canvas-text-primary); }.market-detail .detail-body { display: grid; gap: 12px; padding: 16px 20px; }.detail-summary { display: flex; align-items: center; gap: 10px; margin: 0; color: var(--canvas-text-primary); }.detail-summary code { flex: none; padding: 2px 7px; border-radius: 5px; background: rgba(255,255,255,.1); font-size: 12px; }.detail-summary span { color: var(--canvas-text-secondary); font-size: 12px; }.detail-desc { margin: 0; color: var(--canvas-text-secondary); font-size: 13px; line-height: 1.6; }.detail-fields { display: grid; gap: 10px; margin: 0; }.detail-fields dt { margin-bottom: 2px; color: var(--canvas-text-secondary); font-size: 11px; letter-spacing: .05em; }.detail-fields dd { margin: 0; color: var(--canvas-text-primary); font-size: 12px; line-height: 1.55; white-space: pre-wrap; }.skill-editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; max-width: 960px; margin: 0 auto; padding: 20px; }.skill-editor .editor-header,.skill-editor .editor-hint,.skill-editor .file-field,.skill-editor .editor-actions,.skill-editor label:has(textarea[rows="11"]) { grid-column: 1 / -1; }.skill-editor label { display: grid; gap: 6px; color: var(--canvas-text-secondary); font-size: 12px; }.skill-editor input,.skill-editor textarea,.skill-editor select { box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--canvas-border-subtle); border-radius: 8px; background: rgba(255,255,255,.05); color: var(--canvas-text-primary); resize: vertical; }.editor-hint,.file-field small { margin: 0; color: var(--canvas-text-secondary); font-size: 12px; line-height: 1.45; }.file-field input { padding: 7px; }.editor-actions { justify-content: flex-end; }.danger-button { padding: 8px 11px; border-color: var(--canvas-border-subtle); color: var(--canvas-text-secondary); }
.skills-market.is-popover .market-grid { grid-template-columns: 1fr; padding: 12px; }.skills-market.is-popover .market-card { grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; }.skills-market.is-popover .card-actions { grid-column: auto; }.skills-market.is-popover .market-selection-hint { display: none; }.skills-market.is-full-market .market-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.skills-market.is-full-market .market-card { grid-template-columns: 96px minmax(0, 1fr); }.skills-market.is-full-market .market-cover { width: 96px; height: 96px; }.skills-market.is-full-market .card-actions { grid-column: 1 / -1; }
@media (max-width: 640px) { .skills-market-backdrop { padding: 10px; }.skills-market { width: 100%; max-height: calc(100vh - 20px); }.skills-market.is-full-market { width: calc(100vw - 20px); }.skills-market.is-full-market .market-grid { grid-template-columns: 1fr; }.market-toolbar { align-items: stretch; }.skill-editor { grid-template-columns: 1fr; }.create-button { width: 100%; }.market-grid { grid-template-columns: 1fr; padding: 12px; } }
/* 白昼模式适配：跟随画布全局主题（canvas-theme-light） */
:root.canvas-theme-light .skills-market { color-scheme: light; }
:root.canvas-theme-light .skills-market .skill-editor input,
:root.canvas-theme-light .skills-market .skill-editor textarea,
:root.canvas-theme-light .skills-market .skill-editor select { background: rgba(0, 0, 0, .04); }
:root.canvas-theme-light .skills-market .market-card { background: rgba(0, 0, 0, .03); }
:root.canvas-theme-light .skills-market .market-card.selectable:hover { background: rgba(0, 0, 0, .05); border-color: rgba(0, 0, 0, .25); }
:root.canvas-theme-light .skills-market .market-tabs { background: rgba(0, 0, 0, .08); }
:root.canvas-theme-light .skills-market .market-tabs button.active { background: rgba(0, 0, 0, .12); color: var(--canvas-text-primary); }
:root.canvas-theme-light .skills-market .create-button,
:root.canvas-theme-light .skills-market .reference-button { background: rgba(0, 0, 0, .08); border-color: rgba(0, 0, 0, .15); }
:root.canvas-theme-light .skills-market .create-button:hover,
:root.canvas-theme-light .skills-market .reference-button:hover { background: rgba(0, 0, 0, .12); }
:root.canvas-theme-light .skills-market .all-button:hover,
:root.canvas-theme-light .skills-market .ghost-button:hover,
:root.canvas-theme-light .skills-market .icon-button:hover { background: rgba(0, 0, 0, .08); }
:root.canvas-theme-light .skills-market .market-cover,
:root.canvas-theme-light .skills-market .card-trigger { background: rgba(0, 0, 0, .06); }
</style>
