import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'
import { mergeBreakdownResult } from '../../../utils/videoBreakdown.js'

const source=await readFile(new URL('./VideoBreakdownNode.vue',import.meta.url),'utf8')
const script=parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm,'')
function fixture(status='error') {
  const mounted=[],calls=[],saves=[]
  const props={id:'b',data:{status,breakdownTaskId:'task'}}
  const store={nodes:[{id:'b',version:10,data:{...props.data}}],edges:[],getCurrentTab:()=>({id:'tab',workflowId:'wf',name:'已有画布',workflowSpaceType:'personal'}),exportWorkflowForSave(){return {nodes:this.nodes,edges:this.edges}},applyIncrementalNode(node){const target=this.nodes.find(n=>n.id===node.id);if(target && !(node.version<target.version)){target.data={...target.data,...node.data};target.version=node.version}}}
  const result={nodes:[{id:'image',type:'image',version:1,data:{output:{url:'/image.jpg'}}}],edges:[{id:'edge',source:'b',target:'image'}],node:{id:'b',version:3,data:{status:'success',breakdownTaskId:'task',breakdownSummary:{shots:1},error:null}}}
  const request=async path=>{calls.push(path);return path==='/config'?{}:{status:'completed',node:{id:'b',version:10,data:{...props.data}},result:structuredClone(result)}}
  const bindings={ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch:()=>{},onMounted:fn=>mounted.push(fn),onUnmounted:()=>{},inject:()=>false,unref:x=>x,defineProps:()=>props,useCanvasStore:()=>store,useTeamStore:()=>({getSpaceParams:()=>({spaceType:'personal'})}),requestVideoBreakdown:request,mergeBreakdownResult,getBreakdownSource:()=>null,formatBreakdownTime:()=>'',saveWorkflow:async body=>{saves.push(structuredClone(body));return {workflow:{id:'wf'}}},window:{dispatchEvent(){}},CustomEvent:class {}}
  const exposed=new Function(...Object.keys(bindings),`${script}\nreturn {poll,alive}`)(...Object.values(bindings))
  return {...exposed,mounted,calls,saves,store}
}

test('失败状态的旧画布在挂载时查询任务真源，恢复已完成任务',async()=>{
  const f=fixture()
  for(const fn of f.mounted) fn()
  await new Promise(r=>setImmediate(r))
  assert.ok(f.calls.includes('/tasks/task'))
  f.alive.abort()
})
test('任务完成但节点被旧快照覆盖：采用当前版本恢复并立即持久化结果',async()=>{
  const f=fixture()
  await f.poll('task',{tabId:'tab',workflowId:'wf'})
  assert.equal(f.store.nodes.find(n=>n.id==='b').data.status,'success')
  assert.equal(f.saves.length,1)
  assert.equal(f.saves[0].id,'wf')
  assert.equal(f.saves[0].name,'已有画布')
  assert.equal(f.saves[0].nodes.length,2)
  assert.equal(f.saves[0].edges.length,1)
  f.alive.abort()
})
test('已成功的节点不重复恢复保存，用户编辑的结果节点保持不变',async()=>{
  const f=fixture('success')
  f.store.nodes.push({id:'image',version:8,data:{title:'用户编辑'}})
  await f.poll('task',{tabId:'tab',workflowId:'wf'})
  assert.equal(f.saves.length,0)
  assert.equal(f.store.nodes.find(n=>n.id==='image').data.title,'用户编辑')
  f.alive.abort()
})
