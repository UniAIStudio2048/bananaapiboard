import assert from 'node:assert/strict'
import test from 'node:test'
import { copyTimelineItems, pasteTimelineItems, type ClipboardDraft } from '../clipboard'
import { visualTracks } from '../visual-order'

const fixture=():ClipboardDraft=>({clips:[{resource_uuid:'main',start:1,end:5,rate:2,volume_db:0}],videoLayers:[{resource_uuid:'v',start:2,end:4,source_start:1,rate:2,volume_db:0,track_id:'mix',z_index:0,transform:{scale:1,x:0,y:0,rotation:0,opacity:1,keyframes:{x:[{time:1,value:0},{time:5,value:1}]}}}],imageLayers:[{resource_uuid:'i',start:5,end:7,x:.5,y:.5,scale:1,opacity:1,track_id:'mix',z_index:0,keyframes:{x:[{time:5,value:0},{time:7,value:1}]},effects:[{type:'blur',enabled:true,intensity:15,keyframes:[{time:5,value:0},{time:7,value:100}]}]}],textLayers:[{text:'x',start:3,end:5,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans',track_id:'title',z_index:1,keyframes:{background_radius:[{time:3,value:0},{time:5,value:100}]}}],effectLayers:[],audioLayers:[]})
const ids=()=>{let n=0;return()=>`id-${++n}`}
test('copy snapshots independent data and main clip paste uses playhead and preserves source time',()=>{
 const original=fixture();original.clips[0].muted=true;const items=copyTimelineItems(original,[{kind:'main',index:0}]);original.clips[0].end=4
 const result=pasteTimelineItems(original,items,8,ids())!,video=result.draft.videoLayers.at(-1)!;assert.equal(result.draft.clips.length,1);assert.equal(video.start,8);assert.equal(video.end,10);assert.equal(video.source_start,1);assert.equal(video.rate,2);assert.equal(video.muted,true)
 assert.equal(original.videoLayers.length,1)
})
test('multi-track paste keeps relative positions, shared grouping and keyframe coordinates',()=>{
 const original=fixture(),items=copyTimelineItems(original,[{kind:'video',index:0},{kind:'image',index:0},{kind:'text',index:0}]),result=pasteTimelineItems(original,items,10,ids())!
 const video=result.draft.videoLayers[1],image=result.draft.imageLayers[1],text=result.draft.textLayers[1]
 assert.equal(video.start,10);assert.equal(video.source_start,1);assert.deepEqual(video.transform?.keyframes?.x,original.videoLayers[0].transform?.keyframes?.x)
 assert.equal(image.start,13);assert.equal(image.track_id,video.track_id);assert.deepEqual(image.keyframes?.x,[{time:13,value:0},{time:15,value:1}]);assert.deepEqual(image.effects?.[0].keyframes,[{time:13,value:0},{time:15,value:100}])
 assert.equal(text.start,11);assert.deepEqual(text.keyframes?.background_radius,[{time:11,value:0},{time:13,value:100}]);assert.equal(result.selection.length,3)
 assert.equal(visualTracks(result.draft.videoLayers,result.draft.imageLayers,result.draft.textLayers).find(group=>group.id===video.track_id)?.refs.length,2)
})
test('paste uses a new track on overlap and rejects any out-of-range batch',()=>{
 const state=fixture(),items=copyTimelineItems(state,[{kind:'image',index:0},{kind:'text',index:0}]),result=pasteTimelineItems(state,items,3,ids())!
 assert.notEqual(result.draft.imageLayers[1].track_id,'mix');assert.equal(pasteTimelineItems(state,items,599,ids()),undefined)
 assert.equal(state.imageLayers.length,1);assert.equal(state.textLayers.length,1)
})

test('audio and effect paste preserve source offsets, mute and shared timing',()=>{
 const state=fixture();state.audioLayers=[{resource_uuid:'a',start:1,end:2,source_start:3,volume_db:-2,muted:true,track_id:'a'}];state.effectLayers=[{start:2,end:4,intensity:80,track_id:'fx'}]
 const items=copyTimelineItems(state,[{kind:'audio',index:0},{kind:'effect',index:0}]),result=pasteTimelineItems(state,items,6,ids())!
 assert.equal(result.draft.audioLayers[1].start,6);assert.equal(result.draft.audioLayers[1].source_start,3);assert.equal(result.draft.audioLayers[1].muted,true)
 assert.equal(result.draft.effectLayers[1].start,7);assert.equal(result.draft.effectLayers[1].intensity,80)
})

test('a group never splits when a later pasted item collides with the candidate track',()=>{
 const state=fixture();state.textLayers[0].z_index=2;state.videoLayers.push({resource_uuid:'occupied',start:13,end:15,source_start:0,rate:1,volume_db:0,track_id:'above',z_index:1})
 const result=pasteTimelineItems(state,copyTimelineItems(state,[{kind:'video',index:0},{kind:'image',index:0}]),10,ids())!
 const video=result.draft.videoLayers.at(-1)!,image=result.draft.imageLayers.at(-1)!
 assert.notEqual(video.track_id,'above');assert.equal(video.track_id,image.track_id);assert.equal(video.start,10);assert.equal(image.start,13)
})
test('pastes mixed main video, image and text with preserved relative times and image keyframes',()=>{
 const state=fixture();state.clips.push({resource_uuid:'main-image',media_type:'image',start:1,end:3,rate:1,volume_db:0,transform:{x:0,y:0,scale:1,rotation:0,opacity:1,keyframes:{x:[{time:1,value:0},{time:3,value:.2}]}}})
 const items=copyTimelineItems(state,[{kind:'main',index:0},{kind:'main',index:1},{kind:'text',index:0}]),result=pasteTimelineItems(state,items,10,ids())!
 const video=result.draft.videoLayers.at(-1)!,image=result.draft.imageLayers.at(-1)!,text=result.draft.textLayers.at(-1)!
 assert.equal(video.start,10);assert.equal(image.start,12);assert.equal(text.start,13);assert.equal(video.track_id,image.track_id);assert.deepEqual(image.keyframes?.x,[{time:12,value:.5},{time:14,value:.7}]);assert.equal(result.draft.clips.length,2)
})
test('locates a legacy source track after an earlier group assigns it an ID',()=>{
 const state=fixture();state.imageLayers=[];state.textLayers=[];state.videoLayers=[
  {resource_uuid:'a',start:0,end:1,source_start:0,rate:1,volume_db:0,z_index:0},
  {resource_uuid:'b',start:3,end:4,source_start:0,rate:1,volume_db:0,z_index:1},
  {resource_uuid:'c',start:6,end:7,source_start:0,rate:1,volume_db:0,track_id:'top',z_index:2},
 ]
 const result=pasteTimelineItems(state,copyTimelineItems(state,[{kind:'video',index:0},{kind:'video',index:1}]),1.5,ids())!
 assert.equal(result.draft.videoLayers[3].track_id,result.draft.videoLayers[1].track_id);assert.equal(result.draft.videoLayers[4].track_id,'top')
})
test('main paste reuses the immediately higher compatible empty track and keeps its visibility',()=>{
 const state=fixture();state.clips[0].track_hidden=true;state.videoLayers[0].track_hidden=true;state.imageLayers[0].track_hidden=true
 const result=pasteTimelineItems(state,copyTimelineItems(state,[{kind:'main',index:0}]),0,ids())!,video=result.draft.videoLayers.at(-1)!
 assert.equal(video.track_id,'mix');assert.equal(video.start,0);assert.equal(video.track_hidden,true);assert.equal(video.hidden,undefined)
})
test('main paste creates a visible new track when the nearest track is occupied',()=>{
 const state=fixture();state.clips[0].track_hidden=true;const result=pasteTimelineItems(state,copyTimelineItems(state,[{kind:'main',index:0}]),2,ids())!,video=result.draft.videoLayers.at(-1)!
 assert.notEqual(video.track_id,'mix');assert.equal(video.start,2);assert.equal(video.track_hidden,false);assert.equal(video.hidden,undefined)
})
