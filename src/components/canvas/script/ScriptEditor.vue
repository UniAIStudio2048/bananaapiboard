<script setup>
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
  if (!doc.value.shots.length || doc.value.shots.some(s => !s.description.trim())) { error.value = '请填写每个镜头的画面描述'; return }
  doc.value.confirmed = true
  try { await props.engine.save(); step.value = 2 } catch {}
}
function addAsset(type) {
  const asset = { id: `asset_${crypto.randomUUID()}`, type, name: `新${assetLabels[type]}`, description: '', imageUrl: '', nodeId: '', inferred: false }
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
  batch.value = { kind: 'synthesis', items: doc.value.shots.filter(s => !ids || ids.includes(s.id)).map((s,i) => ({ id: s.id, name: `镜头 ${doc.value.shots.indexOf(s)+1}`, prompt: s.description })) }
  batchSelection.value = batch.value.items.map(i => i.id)
}
function openBatch(kind, ids) {
  const records = kind === 'asset' ? doc.value.assets : doc.value.shots
  batch.value = { kind, items: records.filter(s => !ids || ids.includes(s.id)).map((s,i) => ({ id: s.id, name: kind === 'asset' ? s.name : `镜头 ${records.indexOf(s)+1}`, prompt: kind === 'asset' ? assetPrompt(s, doc.value.style) : kind === 'video' ? s.videoPrompt : s.imagePrompt, done: !!(kind === 'video' ? s.videoUrl : s.imageUrl) })) }
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
  if (!options.model || items.some(i => !i.prompt.trim())) { error.value = '请选择模型并填写提示词'; return }
  batch.value = null
  await props.engine.batchMedia(kind, items, options)
}
async function openPicker(asset, source) {
  picker.value = { assetId: asset?.id || '', source }; pickerItems.value = []; pickerLoading.value = true
  try {
    if (source === 'canvas') pickerItems.value = store.nodes.filter(n => /image/.test(n.type) && (n.data.output?.url || n.data.imageUrl || n.data.url)).map(n => ({ id: n.id, name: n.data.title || '画布图片', url: n.data.output?.url || n.data.imageUrl || n.data.url, nodeId: n.id }))
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
    if (!result.url) throw new Error('上传未返回地址')
    const asset = doc.value.assets.find(a => a.id === uploadAssetId.value)
    if (asset) await props.engine.attachAssetPicture(asset, result.url)
    else if (doc.value.referenceImages.length < 12) { doc.value.referenceImages.push(result.url); await props.engine.save() }
  } catch (e) { error.value = e.message } finally { uploading.value = false }
}
function uploadFor(id = '') { uploadAssetId.value = id; uploadInput.value.click() }
async function saveToLibrary(asset) {
  try { await saveAsset({ type: 'image', name: asset.name, url: asset.imageUrl, content: asset.description, source_node_id: asset.nodeId || props.nodeId, tags: ['脚本', assetLabels[asset.type]] }); error.value = ''; assetNotice.value = `${asset.name} 已保存到个人资产库` } catch (e) { error.value = e.message }
}
const assetNotice = ref('')
function jump(nodeId) { const node = store.nodes.find(n => n.id === nodeId); if (!node) { error.value = '关联节点已删除'; return } flow.fitView({ nodes: [nodeId], duration: 300, maxZoom: 1 }); emit('close') }
function close() { if (saving.value) { error.value = '正在保存，请稍候'; return } emit('close') }
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
      <section class="script-editor" role="dialog" :aria-modal="!batch && !picker && !promptShot" :inert="batch || picker || promptShot ? true : undefined" aria-label="新版脚本编辑器">
        <header class="script-header">
          <div><span class="script-eyebrow">SCRIPT · 新版脚本</span><input v-model="doc.title" class="script-title" aria-label="脚本名称" :disabled="locked" @change="save"><small>{{ doc.shots.length }} 镜头 · {{ totalSeconds }} 秒 · {{ steps }}/3 已完成</small></div>
          <div class="script-actions"><span>{{ saving ? '保存中…' : error ? '请检查保存状态' : loaded ? '已同步至云端' : '加载中…' }}</span><button :disabled="busy || readonly || saving" @click="props.engine.load()">重新加载</button><button aria-label="关闭脚本编辑器" @click="close">✕</button></div>
        </header>
        <nav class="script-steps" aria-label="脚本步骤">
          <button v-for="(name,index) in ['确认镜头','准备资产','合成提示词']" :key="name" :class="{ active: step === index + 1, complete: steps > index }" :disabled="index > 0 && !doc.confirmed || index > 1 && steps < 2" @click="step = index + 1"><b>{{ steps > index ? '✓' : index + 1 }}</b>{{ name }}</button>
        </nav>
        <div v-if="error" class="script-error" role="alert">{{ error }}</div>
        <div v-if="running || mediaBusy" class="script-progress" role="status"><span>{{ running ? (task.status === 'queued' ? '等待模型处理…' : '正在分析，请稍候。关闭窗口后任务仍继续。') : mediaProgress }}</span><button v-if="running && !readonly" @click="props.engine.cancel()">取消分析</button><button v-if="mediaBusy" @click="props.engine.stopBatch()">完成当前项后停止</button></div>
        <div v-if="loading" class="script-empty">正在加载脚本…</div>
        <template v-else>
          <div v-if="!doc.shots.length && !inputOpen" class="script-empty">
            <h2>从故事到分镜，让创意落到每一镜</h2><p>选择创建方式，镜头、资产与提示词将保存在这个独立脚本节点中。</p>
            <div class="script-entry"><button :disabled="locked" @click="entry('story')">▤ 剧本生成分镜脚本<small>连接文本，保留剧情与对白</small></button><button :disabled="locked" @click="entry('character')">♙ 角色生成分镜脚本<small>选择角色参考，补充故事要求</small></button><button :disabled="locked" @click="entry('manual')">✎ 自己编写分镜脚本<small>从空镜头表开始</small></button></div>
          </div>
          <template v-else-if="step === 1 || step === 3">
            <div class="script-toolbar"><div><button v-if="step === 1" :disabled="locked" @click="inputOpen = !inputOpen">{{ inputOpen ? '收起剧本' : '原文 / 重新生成' }}</button><button v-if="step === 1" :disabled="locked" @click="addShot">＋ 添加镜头</button><button v-if="step === 3" :disabled="locked" @click="openSynthesis(selected.length ? selected : null)">合成最终提示词</button><button @click="selectAll">{{ selected.length === doc.shots.length ? '取消全选' : '全选镜头' }}</button></div><small>点击单元格编辑 · 失焦保存 · 拖动镜号排序</small></div>
            <div v-if="inputOpen" class="script-input-area">
              <label>剧本 / 角色故事<textarea v-model="doc.sourceText" :disabled="locked" rows="7" maxlength="100000" placeholder="粘贴完整剧本，也可从左侧连接文本节点" @change="save" /></label>
              <label>补充要求<textarea v-model="doc.requirements" :disabled="locked" rows="2" placeholder="分镜数量、节奏、保留原镜头等要求" @change="save" /></label>
              <div class="script-toolbar"><div><button :disabled="locked || uploading" @click="uploadFor()">＋ 上传参考图</button><button :disabled="locked" @click="openPicker(null, 'canvas')">从画布选择</button><button :disabled="locked" @click="props.engine.createSource(doc.entry)">读取输入连线</button></div><small>{{ doc.sourceText.length }} 字符 · 最多12张参考图</small></div>
              <div class="script-references"><div v-for="(url,i) in doc.referenceImages" :key="url"><img :src="url" alt="参考图"><button :disabled="locked" @click="doc.referenceImages.splice(i,1); save()">×</button></div></div>
              <div class="script-toolbar"><select v-model="modelId" aria-label="脚本分析模型" :disabled="locked"><option value="">选择脚本模型</option><option v-for="model in config?.models || []" :key="model.id" :value="model.id">{{ model.name }}</option></select><span v-if="!config?.enabled">请在租户高级配置–脚本中启用模型</span><button class="primary" :disabled="locked || !config?.enabled || !modelId" @click="generate">{{ doc.shots.length ? '重新生成（覆盖镜头和资产）' : '生成分镜脚本' }} · {{ config?.generate_cost || 0 }} 积分</button></div>
            </div>
            <div v-if="doc.shots.length" class="script-table-wrap">
              <table class="script-table"><thead><tr><th>镜号</th><th>时长</th><th>画面描述 / 资产引用</th><th>景别</th><th>光影氛围</th><th>对白 / 旁白</th><th>音效</th><th>运镜</th><th>最终提示词</th><th>操作</th></tr></thead>
                <tbody><tr v-for="(shot,index) in doc.shots" :key="shot.id" :data-color="shot.color" @dragover.prevent @drop.prevent="moveShot(dragged,shot.id)">
                  <td><span :draggable="!locked" class="drag-handle" @dragstart="dragged=shot.id">⠿ {{ index + 1 }}</span><input v-model="selected" type="checkbox" :value="shot.id" :aria-label="`选择镜头${index+1}`"></td>
                  <td><input v-model.number="shot.duration" type="number" min="5" max="15" :disabled="locked" :aria-label="`镜头${index+1}时长`" @change="editShots"><small>秒</small></td>
                  <td><textarea v-model="shot.description" :disabled="locked" rows="4" :aria-label="`镜头${index+1}画面描述`" @change="editShots"/><details><summary>引用资产（{{ shot.assetIds.length }}）</summary><label v-for="a in doc.assets" :key="a.id" class="asset-reference"><input type="checkbox" :checked="shot.assetIds.includes(a.id)" :disabled="locked" @change="toggleRef(shot,a.id)"><span :data-type="a.type">@{{ a.name }}</span></label></details></td>
                  <td><select v-model="shot.scale" :disabled="locked" @change="editShots"><option v-for="scale in ['大远景','远景','全景','中景','近景','特写','大特写']" :key="scale">{{ scale }}</option><option v-if="!['大远景','远景','全景','中景','近景','特写','大特写'].includes(shot.scale)">{{ shot.scale }}</option></select></td>
                  <td><textarea v-model="shot.lighting" :disabled="locked" rows="3" @change="editShots"/></td>
                  <td><div v-for="(line,i) in shot.dialogue" :key="i" class="dialogue-line"><input v-model="line.speaker" :disabled="locked" placeholder="角色 / 旁白" @change="editShots"><textarea v-model="line.text" :disabled="locked" rows="2" placeholder="对白" @change="editShots"/><button :disabled="locked" @click="shot.dialogue.splice(i,1); editShots()">删除对白</button></div><button :disabled="locked" @click="shot.dialogue.push({speaker:'',text:''}); editShots()">＋ 对白</button></td>
                  <td><textarea v-model="shot.audio" :disabled="locked" rows="3" @change="editShots"/></td><td><textarea v-model="shot.camera" :disabled="locked" rows="3" @change="editShots"/></td>
                  <td><button :disabled="!shot.imagePrompt && !shot.videoPrompt && step!==3" @click="promptShotId=shot.id">{{ shot.imagePrompt && shot.videoPrompt ? '✓ 查看 / 编辑' : '编辑双提示词' }}</button><img v-if="shot.imageUrl" class="shot-preview" :src="shot.imageUrl" alt="分镜图" @click="jump(shot.imageNodeId)"><button v-if="shot.imageUrl" :disabled="locked" @click="shot.imageUrl=''; shot.imageNodeId=''; save()">重置分镜图</button><button v-if="shot.videoUrl" :disabled="locked" @click="shot.videoUrl=''; shot.videoNodeId=''; save()">重置视频</button><video v-if="shot.videoUrl" :src="shot.videoUrl" controls preload="metadata" class="shot-preview"/></td>
                  <td><select v-model="shot.color" :disabled="locked" aria-label="行标记颜色" @change="save"><option value="">无标记</option><option value="red">红色</option><option value="yellow">黄色</option><option value="green">绿色</option><option value="blue">蓝色</option><option value="gray">灰色</option></select><button :disabled="locked || index===0" @click="moveShot(shot.id, doc.shots[index-1].id)">上移</button><button class="danger" :disabled="locked" @click="deleteShot(shot.id)">删除镜头</button></td>
                </tr></tbody>
              </table>
            </div>
          </template>
          <div v-else-if="step === 2" class="script-assets-area">
            <label class="style-field">全局美术风格<textarea v-model="doc.style" :disabled="locked" rows="2" placeholder="例如：二维国风动画，柔和光照，统一人物比例" @change="save"/><small>修改风格后，已有图片和提示词不会自动重生成，请按需重新生成。</small></label>
            <div class="script-toolbar"><span>{{ doc.assets.filter(a=>a.imageUrl).length }} / {{ doc.assets.length }} 个资产有图片</span><div><button :disabled="locked" @click="props.engine.syncMedia()">刷新生成结果</button><button class="primary" :disabled="locked || !doc.assets.length" @click="openBatch('asset')">批量生成资产</button></div></div>
            <p v-if="assetNotice" role="status">{{ assetNotice }}</p>
            <section v-for="(label,type) in assetLabels" :key="type" class="asset-section"><div class="script-toolbar"><h3>{{ label }} <small>{{ doc.assets.filter(a=>a.type===type).length }}</small></h3><button :disabled="locked" @click="addAsset(type)">＋ 添加{{ label }}</button></div>
              <div class="asset-grid"><article v-for="asset in doc.assets.filter(a=>a.type===type)" :key="asset.id" class="asset-card"><div class="asset-picture"><img v-if="asset.imageUrl" :src="asset.imageUrl" :alt="asset.name"><span v-else>尚未生成图片</span><span v-if="asset.inferred" class="inferred">设定补全</span></div><input v-model="asset.name" :disabled="locked" aria-label="资产名称" @change="save"><textarea v-model="asset.description" :disabled="locked" rows="4" placeholder="资产描述 / 生成提示词" @change="save"/><div class="asset-buttons"><button :disabled="locked" @click="openBatch('asset',[asset.id])">AI生成</button><button :disabled="locked || uploading" @click="uploadFor(asset.id)">上传</button><button :disabled="locked" @click="openPicker(asset,'canvas')">画布选图</button><button :disabled="locked" @click="openPicker(asset,'library')">个人资产库</button><button :disabled="!asset.nodeId" @click="jump(asset.nodeId)">跳转节点</button><button :disabled="locked || !asset.imageUrl" @click="saveToLibrary(asset)">保存资产</button><button :disabled="locked || !asset.imageUrl" @click="asset.imageUrl=''; asset.nodeId=''; save()">清除图片</button><button class="danger" :disabled="locked" @click="deleteAsset(asset.id)">删除</button></div></article></div>
            </section>
          </div>
        </template>
        <footer class="script-footer"><span>{{ props.readonly ? '只读预览' : '图片与视频按所选模型实际价格计费；自动拼接免费' }}</span><div><button :disabled="steps < 3" @click="download">下载 CSV</button><button :disabled="locked || steps < 3" @click="openBatch('image',selected.length?selected:null)">批量生成分镜</button><button :disabled="locked || steps < 3" @click="openBatch('video',selected.length?selected:null)">批量生视频</button><button v-if="step===1" class="primary" :disabled="locked || !doc.shots.length" @click="confirmShots">下一步：准备资产 →</button><button v-if="step===2" class="primary" :disabled="locked || steps < 2" @click="step=3; openSynthesis()">下一步：合成提示词 →</button></div></footer>
        <input ref="uploadInput" type="file" accept="image/*" hidden @change="upload">
      </section>
      <div v-if="promptShot" class="script-sub-overlay"><section class="script-dialog" role="dialog" aria-modal="true" aria-label="最终提示词"><div class="script-toolbar"><h3>镜头 {{ doc.shots.indexOf(promptShot)+1 }} · 最终提示词</h3><button @click="promptShotId=''">✕</button></div><label>分镜图提示词<textarea v-model="promptShot.imagePrompt" rows="10" :disabled="locked" @change="save"/></label><label>视频运动提示词<textarea v-model="promptShot.videoPrompt" rows="12" :disabled="locked" @change="save"/></label><div class="script-toolbar"><small>修改后自动保存</small><button :disabled="locked || steps < 2" @click="openSynthesis([promptShot.id]); promptShotId=''">重新合成此镜头</button></div></section></div>
      <div v-if="batch" class="script-sub-overlay"><section class="script-dialog wide" role="dialog" aria-modal="true" aria-label="批量生成配置"><div class="script-toolbar"><h3>{{ batch.kind === 'synthesis' ? '合成最终提示词' : batch.kind === 'asset' ? '批量生成资产' : batch.kind === 'video' ? '批量生视频' : '批量生成分镜' }}</h3><button @click="batch=null">✕</button></div><p>{{ batch.kind === 'synthesis' ? '将覆盖所选镜头的双提示词，未选择镜头保持原内容。' : '默认只选择未完成项。已有结果不会重复生成；需要重做时请先清除对应结果。' }}</p><button @click="batchSelection=batchSelection.length?[]:batchItems.filter(i=>!i.done).map(i=>i.id)">全选 / 取消全选</button><div class="batch-list"><article v-for="item in batchItems" :key="item.id"><label><input v-model="batchSelection" type="checkbox" :value="item.id" :disabled="item.done">{{ item.name }} {{ item.done ? '✓ 已生成' : '' }}</label><textarea v-model="item.prompt" rows="3" :disabled="item.done || batch.kind === 'synthesis'"/></article></div>
        <div v-if="batch.kind === 'synthesis'" class="batch-options"><label>方式<select v-model="synthesisMode"><option value="smart">智能合成</option><option value="automatic">自动拼接 · 免费</option></select></label><label v-if="synthesisMode==='smart'">LLM模型<select v-model="modelId"><option v-for="model in config?.models || []" :key="model.id" :value="model.id">{{ model.name }}</option></select></label><span>{{ synthesisMode === 'smart' ? `${config?.synthesize_cost || 0} 积分 / 次` : '0 积分' }}</span></div>
        <div v-else class="batch-options"><label>模型<select v-if="batch.kind==='video'" v-model="videoModel"><option v-for="m in videoModels" :key="m.value" :value="m.value">{{ m.label || m.value }}</option></select><select v-else v-model="imageModel"><option v-for="m in imageModels" :key="m.value" :value="m.value">{{ m.label || m.value }}</option></select></label><label v-if="batch.kind!=='video'">分辨率<select v-model="size"><option v-for="o in resolutions" :key="o.value">{{ o.value }}</option></select></label><label>比例<select v-model="ratio"><option v-for="value in ratios" :key="value">{{ value }}</option></select></label><label v-if="batch.kind!=='video'">质量<select v-model="quality"><option value="auto">默认</option><option value="standard">标准</option><option value="high">高</option></select></label><label v-else>生成时长<select v-model="duration"><option v-for="value in videoDurations" :key="value" :value="value">{{ value }}秒</option></select></label></div>
        <div class="script-toolbar"><span>{{ batchSelection.length }} 项 · {{ batch.kind==='synthesis' ? '' : batch.kind==='video' ? '按所选视频模型价格结算' : `参考费用 ${imageEstimate} 积分（实际以模型、质量及账户倍率为准）` }}</span><button class="primary" :disabled="locked || !batchSelection.length || batch.kind==='synthesis' && synthesisMode==='smart' && (!config?.enabled || !modelId)" @click="submitBatch">{{ batch.kind==='synthesis' ? '开始合成' : '开始生成' }}</button></div>
      </section></div>
      <div v-if="picker" class="script-sub-overlay"><section class="script-dialog wide" role="dialog" aria-modal="true" aria-label="选择资产图片"><div class="script-toolbar"><h3>{{ picker.source==='canvas'?'从画布选择图片':'个人图片资产库' }}</h3><button @click="picker=null">✕</button></div><p v-if="pickerLoading">加载中…</p><p v-else-if="!pickerItems.length">暂无可选择的图片</p><div class="picker-grid"><button v-for="item in pickerItems" :key="item.id" @click="choosePicture(item)"><img :src="item.url" :alt="item.name"><span>{{ item.name }}</span></button></div></section></div>
    </div>
  </Teleport>
</template>
<style src="./script.css"></style>
