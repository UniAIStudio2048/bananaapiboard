import assert from 'node:assert/strict'
import test from 'node:test'
import { duplicateTimelineItems } from '../duplicate'
import type { ClipboardDraft } from '../clipboard'
const ids=()=>{let n=0;return()=>`dup${++n}`}
const fixture=():ClipboardDraft=>({clips:[{resource_uuid:'v',start:2,end:6,rate:2,volume_db:-2,transform:{x:.1,y:0,scale:1,rotation:0,opacity:1,keyframes:{x:[{time:2,value:.1},{time:6,value:.3}]}}},{resource_uuid:'i',media_type:'image',start:1,end:3,rate:1,volume_db:0,transform:{x:0,y:0,scale:1,rotation:0,opacity:1,keyframes:{x:[{time:1,value:0},{time:3,value:.2}]}},effects:[{type:'blur',enabled:true,intensity:3,keyframes:[{time:1,value:3},{time:3,value:9}]}]}],videoLayers:[{resource_uuid:'v2',start:0,end:1,source_start:0,rate:1,volume_db:0,track_id:'mixed'}],imageLayers:[{resource_uuid:'i2',start:1,end:2,x:.5,y:.5,scale:1,opacity:1,track_id:'mixed'}],textLayers:[{text:'x',start:0,end:2,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans'}],audioLayers:[],effectLayers:[]})
test('duplicates selected main video and image to one new track at their original times and converts image animation',()=>{
 const state=fixture();state.clips[0].muted=true;const result=duplicateTimelineItems(state,[{kind:'main',index:0},{kind:'main',index:1}],ids())!
 assert.equal(result.draft.clips.length,2);const v=result.draft.videoLayers.at(-1)!,i=result.draft.imageLayers.at(-1)!
 assert.equal(v.start,0);assert.equal(v.end,2);assert.equal(v.source_start,2);assert.equal(v.rate,2);assert.equal(v.muted,true);assert.deepEqual(v.transform,state.clips[0].transform)
 assert.equal(i.start,2);assert.equal(i.end,4);assert.equal(i.x,.5);assert.deepEqual(i.keyframes?.x,[{time:2,value:.5},{time:4,value:.7}]);assert.deepEqual(i.effects?.[0].keyframes,[{time:2,value:3},{time:4,value:9}]);assert.equal(v.track_id,i.track_id);assert.equal(result.selection.length,2)
})
test('duplicates a mixed visual track together into a new track without touching the original',()=>{
 const state=fixture(),result=duplicateTimelineItems(state,[{kind:'video',index:0},{kind:'image',index:0},{kind:'text',index:0}],ids())!,v=result.draft.videoLayers.at(-1)!,i=result.draft.imageLayers.at(-1)!
 assert.equal(v.start,0);assert.equal(i.start,1);assert.equal(v.track_id,i.track_id);assert.notEqual(v.track_id,'mixed');assert.equal(result.draft.textLayers.at(-1)?.start,0);assert.equal(state.videoLayers.length,1)
})
test('rejects the whole transaction at capacity or with unsupported transformed image',()=>{
 const state=fixture();state.videoLayers=Array.from({length:16},()=>({...state.videoLayers[0]}));assert.equal(duplicateTimelineItems(state,[{kind:'main',index:0},{kind:'text',index:0}],ids()),undefined);assert.equal(state.textLayers.length,1)
 state.clips[1].transform!.x=2;assert.equal(duplicateTimelineItems(state,[{kind:'main',index:1}],ids()),undefined)
})
test('duplicates audio tracks independently and retains clip mute, source offset and grouping',()=>{
 const state=fixture();state.audioLayers=[{resource_uuid:'a',start:1,end:2,source_start:3,volume_db:-5,muted:true,track_id:'sound'},{resource_uuid:'b',start:3,end:4,source_start:4,volume_db:0,track_id:'sound'}]
 const result=duplicateTimelineItems(state,[{kind:'audio',index:1},{kind:'audio',index:0}],ids())!,first=result.draft.audioLayers[2],second=result.draft.audioLayers[3]
 assert.equal(first.start,1);assert.equal(first.source_start,3);assert.equal(first.muted,true);assert.equal(second.start,3);assert.equal(first.track_id,second.track_id);assert.notEqual(first.track_id,'sound')
})
test('duplicating a hidden main track creates an independently visible track',()=>{
 const state=fixture();state.clips[0].track_hidden=true;state.clips[1].track_hidden=true
 const result=duplicateTimelineItems(state,[{kind:'main',index:0},{kind:'main',index:1}],ids())!
 assert.equal(result.draft.videoLayers.at(-1)?.hidden,undefined);assert.equal(result.draft.imageLayers.at(-1)?.hidden,undefined);assert.equal(result.draft.videoLayers.at(-1)?.track_hidden,false);assert.equal(result.draft.imageLayers.at(-1)?.track_hidden,false)
})
