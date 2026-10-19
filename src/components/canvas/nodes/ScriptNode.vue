<script setup>
import { ref, computed, inject, unref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { blankScript } from '@/utils/scriptDocument'
import ScriptEditor from '../script/ScriptEditor.vue'
import { useScriptDocument } from '../script/useScriptDocument'
const props = defineProps({ id: String, data: { type: Object, default: () => ({}) }, selected: Boolean })
const readonlyPreview = inject('canvasReadonlyPreview', false)
const readonly = computed(() => unref(readonlyPreview) || props.data.readonly === true)
const engine = useScriptDocument(props.id), opened = ref(false), initialAction = ref('')
const summary = computed(() => props.data.scriptSummary || { shots: 0, assets: 0, seconds: 0, steps: 0 })
async function open(entry, action = '') {
  initialAction.value = action
  if (readonly.value) {
    engine.document.value = JSON.parse(JSON.stringify(props.data.scriptDocument || blankScript()))
    engine.loaded.value = true
    opened.value = true
    return
  }
  opened.value = true
  if (!engine.loaded.value) await engine.load()
  if (entry && engine.loaded.value && !engine.document.value.shots.length) await engine.createSource(entry)
}
</script>
<template>
  <section class="script-node" :class="{selected}" @dblclick.stop="open()">
    <header><span>▤</span><strong>{{ data.title || '脚本' }}</strong><b>NEW</b></header>
    <Handle id="input" type="target" :position="Position.Left" :connectable="!readonly" />
    <div v-if="summary.shots" class="script-node-summary nodrag nopan" @click="open()"><span>{{ summary.shots }}<small>镜头</small></span><span>{{ summary.assets }}<small>资产</small></span><span>{{ summary.seconds }}<small>秒</small></span></div>
    <div v-else class="script-node-empty nodrag nopan"><p>尝试：</p><button :disabled="readonly" @click="open('story')">剧本生成分镜脚本 →</button><button :disabled="readonly" @click="open('character')">角色生成分镜脚本 →</button><button :disabled="readonly" @click="open('manual')">自己编写分镜脚本 →</button></div>
    <div class="script-node-steps"><span v-for="(name,index) in ['确认镜头','准备资产','合成提示词']" :key="name" :class="{done:summary.steps>index}">{{ summary.steps>index?'✓':index+1 }} {{ name }}</span></div>
    <p v-if="engine.running.value" role="status">正在分析脚本，关闭详情后仍会继续…</p>
    <p v-if="engine.mediaBusy.value" role="status">{{ engine.mediaProgress.value }}</p>
    <p v-if="engine.error.value" class="script-node-error">{{ engine.error.value }}</p>
    <button class="script-node-open nodrag nopan" @click="open()">{{ summary.shots ? '打开脚本' : '创建脚本' }} <small>{{ summary.steps }}/3</small></button>
    <div v-if="summary.shots" class="script-node-quick nodrag nopan"><button :disabled="readonly" @click="open(null,'regenerate')">重新生成</button><button :disabled="readonly || summary.steps < 3" @click="open(null,'image')">批量分镜</button><button :disabled="readonly || summary.steps < 3" @click="open(null,'video')">批量视频</button><button :disabled="summary.steps < 3" @click="open(null,'download')">下载</button></div>
    <Handle id="output" type="source" :position="Position.Right" :connectable="!readonly" />
    <ScriptEditor v-if="opened" :engine="engine" :node-id="id" :readonly="readonly" :initial-action="initialAction" @close="opened=false" />
  </section>
</template>
<style scoped>
.script-node{width:380px;border:1px solid var(--canvas-border,#444);border-radius:16px;padding:18px;background:var(--canvas-node-bg,#252525);color:var(--canvas-text,#eee);font-size:12px;box-shadow:0 6px 24px #0002}.script-node.selected{border-color:#91becd;box-shadow:0 0 0 1px #91becd}.script-node header{display:flex;gap:8px;align-items:center}.script-node header>span{font-size:21px}.script-node strong{font-size:15px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.script-node header b{font-size:9px;color:#b6d9e3;background:#344950;border-radius:4px;padding:3px 5px}.script-node-empty{padding:20px 0 12px}.script-node-empty p{color:#888}.script-node-empty button{display:block;background:transparent;border:0;padding:7px 0;color:#b7c9ce;cursor:pointer}.script-node-steps{display:flex;justify-content:space-between;font-size:10px;color:#777;margin:18px 0}.script-node-steps .done{color:#96c9ac}.script-node-open{width:100%;padding:10px;border:0;border-radius:8px;color:#263239;background:#e6edf0;cursor:pointer;font-weight:600}.script-node-open small{margin-left:10px;color:#687b84}.script-node-summary{display:flex;justify-content:space-around;padding:32px 0;cursor:pointer}.script-node-summary span{font-size:26px}.script-node-summary small{display:block;text-align:center;font-size:11px;color:#888}.script-node-error{color:#f5aaaa;overflow-wrap:anywhere}.script-node-quick{display:flex;gap:5px;margin-top:10px}.script-node-quick button{flex:1;padding:5px 4px;border:1px solid var(--canvas-border,#444);border-radius:6px;background:transparent;color:inherit;font-size:10px;cursor:pointer}.script-node button:disabled{opacity:.4;cursor:not-allowed}
</style>
