import test from 'node:test'
import assert from 'node:assert/strict'
import { getBreakdownSource, mergeBreakdownResult, formatBreakdownTime } from './videoBreakdown.js'
test('仅允许单一视频来源，多个来源或非视频不给出静默选择',()=>{
  const nodes=[{id:'v',type:'video',data:{output:{url:'video.mp4'}}},{id:'v2',type:'video-input',data:{videoUrl:'other.mp4'}}]
  assert.equal(getBreakdownSource('b',nodes,[{source:'v',target:'b'}])?.id,'v')
  assert.equal(getBreakdownSource('b',nodes,[{source:'v',target:'b'},{source:'v2',target:'b'}]),null)
  assert.equal(getBreakdownSource('b',[{id:'v',type:'image'}],[{source:'v',target:'b'}]),null)
})
test('服务端结果合并幂等，保留已存在结果节点的用户编辑与位置',()=>{
  const store={nodes:[{id:'b',data:{}}],edges:[],addNode(n){this.nodes.push(n)},addEdge(e){this.edges.push(e)},applyIncrementalNode(n){Object.assign(this.nodes.find(v=>v.id===n.id).data,n.data)}}
  const result={node:{id:'b',data:{status:'success'}},nodes:[{id:'s',data:{title:'分镜'},position:{x:1,y:2}}],edges:[{id:'e',source:'b',target:'s'}]}
  mergeBreakdownResult(store,result)
  store.nodes.find(n=>n.id==='s').data.title='用户命名'
  mergeBreakdownResult(store,result)
  assert.equal(store.nodes.length,2)
  assert.equal(store.edges.length,1)
  assert.equal(store.nodes[1].data.title,'用户命名')
  assert.equal(store.nodes[0].data.status,'success')
})
test('时间格式',()=>{
  assert.equal(formatBreakdownTime(127.36),'02:07.36')
  assert.equal(formatBreakdownTime(NaN),'00:00.00')
})
test('合并服务端素材不消费正在打开的节点菜单，也不触发新增节点保存',()=>{
  const store={nodes:[],edges:[],triggerNodeId:'unrelated',addNode(){throw new Error('不应使用交互式添加')},addEdge(){throw new Error('不应重复持久化')},applyIncrementalNode(){}}
  mergeBreakdownResult(store,{nodes:[{id:'result',version:1}],edges:[{id:'e'}]})
  assert.equal(store.triggerNodeId,'unrelated')
  assert.equal(store.nodes[0].version,1)
  assert.equal(store.edges.length,1)
})
