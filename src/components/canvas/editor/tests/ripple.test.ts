import assert from 'node:assert/strict'
import test from 'node:test'
import { rippleDelete, rippleKeepRight, rippleTrim, type RippleDraft } from '../ripple'

const fixture=():RippleDraft=>({videoLayers:[{resource_uuid:'v',start:0,end:2,source_start:0,rate:1,volume_db:0,track_id:'mix'}],imageLayers:[{resource_uuid:'i',start:3,end:5,x:.5,y:.5,scale:1,opacity:1,track_id:'mix',keyframes:{x:[{time:0,value:0},{time:4,value:1}]},effects:[{type:'blur',enabled:true,intensity:10,keyframes:[{time:0,value:0},{time:4,value:100}]}]}],textLayers:[],effectLayers:[],audioLayers:[{resource_uuid:'a',start:4,end:5,source_start:1,volume_db:0,track_id:'other'}]})
test('ripple delete moves only later clips on the same mixed track and preserves visible keyframes',()=>{
 const state=fixture(),next=rippleDelete(state,{kind:'video',index:0})!
 assert.equal(next.videoLayers.length,0);assert.equal(next.imageLayers[0].start,1);assert.equal(next.imageLayers[0].end,3)
 assert.deepEqual(next.imageLayers[0].keyframes?.x,[{time:1,value:.75},{time:2,value:1},{time:3,value:1}])
 assert.deepEqual(next.imageLayers[0].effects?.[0].keyframes,[{time:1,value:75},{time:2,value:100},{time:3,value:100}])
 assert.equal(next.audioLayers[0].start,4);assert.equal(state.imageLayers[0].start,3)
})
test('ripple trim shifts following clips and rejects invalid boundaries atomically',()=>{
 const state=fixture(),ref={kind:'video' as const,index:0},next=rippleTrim(state,ref,{...state.videoLayers[0],end:1})!
 assert.equal(next.imageLayers[0].start,2);assert.equal(next.videoLayers[0].end,1)
 const expanded=rippleTrim(state,ref,{...state.videoLayers[0],end:3})!;assert.equal(expanded.imageLayers[0].start,4)
 const tooLong={...state,imageLayers:[{...state.imageLayers[0],start:598,end:600}]};assert.equal(rippleTrim(tooLong,ref,{...state.videoLayers[0],end:3}),undefined)
})
test('ripple keep-right moves retained source and downstream clips without altering source time',()=>{
 const state=fixture(),next=rippleKeepRight(state,{kind:'video',index:0},1)!
 assert.equal(next.videoLayers[0].start,0);assert.equal(next.videoLayers[0].end,1);assert.equal(next.videoLayers[0].source_start,1);assert.equal(next.imageLayers[0].start,2)
 assert.equal(rippleKeepRight(state,{kind:'video',index:0},0),undefined)
})

test('audio ripple keeps source position and mute while leaving other tracks untouched',()=>{
 const state=fixture();state.audioLayers=[{resource_uuid:'a',start:0,end:2,source_start:0,volume_db:0,track_id:'audio',track_muted:true},{resource_uuid:'b',start:3,end:5,source_start:7,volume_db:0,track_id:'audio',track_muted:true},{resource_uuid:'c',start:4,end:5,source_start:0,volume_db:0,track_id:'other'}]
 const next=rippleDelete(state,{kind:'audio',index:0})!
 assert.equal(next.audioLayers[0].start,1);assert.equal(next.audioLayers[0].source_start,7);assert.equal(next.audioLayers[0].track_muted,true);assert.equal(next.audioLayers[1].start,4)
})
test('ripple text and effect tracks shift background and effect keyframes with the clip',()=>{
 const state=fixture();state.textLayers=[{text:'a',start:0,end:2,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans',track_id:'text'}, {text:'b',start:3,end:5,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans',track_id:'text',keyframes:{background_radius:[{time:3,value:0},{time:5,value:100}]}}]
 const moved=rippleKeepRight(state,{kind:'text',index:0},1)!
 assert.equal(moved.textLayers[1].start,2);assert.deepEqual(moved.textLayers[1].keyframes?.background_radius,[{time:2,value:0},{time:4,value:100}])
 state.effectLayers=[{start:0,end:2,intensity:15,track_id:'fx'},{start:3,end:5,intensity:25,track_id:'fx'}]
 const effects=rippleDelete(state,{kind:'effect',index:0})!;assert.equal(effects.effectLayers[0].start,1);assert.equal(effects.textLayers[1].start,3)
})
