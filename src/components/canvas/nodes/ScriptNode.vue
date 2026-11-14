<script setup>
import { t as translateUi } from '@/i18n'

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
    <header><span>▤</span><strong>{{ data.title || translateUi('uiMessages.m5d4f709636ee') }}</strong><b>{{ translateUi('uiMessages.m8e0edcbfe247') }}</b></header>
    <Handle id="input" type="target" :position="Position.Left" :connectable="!readonly" />
    <div v-if="summary.shots" class="script-node-summary nodrag nopan" @click="open()"><span>{{ summary.shots }}<small>{{ translateUi('directorStudio.inspector.camera') }}</small></span><span>{{ summary.assets }}<small>{{ translateUi('canvas.assetPanel.directory.assetsTab') }}</small></span><span>{{ summary.seconds }}<small>{{ translateUi('auth.secondsLater') }}</small></span></div>
    <div v-else class="script-node-empty nodrag nopan"><p>{{ translateUi('uiMessages.mcc70740f26cc') }}</p><button :disabled="readonly" @click="open('story')">{{ translateUi('uiMessages.me5d451a8cef6') }}</button><button :disabled="readonly" @click="open('character')">{{ translateUi('uiMessages.m19c4a1a667b9') }}</button><button :disabled="readonly" @click="open('manual')">{{ translateUi('uiMessages.md90e44f82689') }}</button></div>
    <div class="script-node-steps"><span v-for="(name,index) in ['确认镜头','准备资产','合成提示词']" :key="name" :class="{done:summary.steps>index}"><i>{{ summary.steps>index?'✓':index+1 }}</i>{{ name }}</span></div>
    <p v-if="engine.running.value" role="status">{{ translateUi('uiMessages.m6cbe3f355d2f') }}</p>
    <p v-if="engine.mediaBusy.value" role="status">{{ engine.mediaProgress.value }}</p>
    <p v-if="engine.error.value" class="script-node-error">{{ engine.error.value }}</p>
    <button class="script-node-open nodrag nopan" @click="open()">{{ summary.shots ? translateUi('uiMessages.m4dc71fd75f0c') : translateUi('uiMessages.m162d3c68a7f3') }} <small>{{ summary.steps }}/3</small></button>
    <div v-if="summary.shots" class="script-node-quick nodrag nopan"><button :disabled="readonly" @click="open(null,'regenerate')">{{ translateUi('imageGen.regenerate') }}</button><button :disabled="readonly || summary.steps < 3" @click="open(null,'image')">{{ translateUi('uiMessages.m8aeaf0d56e96') }}</button><button :disabled="readonly || summary.steps < 3" @click="open(null,'video')">{{ translateUi('uiMessages.mb09533be27d8') }}</button><button :disabled="summary.steps < 3" @click="open(null,'download')">{{ translateUi('common.download') }}</button></div>
    <Handle id="output" type="source" :position="Position.Right" :connectable="!readonly" />
    <ScriptEditor v-if="opened" :engine="engine" :node-id="id" :readonly="readonly" :initial-action="initialAction" @close="opened=false" />
  </section>
</template>
<style scoped>
.script-node { width:380px; border:1px solid var(--canvas-border-default,#3a3a3a); border-radius:12px; background:var(--canvas-bg-tertiary,#1a1a1a); color:var(--canvas-text-primary,#fff); font-size:12px; box-shadow:0 4px 20px #0002; overflow:hidden; }
.script-node.selected { border-color:var(--canvas-text-secondary,#aaa); box-shadow:0 0 0 1px var(--canvas-text-secondary,#aaa); }
.script-node header { display:flex; align-items:center; gap:9px; padding:14px 16px; border-bottom:1px solid var(--canvas-border-subtle,#2a2a2a); }
.script-node header>span { font-size:19px; color:var(--canvas-text-secondary,#aaa); }
.script-node strong { flex:1; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.script-node header b { font-size:9px; font-weight:400; color:var(--canvas-text-secondary,#aaa); background:var(--canvas-bg-elevated,#242424); padding:2px 6px; border-radius:4px; }
.script-node-empty { padding:24px 20px 12px; }
.script-node-empty p { color:var(--canvas-text-tertiary,#777); font-size:11px; margin-bottom:8px; }
.script-node-empty button { display:block; width:100%; text-align:left; border:0; background:transparent; color:var(--canvas-text-secondary,#aaa); padding:8px 0; cursor:pointer; font-size:12px; }
.script-node-empty button:hover { color:var(--canvas-text-primary,#fff); }
.script-node-steps { display:flex; justify-content:space-between; margin:0 16px 16px; gap:8px; font-size:10px; color:var(--canvas-text-tertiary,#777); }
.script-node-steps span { display:flex; align-items:center; gap:5px; }
.script-node-steps i { display:grid; place-items:center; width:18px; height:18px; font-style:normal; border:1px solid var(--canvas-border-default,#444); border-radius:50%; }
.script-node-steps .done { color:var(--canvas-text-secondary,#aaa); }
.script-node-steps .done i { color:var(--canvas-bg-primary,#141414); background:var(--canvas-text-primary,#fff); border-color:transparent; }
.script-node-open { display:block; width:calc(100% - 32px); margin:0 16px 14px; padding:9px; border:0; border-radius:7px; background:var(--canvas-text-primary,#fff); color:var(--canvas-bg-primary,#141414); cursor:pointer; font-size:12px; font-weight:500; }
.script-node-open small { margin-left:8px; opacity:.55; }
.script-node-summary { display:flex; justify-content:space-around; padding:26px 12px; cursor:pointer; }
.script-node-summary span { font-size:27px; font-weight:400; font-variant-numeric:tabular-nums; }
.script-node-summary small { display:block; font-size:10px; color:var(--canvas-text-tertiary,#777); text-align:center; margin-top:2px; }
.script-node>p { margin:10px 16px; color:var(--canvas-text-secondary,#aaa); }
.script-node>p.script-node-error { color:#eaa0a0; overflow-wrap:anywhere; }
.script-node-quick { display:flex; border-top:1px solid var(--canvas-border-subtle,#2a2a2a); padding:7px 8px; gap:2px; }
.script-node-quick button { flex:1; padding:5px 3px; font-size:10px; background:transparent; border:0; border-radius:4px; color:var(--canvas-text-secondary,#aaa); cursor:pointer; }
.script-node-quick button:hover { background:var(--canvas-bg-elevated,#242424); }
.script-node button:disabled { opacity:.4; cursor:not-allowed; }
</style>
