<script setup>
import { t as translateUi } from '@/i18n'

import { ref, computed, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import { getAssets, saveAsset } from '@/api/canvas/assets'
import { getAvailableImageModels, getAvailableVideoModels, getTenantConfigVersion } from '@/config/tenant'
import { getAvailableImageResolutionOptions, getImageResolutionCost } from '@/utils/canvasImageResolutionOptions'
import { assetLabels, newShot, autoCompose, assetPrompt, scriptCsv } from '@/utils/scriptDocument'

const props = defineProps({ engine: Object, nodeId: String, readonly: Boolean, initialAction: String })
const emit = defineEmits(['close'])
const { document: doc, config, task, error, saving, loading, loaded, busy, running, mediaBusy, mediaProgress, steps, store } = props.engine
const flow = useVueFlow()
const vCellFocus = { mounted: el => el.focus() }
const editingCell = ref('')
const readyAssets = computed(() => doc.value.assets.filter(a => a.imageUrl).length)
const readyPrompts = computed(() => doc.value.shots.filter(s => s.imagePrompt && s.videoPrompt).length)
const step = ref(1), inputOpen = ref(false), modelId = ref(''), selected = ref([]), promptShotId = ref(''), dragged = ref('')
const batch = ref(null), batchSelection = ref([]), imageModel = ref(''), videoModel = ref(''), size = ref('2K'), ratio = ref('16:9'), quality = ref('auto'), duration = ref('10'), synthesisMode = ref('smart')
const picker = ref(null), pickerItems = ref([]), pickerLoading = ref(false), uploadInput = ref(null), uploadAssetId = ref(''), uploading = ref(false)
const imageModels = computed(() => { getTenantConfigVersion(); return getAvailableImageModels() })
const videoModels = computed(() => { getTenantConfigVersion(); return getAvailableVideoModels({ disableVeoMerge: true }) })
const currentImageModel = computed(() => imageModels.value.find(m => m.value === imageModel.value) || {})
const currentVideoModel = computed(() => videoModels.value.find(m => m.value === videoModel.value) || {})
const videoDurations = computed(() => (currentVideoModel.value.durations || ['5','10']).map(d => typeof d === 'object' ? d.value : String(d)))
const ratios = computed(() => { const m = batch.value?.kind === 'video' ? currentVideoModel.value : currentImageModel.value; return (m.aspectRatios || ['16:9','9:16','1:1','2:1','4:3','3:4']).map(r => typeof r === 'object' ? r.value : r) })
watch(videoDurations, values => { if (!values.includes(duration.value)) duration.value = values[0] || '10' })
watch(ratios, values => { if (!values.includes(ratio.value)) ratio.value = values[0] || '16:9' })
const resolutions = computed(() => getAvailableImageResolutionOptions(currentImageModel.value))
const promptShot = computed(() => doc.value.shots.find(s => s.id === promptShotId.value))
const locked = computed(() => props.readonly || busy.value || !loaded.value)
const batchItems = computed(() => batch.value?.items || [])
const selectedBatchItems = computed(() => batchItems.value.filter(i => batchSelection.value.includes(i.id)))
const imageEstimate = computed(() => selectedBatchItems.value.length * getImageResolutionCost(currentImageModel.value, size.value))
const totalSeconds = computed(() => doc.value.shots.reduce((sum, s) => sum + Number(s.duration), 0))
watch(() => [loaded.value, doc.value.sourceText, doc.value.entry], () => { if (loaded.value && !doc.value.shots.length && (doc.value.sourceText || doc.value.entry === 'character')) inputOpen.value = true }, { immediate: true })
watch(config, c => { modelId.value ||= c?.default_model || c?.models?.[0]?.id || '' }, { immediate: true })
watch(imageModels, models => { imageModel.value ||= models[0]?.value || '' }, { immediate: true })
watch(videoModels, models => { videoModel.value ||= models[0]?.value || '' }, { immediate: true })
watch(resolutions, options => { if (!options.some(o => o.value === size.value)) size.value = options[0]?.value || '2K' })
function save() { if (!props.readonly) props.engine.save().catch(() => {}) }
function editShots() { doc.value.confirmed = false; save() }
function addShot() { doc.value.shots.push(newShot(`shot_${crypto.randomUUID()}`)); editShots() }
function deleteShot(id) { doc.value.shots = doc.value.shots.filter(s => s.id !== id); selected.value = selected.value.filter(s => s !== id); editShots() }
function moveShot(id, target) {
  if (locked.value || id === target) return
  const from = doc.value.shots.findIndex(s => s.id === id), to = doc.value.shots.findIndex(s => s.id === target)
  if (from < 0 || to < 0) return
  const [shot] = doc.value.shots.splice(from, 1); doc.value.shots.splice(to, 0, shot); editShots()
}
async function confirmShots() {
  if (!doc.value.shots.length || doc.value.shots.some(s => !s.description.trim())) { error.value = translateUi('uiMessages.m665984d5e671'); return }
  doc.value.confirmed = true
  try { await props.engine.save(); step.value = 2 } catch {}
}
function addAsset(type) {
  const asset = { id: `asset_${crypto.randomUUID()}`, type, name: translateUi('uiMessages.m6e376ee86db6', { value1: (assetLabels[type]) }), description: '', imageUrl: '', nodeId: '', inferred: false }
  doc.value.assets.push(asset); save()
  return asset
}
function deleteAsset(id) {
  doc.value.assets = doc.value.assets.filter(a => a.id !== id)
  doc.value.shots.forEach(s => { s.assetIds = s.assetIds.filter(a => a !== id) })
  save()
}
function toggleRef(shot, id) { shot.assetIds = shot.assetIds.includes(id) ? shot.assetIds.filter(a => a !== id) : [...shot.assetIds, id]; editShots() }
function selectAll() { selected.value = selected.value.length === doc.value.shots.length ? [] : doc.value.shots.map(s => s.id) }
function download() {
  const blob = new Blob([scriptCsv(doc.value)], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = `${doc.value.title}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function entry(kind) { await props.engine.createSource(kind); inputOpen.value = kind !== 'manual'; if (kind === 'manual' && !doc.value.shots.length) addShot() }
async function generate() {
  await props.engine.generate('generate', [], modelId.value)
  if (running.value) inputOpen.value = false
}
function openSynthesis(ids) {
  batch.value = { kind: 'synthesis', items: doc.value.shots.filter(s => !ids || ids.includes(s.id)).map((s,i) => ({ id: s.id, get name() { return translateUi('uiMessages.mdf98c3ad9682', { value1: (doc.value.shots.indexOf(s)+1) }) }, prompt: s.description })) }
  batchSelection.value = batch.value.items.map(i => i.id)
}
function openBatch(kind, ids) {
  const records = kind === 'asset' ? doc.value.assets : doc.value.shots
  batch.value = { kind, items: records.filter(s => !ids || ids.includes(s.id)).map((s,i) => ({ id: s.id, name: kind === 'asset' ? s.name : translateUi('uiMessages.mdf98c3ad9682', { value1: (records.indexOf(s)+1) }), prompt: kind === 'asset' ? assetPrompt(s, doc.value.style) : kind === 'video' ? s.videoPrompt : s.imagePrompt, done: !!(kind === 'video' ? s.videoUrl : s.imageUrl) })) }
  batchSelection.value = batch.value.items.filter(i => !i.done).map(i => i.id)
}
async function submitBatch() {
  if (!batchSelection.value.length) return
  if (batch.value.kind === 'synthesis') {
    if (synthesisMode.value === 'automatic') { doc.value = autoCompose(doc.value, batchSelection.value); await props.engine.save().catch(() => {}); batch.value = null }
    else { await props.engine.generate('synthesize', batchSelection.value, modelId.value); if (running.value) batch.value = null }
    return
  }
  const kind = batch.value.kind, items = selectedBatchItems.value.map(i => ({ ...i }))
  const options = { model: kind === 'video' ? videoModel.value : imageModel.value, size: size.value, aspectRatio: ratio.value, quality: quality.value, duration: duration.value }
  if (!options.model || items.some(i => !i.prompt.trim())) { error.value = translateUi('uiMessages.m8fa36924b00f'); return }
  batch.value = null
  await props.engine.batchMedia(kind, items, options)
}
async function openPicker(asset, source) {
  picker.value = { assetId: asset?.id || '', source }; pickerItems.value = []; pickerLoading.value = true
  try {
    if (source === 'canvas') pickerItems.value = store.nodes.filter(n => /image/.test(n.type) && (n.data.output?.url || n.data.imageUrl || n.data.url)).map(n => ({ id: n.id, name: n.data.title || translateUi('uiMessages.m2cfcfd31ff3f'), url: n.data.output?.url || n.data.imageUrl || n.data.url, nodeId: n.id }))
    else { const result = await getAssets({ type: 'image', spaceType: 'personal', pageSize: 100 }); pickerItems.value = result.assets || result.data || [] }
  } catch (e) { error.value = e.message } finally { pickerLoading.value = false }
}
async function choosePicture(item) {
  try {
    const asset = doc.value.assets.find(a => a.id === picker.value.assetId)
    if (asset) await props.engine.attachAssetPicture(asset, item.url, item.nodeId)
    else if (doc.value.referenceImages.length < 12) { doc.value.referenceImages.push(item.url); await props.engine.save() }
    picker.value = null
  } catch (e) { error.value = e.message }
}
async function upload(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    const result = await uploadCanvasMedia(file, 'image')
    if (!result.url) throw new Error(translateUi('uiMessages.mf4c48b508d7e'))
    const asset = doc.value.assets.find(a => a.id === uploadAssetId.value)
    if (asset) await props.engine.attachAssetPicture(asset, result.url)
    else if (doc.value.referenceImages.length < 12) { doc.value.referenceImages.push(result.url); await props.engine.save() }
  } catch (e) { error.value = e.message } finally { uploading.value = false }
}
function uploadFor(id = '') { uploadAssetId.value = id; uploadInput.value.click() }
async function saveToLibrary(asset) {
  try { await saveAsset({ type: 'image', name: asset.name, url: asset.imageUrl, content: asset.description, source_node_id: asset.nodeId || props.nodeId, tags: ['脚本', assetLabels[asset.type]] }); error.value = ''; assetNotice.value = translateUi('uiMessages.mc4412137342f', { value1: (asset.name) }) } catch (e) { error.value = e.message }
}
const assetNotice = ref('')
function jump(nodeId) { const node = store.nodes.find(n => n.id === nodeId); if (!node) { error.value = translateUi('uiMessages.m1e6614956ce7'); return } flow.fitView({ nodes: [nodeId], duration: 300, maxZoom: 1 }); emit('close') }
function close() { if (saving.value) { error.value = translateUi('uiMessages.m6b03e2ce6850'); return } emit('close') }
watch(() => [props.initialAction, loaded.value], () => {
  if (!loaded.value || !props.initialAction) return
  if (props.initialAction === 'download' && steps.value === 3) download()
  else if (!props.readonly && props.initialAction === 'regenerate') { step.value = 1; inputOpen.value = true }
  else if (!props.readonly && ['image', 'video'].includes(props.initialAction) && steps.value === 3) openBatch(props.initialAction)
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div class="script-overlay nodrag nopan" @pointerdown.stop @wheel.stop @keydown.stop>
      <section class="script-editor" role="dialog" :aria-modal="!batch && !picker && !promptShot" :inert="batch || picker || promptShot ? true : undefined" :aria-label="translateUi('uiMessages.m3505e0335a9d')">
        <header class="script-header">
          <div class="script-identity">
            <span class="script-document-icon" aria-hidden="true">▤</span>
            <div><input v-model="doc.title" class="script-title" :aria-label="translateUi('uiMessages.md143439ccdb0')" :disabled="locked" @change="save"><small>{{ translateUi('uiMessages.m9bc39e7ea9d4', { value1: (saving ? translateUi('uiMessages.mff509c9ba052') : error ? translateUi('uiMessages.mab35ca37bfec') : loaded ? translateUi('uiMessages.mb80e4ee9c97f') : translateUi('uiMessages.m4927a53bcc88')), value2: (totalSeconds) }) }}</small></div>
          </div>
          <nav class="script-steps" :aria-label="translateUi('uiMessages.m88bb4b47f21a')">
            <button v-for="(name,index) in ['确认镜头','准备资产','合成提示词']" :key="name" :class="{ active: step === index + 1, complete: steps > index }" :aria-current="step === index + 1 ? 'step' : undefined" :disabled="index > 0 && !doc.confirmed || index > 1 && steps < 2" @click="step = index + 1">
              <b>{{ index + 1 }}</b><span>{{ name }}<small>{{ index === 0 ? translateUi('uiMessages.m7a1bab10eb3d', { value1: (doc.shots.length), value2: (doc.confirmed ? translateUi('uiMessages.mab27f80d046f') : translateUi('uiMessages.ma8b0bd9c65f7')) }) : index === 1 ? translateUi('uiMessages.m97a1cc489c6c', { value1: (readyAssets), value2: (doc.assets.length) }) : translateUi('uiMessages.m55c2b0617c11', { value1: (readyPrompts), value2: (doc.shots.length) }) }}</small></span>
            </button>
          </nav>
          <div class="script-actions"><span>{{ translateUi('uiMessages.me5442583657a', { value1: (steps) }) }}</span><button class="icon-button" :aria-label="translateUi('uiMessages.m45360ad4a63a')" :title="translateUi('uiMessages.m7bdd5ce1e298')" :disabled="busy || readonly || saving" @click="props.engine.load()">↻</button><button class="icon-button" :aria-label="translateUi('uiMessages.md3feade9aebe')" @click="close">×</button></div>
        </header>
        <div v-if="error" class="script-error" role="alert">{{ error }}</div>
        <div v-if="running || mediaBusy" class="script-progress" role="status"><span>{{ running ? (task.status === 'queued' ? translateUi('uiMessages.m42e7009102cf') : translateUi('uiMessages.mea75f3467f33')) : mediaProgress }}</span><button v-if="running && !readonly" @click="props.engine.cancel()">{{ translateUi('uiMessages.ma9fcfe87238e') }}</button><button v-if="mediaBusy" @click="props.engine.stopBatch()">{{ translateUi('uiMessages.m672dfa2d07f4') }}</button></div>
        <div v-if="loading" class="script-empty">{{ translateUi('uiMessages.m8aea1560baa4') }}</div>
        <template v-else>
          <div v-if="!doc.shots.length && !inputOpen" class="script-empty">
            <h2>{{ translateUi('uiMessages.md01f67bd1595') }}</h2><p>{{ translateUi('uiMessages.m4cc2735eee1b') }}</p>
            <div class="script-entry"><button :disabled="locked" @click="entry('story')">{{ translateUi('uiMessages.m3e39fc381f4e') }}<small>{{ translateUi('uiMessages.m503ae60be4fa') }}</small></button><button :disabled="locked" @click="entry('character')">{{ translateUi('uiMessages.m464aa0f60747') }}<small>{{ translateUi('uiMessages.mf371e5c1c22b') }}</small></button><button :disabled="locked" @click="entry('manual')">{{ translateUi('uiMessages.m707e305c2dee') }}<small>{{ translateUi('uiMessages.me15f9b8d3736') }}</small></button></div>
          </div>
          <template v-else-if="step === 1 || step === 3">
            <div class="script-toolbar script-table-tools"><div><button v-if="step === 1" :disabled="locked" @click="inputOpen = !inputOpen">{{ inputOpen ? translateUi('uiMessages.mb8d1882e5555') : translateUi('uiMessages.mb8426e999224') }}</button><button @click="selectAll">{{ selected.length === doc.shots.length ? translateUi('common.deselectAll') : translateUi('uiMessages.mcd6578e17704') }}</button><small v-if="selected.length">{{ translateUi('uiMessages.m31549bcb0530', { value1: (selected.length) }) }}</small></div><small>{{ translateUi('uiMessages.m993527a72f50') }}</small></div>
            <div v-if="inputOpen" class="script-input-area">
              <label>{{ translateUi('uiMessages.m3bf211ba84e1') }}<textarea v-model="doc.sourceText" :disabled="locked" rows="7" maxlength="100000" :placeholder="translateUi('uiMessages.m145e46ff8fce')" @change="save" /></label>
              <label>{{ translateUi('uiMessages.m2cd79953f5e6') }}<textarea v-model="doc.requirements" :disabled="locked" rows="2" :placeholder="translateUi('uiMessages.m9e53744fe7ca')" @change="save" /></label>
              <div class="script-toolbar"><div><button :disabled="locked || uploading" @click="uploadFor()">{{ translateUi('uiMessages.mdcdcd423bc51') }}</button><button :disabled="locked" @click="openPicker(null, 'canvas')">{{ translateUi('uiMessages.m697900a715dc') }}</button><button :disabled="locked" @click="props.engine.createSource(doc.entry)">{{ translateUi('uiMessages.m3f09267e6b7d') }}</button></div><small>{{ translateUi('uiMessages.m9cf055cf474c', { value1: (doc.sourceText.length) }) }}</small></div>
              <div class="script-references"><div v-for="(url,i) in doc.referenceImages" :key="url"><img :src="url" :alt="translateUi('canvas.videoNode.refImage')"><button :disabled="locked" @click="doc.referenceImages.splice(i,1); save()">×</button></div></div>
              <div class="script-toolbar"><select v-model="modelId" :aria-label="translateUi('uiMessages.md5d4944b675a')" :disabled="locked"><option value="">{{ translateUi('uiMessages.m93709aca944e') }}</option><option v-for="model in config?.models || []" :key="model.id" :value="model.id">{{ model.name }}</option></select><span v-if="!config?.enabled">{{ translateUi('uiMessages.m24dbffd59563') }}</span><button class="primary" :disabled="locked || !config?.enabled || !modelId" @click="generate">{{ translateUi('uiMessages.m42996779b0cb', { value1: (doc.shots.length ? translateUi('uiMessages.m884dfc0c12fa') : translateUi('canvas.nodeConfig.storyboard.desc')), value2: (config?.generate_cost || 0) }) }}</button></div>
            </div>
            <div v-if="doc.shots.length" class="script-table-wrap">
              <table class="script-table">
                <thead><tr><th>{{ translateUi('uiMessages.m7389fe0470c5') }}</th><th>{{ translateUi('videoGen.duration') }}</th><th>{{ translateUi('uiMessages.me85f0c1ba153') }}</th><th>{{ translateUi('uiMessages.ma17a09842c33') }}</th><th>{{ translateUi('uiMessages.m1a2178a0b931') }}</th><th>{{ translateUi('uiMessages.m476af643e583') }}</th><th>{{ translateUi('uiMessages.m5e9d80d0e3c3') }}</th><th>{{ translateUi('uiMessages.mcfcc288e1d3d') }}</th><th>{{ translateUi('uiMessages.ma65c884a665a') }}</th><th>{{ translateUi('uiMessages.med31fbb483ee') }}</th></tr></thead>
                <tbody><tr v-for="(shot,index) in doc.shots" :key="shot.id" :data-color="shot.color" :class="{ 'is-selected': selected.includes(shot.id) }" @dragover.prevent @drop.prevent="moveShot(dragged,shot.id)">
                  <td class="shot-number"><span :draggable="!locked" class="drag-handle" :title="translateUi('uiMessages.ma8036485f922')" @dragstart="dragged=shot.id">⠿</span><span>{{ index + 1 }}</span><input v-model="selected" type="checkbox" :value="shot.id" :aria-label="translateUi('uiMessages.ma53dfe66979d', { value1: (index+1) })"></td>
                  <td><div class="shot-duration"><input v-model.number="shot.duration" type="number" min="5" max="15" :disabled="locked" :aria-label="translateUi('uiMessages.m6703ebc0477e', { value1: (index+1) })" @change="editShots"><span>s</span></div></td>
                  <td>
                    <textarea v-cell-focus v-if="editingCell === shot.id + ':description'" v-model="shot.description" :disabled="locked" rows="5" :aria-label="translateUi('uiMessages.m8a93e53fb900', { value1: (index+1) })" @change="editShots" @blur="editingCell=''"/>
                    <button v-else class="cell-text" :disabled="locked" :aria-label="translateUi('uiMessages.m8d135ffa13b0', { value1: (index+1) })" @click="editingCell=shot.id+':description'">{{ shot.description || translateUi('uiMessages.m165cd49ed70a') }}</button>
                    <details class="asset-refs"><summary><span v-for="asset in doc.assets.filter(a => shot.assetIds.includes(a.id))" :key="asset.id" class="reference-tag" :data-type="asset.type">@{{ asset.name }}</span><span class="reference-edit">{{ translateUi('uiMessages.m645ba4bdfe19') }}</span></summary><div class="cell-popover"><label v-for="a in doc.assets" :key="a.id" class="asset-reference"><input type="checkbox" :checked="shot.assetIds.includes(a.id)" :disabled="locked" @change="toggleRef(shot,a.id)"><span :data-type="a.type">@{{ a.name }}</span></label><small v-if="!doc.assets.length">{{ translateUi('uiMessages.m765f6fa433eb') }}</small></div></details>
                  </td>
                  <td><select v-model="shot.scale" :disabled="locked" :aria-label="translateUi('uiMessages.mc1db0a868385', { value1: (index+1) })" @change="editShots"><option v-for="scale in ['大远景','远景','全景','中景','近景','特写','大特写']" :key="scale">{{ scale }}</option><option v-if="!['大远景','远景','全景','中景','近景','特写','大特写'].includes(shot.scale)">{{ shot.scale }}</option></select></td>
                  <td><textarea v-cell-focus v-if="editingCell===shot.id+':lighting'" v-model="shot.lighting" :disabled="locked" rows="4" :aria-label="translateUi('uiMessages.m1a2178a0b931')" @change="editShots" @blur="editingCell=''"/><button v-else class="cell-text" :disabled="locked" @click="editingCell=shot.id+':lighting'">{{ shot.lighting || '＋' }}</button></td>
                  <td><details class="dialogue-editor"><summary><span v-for="(line,i) in shot.dialogue" :key="i" class="dialogue-preview"><b>{{ line.speaker || translateUi('uiMessages.m101f6e6d6095') }}：</b>{{ line.text }}</span><span v-if="!shot.dialogue.length" class="cell-placeholder">＋</span></summary><div class="cell-popover dialogue-popover"><div v-for="(line,i) in shot.dialogue" :key="i" class="dialogue-line"><input v-model="line.speaker" :disabled="locked" :placeholder="translateUi('uiMessages.mad215988e656')" @change="editShots"><textarea v-model="line.text" :disabled="locked" rows="2" :placeholder="translateUi('uiMessages.m8b42c4b64e94')" @change="editShots"/><button class="icon-button" :disabled="locked" :aria-label="translateUi('uiMessages.m8fbac38e728f')" @click="shot.dialogue.splice(i,1); editShots()">×</button></div><button :disabled="locked" @click="shot.dialogue.push({speaker:'',text:''}); editShots()">{{ translateUi('uiMessages.m9532502b01c6') }}</button></div></details></td>
                  <td><textarea v-cell-focus v-if="editingCell===shot.id+':audio'" v-model="shot.audio" :disabled="locked" rows="4" :aria-label="translateUi('uiMessages.m5e9d80d0e3c3')" @change="editShots" @blur="editingCell=''"/><button v-else class="cell-text" :disabled="locked" @click="editingCell=shot.id+':audio'">{{ shot.audio || '＋' }}</button></td>
                  <td><textarea v-cell-focus v-if="editingCell===shot.id+':camera'" v-model="shot.camera" :disabled="locked" rows="4" :aria-label="translateUi('uiMessages.mcfcc288e1d3d')" @change="editShots" @blur="editingCell=''"/><button v-else class="cell-text" :disabled="locked" @click="editingCell=shot.id+':camera'">{{ shot.camera || '＋' }}</button></td>
                  <td class="prompt-cell"><button :disabled="!shot.imagePrompt && !shot.videoPrompt && step!==3" @click="promptShotId=shot.id">{{ shot.imagePrompt && shot.videoPrompt ? translateUi('uiMessages.m603a67e099c2') : step===3 ? translateUi('uiMessages.mb52f59e63937') : translateUi('uiMessages.m6c70586675ba') }}</button><div class="shot-media"><button v-if="shot.imageUrl" class="shot-thumbnail" :aria-label="translateUi('uiMessages.mbd7b8a3ea5ae')" @click="jump(shot.imageNodeId)"><img :src="shot.imageUrl" :alt="translateUi('uiMessages.m97f8a573d07f')"></button><button v-if="shot.videoUrl" class="shot-thumbnail video-thumbnail" :aria-label="translateUi('uiMessages.me4036c7e837d')" @click="jump(shot.videoNodeId)"><video :src="shot.videoUrl" preload="metadata"/><span>▶</span></button></div></td>
                  <td><details class="script-menu"><summary :aria-label="translateUi('uiMessages.m51b283ae2630', { value1: (index+1) })">···</summary><div class="script-menu-panel"><label>{{ translateUi('uiMessages.m3d58ce878ceb') }}<select v-model="shot.color" :disabled="locked" :aria-label="translateUi('uiMessages.m9d23912ec920')" @change="save"><option value="">{{ translateUi('uiMessages.m9c04d57fd881') }}</option><option value="red">{{ translateUi('uiMessages.m789f61dbfcc7') }}</option><option value="yellow">{{ translateUi('uiMessages.md451c07d739b') }}</option><option value="green">{{ translateUi('uiMessages.m30c83dc25b12') }}</option><option value="blue">{{ translateUi('uiMessages.m67035e6b7f82') }}</option><option value="gray">{{ translateUi('uiMessages.m051e67d913f4') }}</option></select></label><button :disabled="locked || index===0" @click="moveShot(shot.id, doc.shots[index-1].id)">{{ translateUi('uiMessages.m115c32c3950a') }}</button><button v-if="shot.imageUrl" :disabled="locked" @click="shot.imageUrl=''; shot.imageNodeId=''; save()">{{ translateUi('uiMessages.m5d49fadfc520') }}</button><button v-if="shot.videoUrl" :disabled="locked" @click="shot.videoUrl=''; shot.videoNodeId=''; save()">{{ translateUi('uiMessages.m7536d0f4a446') }}</button><button class="danger" :disabled="locked" @click="deleteShot(shot.id)">{{ translateUi('uiMessages.m382c8d6e426c') }}</button></div></details></td>
                </tr></tbody>
              </table>
            </div>
          </template>
          <div v-else-if="step === 2" class="script-assets-area">
            <label class="style-field"><span>{{ translateUi('uiMessages.md062ec2e105b') }}</span><textarea v-model="doc.style" :disabled="locked" rows="1" :placeholder="translateUi('uiMessages.mfada80f09fa8')" @change="save"/><small :title="translateUi('uiMessages.m887ff30c358c')">ⓘ</small></label>
            <p v-if="assetNotice" class="asset-notice" role="status">{{ assetNotice }}</p>
            <section v-for="(label,type) in assetLabels" :key="type" class="asset-section">
              <h3>{{ label }} <small>{{ doc.assets.filter(a=>a.type===type).length }}</small></h3>
              <div class="asset-grid">
                <article v-for="asset in doc.assets.filter(a=>a.type===type)" :key="asset.id" class="asset-card">
                  <div class="asset-picture" :class="{ 'has-image': asset.imageUrl }">
                    <img v-if="asset.imageUrl" :src="asset.imageUrl" :alt="asset.name">
                    <span v-else>{{ translateUi('uiMessages.m0e9db26caf75', { value1: (label) }) }}</span>
                    <span v-if="asset.inferred" class="inferred">{{ translateUi('uiMessages.m3829b71e7276') }}</span>
                    <details class="script-menu asset-menu"><summary :aria-label="translateUi('uiMessages.m62b4af9e3312', { value1: (asset.name) })">···</summary><div class="script-menu-panel"><button :disabled="locked" @click="openBatch('asset',[asset.id])">{{ translateUi('uiMessages.mbe45dd801ce6') }}</button><button :disabled="locked || uploading" @click="uploadFor(asset.id)">{{ translateUi('canvas.imageNode.uploadImage') }}</button><button :disabled="locked" @click="openPicker(asset,'canvas')">{{ translateUi('uiMessages.m697900a715dc') }}</button><button :disabled="locked" @click="openPicker(asset,'library')">{{ translateUi('uiMessages.mdd869ae09f67') }}</button><button :disabled="!asset.nodeId" @click="jump(asset.nodeId)">{{ translateUi('uiMessages.m42b8c3768549') }}</button><button :disabled="locked || !asset.imageUrl" @click="saveToLibrary(asset)">{{ translateUi('uiMessages.md2eec2d05093') }}</button><button :disabled="locked || !asset.imageUrl" @click="asset.imageUrl=''; asset.nodeId=''; save()">{{ translateUi('uiMessages.maff636eb860b') }}</button><button class="danger" :disabled="locked" @click="deleteAsset(asset.id)">{{ translateUi('uiMessages.m54ae88b23561') }}</button></div></details>
                    <div class="asset-picture-actions"><button :disabled="locked || !!asset.imageUrl" @click="openBatch('asset',[asset.id])">{{ translateUi('uiMessages.mf37df9a5a44f') }}</button><button :disabled="locked || uploading" @click="uploadFor(asset.id)">{{ asset.imageUrl ? translateUi('uiMessages.mdbc39d0565e7') : translateUi('directorStudio.panorama.upload') }}</button></div>
                  </div>
                  <input v-model="asset.name" :disabled="locked" :aria-label="translateUi('uiMessages.m0a5602acf307')" @change="save">
                  <details class="asset-description"><summary :title="asset.description">{{ asset.description || translateUi('uiMessages.m7db08bc14987') }}</summary><textarea v-model="asset.description" :disabled="locked" rows="5" :placeholder="translateUi('uiMessages.ma331bb8df536')" @change="save"/></details>
                </article>
                <button class="asset-add" :disabled="locked" @click="addAsset(type)"><span>＋</span>{{ translateUi('uiMessages.m16041626cfb5', { value1: (label) }) }}</button>
              </div>
            </section>
          </div>
        </template>
        <footer class="script-footer">
          <div v-if="step!==2"><button class="add-shot" :disabled="locked" @click="addShot">{{ translateUi('uiMessages.m43d99b5ba1a9') }}</button><span>{{ translateUi('uiMessages.m4fd40b69aa23', { value1: (selected.length ? translateUi('uiMessages.m85b697e8d522', { value1: (selected.length) }) : translateUi('uiMessages.m2428420e407f')), value2: (doc.shots.length), value3: (totalSeconds) }) }}</span></div>
          <div v-else><span class="asset-status">{{ readyAssets === doc.assets.length ? translateUi('uiMessages.mac92a2147442') : translateUi('uiMessages.m0f8d99a544cb', { value1: (doc.assets.length-readyAssets) }) }}</span><button :disabled="locked" @click="props.engine.syncMedia()">{{ translateUi('uiMessages.m91999d130dcd') }}</button></div>
          <div>
            <template v-if="steps===3"><button @click="download">{{ translateUi('uiMessages.mb5b326b81183') }}</button><button :disabled="locked" @click="openBatch('image',selected.length?selected:null)">{{ translateUi('uiMessages.m72a76fbe9d63') }}</button><button :disabled="locked" @click="openBatch('video',selected.length?selected:null)">{{ translateUi('uiMessages.m86cf9a2d60b7') }}</button></template>
            <button v-if="step===1" class="primary" :disabled="locked || !doc.shots.length" @click="confirmShots">{{ translateUi('uiMessages.m04f62d299289') }}</button>
            <button v-if="step===2 && readyAssets<doc.assets.length" class="primary" :disabled="locked" @click="openBatch('asset')">{{ translateUi('uiMessages.m5d772c04fa95') }}</button>
            <button v-if="step===2 && readyAssets===doc.assets.length" class="primary" :disabled="locked || steps<2" @click="step=3; openSynthesis()">{{ translateUi('uiMessages.mba553d2c5bac') }}</button>
            <button v-if="step===3" class="primary" :disabled="locked" @click="openSynthesis(selected.length?selected:null)">{{ readyPrompts===doc.shots.length ? translateUi('uiMessages.me97d3c36cecf') : translateUi('uiMessages.m9318e87180ff') }}</button>
          </div>
        </footer>
        <input ref="uploadInput" type="file" accept="image/*" hidden @change="upload">
      </section>
      <div v-if="promptShot" class="script-sub-overlay"><section class="script-dialog" role="dialog" aria-modal="true" :aria-label="translateUi('uiMessages.ma65c884a665a')"><div class="script-toolbar"><h3>{{ translateUi('uiMessages.m08fac48cfb11', { value1: (doc.shots.indexOf(promptShot)+1) }) }}</h3><button @click="promptShotId=''">✕</button></div><label>{{ translateUi('uiMessages.mef63bb0ae372') }} <span v-if="promptShot.imagePrompt" class="prompt-ready">{{ translateUi('uiMessages.m402a879f1048') }}</span><small class="autosave-label">{{ translateUi('canvas.autoSave') }}</small><textarea v-model="promptShot.imagePrompt" rows="10" :disabled="locked" @change="save"/></label><label>{{ translateUi('uiMessages.m82c6cb9be385') }} <span v-if="promptShot.videoPrompt" class="prompt-ready">{{ translateUi('uiMessages.m402a879f1048') }}</span><small class="autosave-label">{{ translateUi('canvas.autoSave') }}</small><textarea v-model="promptShot.videoPrompt" rows="12" :disabled="locked" @change="save"/></label><div class="script-toolbar"><small>{{ translateUi('uiMessages.mca62aa13bfae') }}</small><button :disabled="locked || steps < 2" @click="openSynthesis([promptShot.id]); promptShotId=''">{{ translateUi('uiMessages.m7e8d4e584171') }}</button></div></section></div>
      <div v-if="batch" class="script-sub-overlay"><section class="script-dialog wide batch-dialog" role="dialog" aria-modal="true" :aria-label="translateUi('uiMessages.m013b1fa3e18d')"><div class="script-toolbar"><h3>{{ batch.kind === 'synthesis' ? translateUi('uiMessages.m35897e019f2c') : batch.kind === 'asset' ? translateUi('uiMessages.mbdbff96f0218') : batch.kind === 'video' ? translateUi('uiMessages.m86cf9a2d60b7') : translateUi('uiMessages.m72a76fbe9d63') }}</h3><button @click="batch=null">✕</button></div><p>{{ batch.kind === 'synthesis' ? translateUi('uiMessages.m7ef1736b803b') : translateUi('uiMessages.mabea9e706334') }}</p><button @click="batchSelection=batchSelection.length?[]:batchItems.filter(i=>!i.done).map(i=>i.id)">{{ translateUi('uiMessages.m6ea222cd9ecb') }}</button><div class="batch-list"><article v-for="item in batchItems" :key="item.id"><label><input v-model="batchSelection" type="checkbox" :value="item.id" :disabled="item.done">{{ item.name }}<small v-if="item.done">{{ translateUi('uiMessages.m402a879f1048') }}</small></label><details><summary><span>{{ item.prompt || translateUi('uiMessages.me5b1e8b48012') }}</span><b>{{ translateUi('uiMessages.m979a332955c8') }}</b></summary><textarea v-model="item.prompt" rows="4" :disabled="item.done || batch.kind === 'synthesis'"/></details></article></div>
        <div v-if="batch.kind === 'synthesis'" class="batch-options"><div class="synthesis-modes"><label><input v-model="synthesisMode" type="radio" value="smart">{{ translateUi('uiMessages.mcf7aa7d0a510') }}</label><label><input v-model="synthesisMode" type="radio" value="automatic">{{ translateUi('uiMessages.mabf73ac70bf1') }}</label></div><label v-if="synthesisMode==='smart'">{{ translateUi('uiMessages.mc4bc3f9747f4') }}<select v-model="modelId"><option v-for="model in config?.models || []" :key="model.id" :value="model.id">{{ model.name }}</option></select></label><span>{{ synthesisMode === 'smart' ? translateUi('uiMessages.mcc8c818ec649', { value1: (config?.synthesize_cost || 0) }) : translateUi('uiMessages.me70eb7cbd40a') }}</span></div>
        <div v-else class="batch-options"><label>{{ translateUi('canvas.historyPanel.model') }}<select v-if="batch.kind==='video'" v-model="videoModel"><option v-for="m in videoModels" :key="m.value" :value="m.value">{{ m.label || m.value }}</option></select><select v-else v-model="imageModel"><option v-for="m in imageModels" :key="m.value" :value="m.value">{{ m.label || m.value }}</option></select></label><label v-if="batch.kind!=='video'">{{ translateUi('directorStudio.inspector.resolution') }}<select v-model="size"><option v-for="o in resolutions" :key="o.value">{{ o.value }}</option></select></label><label>{{ translateUi('directorStudio.inspector.aspect') }}<select v-model="ratio"><option v-for="value in ratios" :key="value">{{ value }}</option></select></label><label v-if="batch.kind!=='video'">{{ translateUi('uiMessages.m55847d2e5bed') }}<select v-model="quality"><option value="auto">{{ translateUi('uiMessages.m844b8cc8dff7') }}</option><option value="standard">{{ translateUi('directorStudio.cameraPresets.standard') }}</option><option value="high">{{ translateUi('uiMessages.mb1c27820fec2') }}</option></select></label><label v-else>{{ translateUi('uiMessages.m4e0221b19771') }}<select v-model="duration"><option v-for="value in videoDurations" :key="value" :value="value">{{ translateUi('uiMessages.mf1530240cab6', { value1: (value) }) }}</option></select></label></div>
        <div class="script-toolbar"><span>{{ translateUi('uiMessages.m797ced5cddf3', { value1: (batchSelection.length), value2: (batch.kind==='synthesis' ? '' : batch.kind==='video' ? translateUi('uiMessages.m4438bc49b8b1') : translateUi('uiMessages.m0016ccb4a2d8', { value1: (imageEstimate) })) }) }}</span><button class="primary" :disabled="locked || !batchSelection.length || batch.kind==='synthesis' && synthesisMode==='smart' && (!config?.enabled || !modelId)" @click="submitBatch">{{ batch.kind==='synthesis' ? translateUi('uiMessages.m85689f08b0b2') : translateUi('canvas.startGenerate') }}</button></div>
      </section></div>
      <div v-if="picker" class="script-sub-overlay"><section class="script-dialog wide" role="dialog" aria-modal="true" :aria-label="translateUi('uiMessages.mb416b2989bad')"><div class="script-toolbar"><h3>{{ picker.source==='canvas'?translateUi('uiMessages.m4d7c7458dd75'):translateUi('uiMessages.mbe956cababf7') }}</h3><button @click="picker=null">✕</button></div><p v-if="pickerLoading">{{ translateUi('uiMessages.m4927a53bcc88') }}</p><p v-else-if="!pickerItems.length">{{ translateUi('uiMessages.mdae1dcca6df2') }}</p><div class="picker-grid"><button v-for="item in pickerItems" :key="item.id" @click="choosePicture(item)"><img :src="item.url" :alt="item.name"><span>{{ item.name }}</span></button></div></section></div>
    </div>
  </Teleport>
</template>
<style src="./script.css"></style>
