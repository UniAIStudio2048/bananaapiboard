import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteTimelineItems } from '../selection'
import type { ClipboardDraft } from '../clipboard'
const fixture=():ClipboardDraft=>({clips:[{resource_uuid:'m',start:0,end:4,rate:1,volume_db:0}],videoLayers:[{resource_uuid:'v',start:0,end:2,source_start:0,rate:1,volume_db:0,track_id:'mix'},{resource_uuid:'v2',start:6,end:8,source_start:0,rate:1,volume_db:0,track_id:'mix'}],imageLayers:[{resource_uuid:'i',start:3,end:5,x:.5,y:.5,scale:1,opacity:1,track_id:'mix'}],textLayers:[{text:'x',start:3,end:5,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans'}],effectLayers:[],audioLayers:[]})
test('bulk delete can empty the main track and remains atomic on invalid selection',()=>{
 const state=fixture(),next=deleteTimelineItems(state,[{kind:'main',index:0},{kind:'text',index:0}],false)!;assert.equal(next.clips.length,0);assert.equal(next.textLayers.length,0);assert.equal(state.textLayers.length,1);assert.equal(deleteTimelineItems(state,[{kind:'main',index:1},{kind:'text',index:0}],false),undefined)
})
test('bulk delete across mixed tracks is atomic and ripple moves only remaining same-track clips',()=>{
 const state=fixture(),selection=[{kind:'video' as const,index:0},{kind:'image' as const,index:0},{kind:'text' as const,index:0}]
 const next=deleteTimelineItems(state,selection,true)!;assert.equal(next.videoLayers.length,1);assert.equal(next.videoLayers[0].start,2);assert.equal(next.imageLayers.length,0);assert.equal(next.textLayers.length,0);assert.equal(state.videoLayers[1].start,6)
 const plain=deleteTimelineItems(state,selection,false)!;assert.equal(plain.videoLayers[0].start,6)
})

test('multi-track split preserves source time and groups in a single draft transaction',async()=>{
 const {splitTimelineItems}=await import('../selection')
 const state=fixture();state.videoLayers[0].rate=2;state.videoLayers[0].source_start=1
 state.textLayers[0]={...state.textLayers[0],start:0,end:2}
 const refs=[{kind:'main' as const,index:0},{kind:'video' as const,index:0},{kind:'text' as const,index:0}]
 let id=0;const result=splitTimelineItems(state,refs,1,'both',false,()=>`new-${++id}`)!
 assert.equal(result.draft.clips.length,2);assert.equal(result.draft.clips[1].start,1)
 assert.equal(result.draft.videoLayers.length,3);assert.equal(result.draft.videoLayers[1].source_start,3)
 assert.equal(result.draft.textLayers.length,2);assert.equal(result.draft.textLayers[0].track_id,result.draft.textLayers[1].track_id)
 assert.equal(result.selection.length,3);assert.equal(state.clips.length,1)
})
test('ripple keep-right on multiple tracks shifts only each affected track',async()=>{
 const {splitTimelineItems}=await import('../selection')
 const state=fixture();state.textLayers=[{...state.textLayers[0],start:0,end:2,track_id:'t'}, {...state.textLayers[0],start:3,end:5,track_id:'t'}]
 const result=splitTimelineItems(state,[{kind:'video',index:0},{kind:'text',index:0}],1,'right',true,()=> 'unused')!
 assert.equal(result.draft.videoLayers[0].start,0);assert.equal(result.draft.videoLayers[0].source_start,1);assert.equal(result.draft.imageLayers[0].start,2)
 assert.equal(result.draft.textLayers[0].start,0);assert.equal(result.draft.textLayers[1].start,2)
})

test('bulk visibility uses a shared target and leaves audio and track state intact',async()=>{
 const {toggleTimelineVisibility}=await import('../selection')
 const state=fixture();state.imageLayers[0].hidden=true;state.textLayers[0].track_hidden=true
 const refs=[{kind:'image' as const,index:0},{kind:'text' as const,index:0}]
 const hidden=toggleTimelineVisibility(state,refs)!
 assert.equal(hidden.imageLayers[0].hidden,true);assert.equal(hidden.textLayers[0].hidden,true);assert.equal(hidden.textLayers[0].track_hidden,true)
 const shown=toggleTimelineVisibility(hidden,refs)!
 assert.equal(shown.imageLayers[0].hidden,false);assert.equal(shown.textLayers[0].hidden,false);assert.equal(shown.textLayers[0].track_hidden,true);assert.equal(state.textLayers[0].hidden,undefined)
 assert.equal(toggleTimelineVisibility(state,[{kind:'image',index:99}]),undefined)
})
test('batch mute toggles audio and video together while preserving volumes and image state',async()=>{
 const {toggleTimelineMute}=await import('../selection'),state=fixture()
 state.clips.push({resource_uuid:'image-main',media_type:'image',start:0,end:2,rate:1,volume_db:0})
 state.videoLayers[0].muted=true;state.videoLayers[0].volume_db=-12;state.audioLayers=[{resource_uuid:'a',start:0,end:2,source_start:1,volume_db:-6,muted:false,track_muted:true}]
 const refs=[{kind:'main' as const,index:0},{kind:'main' as const,index:1},{kind:'video' as const,index:0},{kind:'audio' as const,index:0},{kind:'text' as const,index:0}]
 const muted=toggleTimelineMute(state,refs)!;assert.equal(muted.clips[0].muted,true);assert.equal(muted.clips[1].muted,undefined);assert.equal(muted.videoLayers[0].muted,true);assert.equal(muted.audioLayers[0].muted,true);assert.equal(muted.audioLayers[0].track_muted,true);assert.equal(muted.videoLayers[0].volume_db,-12);assert.equal(muted.audioLayers[0].volume_db,-6)
 const unmuted=toggleTimelineMute(muted,refs)!;assert.equal(unmuted.clips[0].muted,false);assert.equal(unmuted.videoLayers[0].muted,false);assert.equal(unmuted.audioLayers[0].muted,false);assert.equal(unmuted.audioLayers[0].track_muted,true);assert.equal(state.clips[0].muted,undefined)
})
