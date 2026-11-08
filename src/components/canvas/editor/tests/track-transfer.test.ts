import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClipboardDraft } from '../clipboard'
import { moveMainToVisual, moveVisualToMain } from '../track-transfer'
import { valueAt } from '../keyframe-values'
import { validVideoTransform } from '../video-keyframes'
import { validImageKeyframes } from '../image-keyframes'
import { validVisualEffects } from '../visual-effects'
const fixture=():ClipboardDraft=>({clips:[{resource_uuid:'main',start:0,end:4,rate:1,volume_db:0},{resource_uuid:'cut',start:2,end:6,rate:2,volume_db:-4,muted:true,transform:{x:.1,y:0,scale:1,rotation:0,opacity:1}}],videoLayers:[{resource_uuid:'overlay',start:1,end:3,source_start:3,rate:2,volume_db:-7,muted:true,track_id:'vid'}],imageLayers:[{resource_uuid:'image',start:4,end:6,x:.5,y:.6,scale:1,opacity:1,track_id:'vid',keyframes:{x:[{time:4,value:.5},{time:6,value:.9}]},effects:[{type:'blur',enabled:true,intensity:3,keyframes:[{time:4,value:3},{time:6,value:9}]}]}],textLayers:[],audioLayers:[],effectLayers:[]})
test('move main video to overlay keeps source trim, speed, mute and falls back to new track on conflict',()=>{
 const state=fixture(),result=moveMainToVisual(state,1,1,'new','video:vid')!,v=result.draft.videoLayers[1]
 assert.equal(result.draft.clips.length,1);assert.equal(v.start,1);assert.equal(v.end,3);assert.equal(v.source_start,2);assert.equal(v.rate,2);assert.equal(v.muted,true);assert.notEqual(v.track_id,'vid');assert.equal(state.clips.length,2)
})
test('move visual video to main appends source trim and preserves mute',()=>{
 const state=fixture(),result=moveVisualToMain(state,'video',0,false)!,clip=result.draft.clips[2]
 assert.equal(result.draft.videoLayers.length,0);assert.equal(clip.start,3);assert.equal(clip.end,7);assert.equal(clip.rate,2);assert.equal(clip.volume_db,-7);assert.equal(clip.muted,true)
})
test('image moves into main with timeline animation converted to source time',()=>{
 const state=fixture(),result=moveVisualToMain(state,'image',0,false)!,clip=result.draft.clips[2]
 assert.equal(clip.media_type,'image');assert.equal(clip.end,2);assert.equal(clip.transform?.x,0);assert.ok(Math.abs(clip.transform!.y-.1)<1e-9);assert.deepEqual(clip.transform?.keyframes?.x,[{time:0,value:0},{time:2,value:.4}]);assert.deepEqual(clip.effects?.[0].keyframes,[{time:0,value:3},{time:2,value:9}])
})
test('ripple transfers shift later members, while limits and sticker constraints fail atomically',()=>{
 const state=fixture();state.videoLayers[0].start=0;state.videoLayers[0].end=2
 const result=moveVisualToMain(state,'video',0,true)!;assert.equal(result.draft.imageLayers[0].start,2);assert.deepEqual(result.draft.imageLayers[0].keyframes?.x,[{time:2,value:.5},{time:4,value:.9}])
 state.imageLayers[0].is_sticker=true;assert.equal(moveVisualToMain(state,'image',0,false),undefined);assert.equal(state.imageLayers.length,1)
 state.clips=[state.clips[0]];const empty=moveMainToVisual(state,0,0,'new')!;assert.equal(empty.draft.clips.length,0);assert.equal(empty.draft.videoLayers.length,2)
})

test('rejects malformed transient clip ranges without changing either track',()=>{
 const state=fixture();state.videoLayers[0].end=.5;assert.equal(moveVisualToMain(state,'video',0,false),undefined);assert.equal(state.videoLayers.length,1);assert.equal(state.clips.length,2)
 state.clips[1].rate=0;assert.equal(moveMainToVisual(state,1,1,'new'),undefined);assert.equal(state.clips.length,2)
})
test('main image to overlay and back preserves positional and effect animation',()=>{
 const state=fixture();state.clips[1]={resource_uuid:'image-main',media_type:'image',start:1,end:3,rate:1,volume_db:0,transform:{x:.2,y:-.1,scale:1,rotation:0,opacity:1,keyframes:{x:[{time:1,value:0},{time:3,value:.2}]}},effects:[{type:'blur',enabled:true,intensity:5,keyframes:[{time:1,value:5},{time:3,value:15}]}]}
 const moved=moveMainToVisual(state,1,8,'new')!,image=moved.draft.imageLayers.at(-1)!
 assert.ok(Math.abs(image.x-.7)<1e-9);assert.ok(Math.abs(image.y-.4)<1e-9);assert.deepEqual(image.keyframes?.x,[{time:8,value:.5},{time:10,value:.7}]);assert.deepEqual(image.effects?.[0].keyframes,[{time:8,value:5},{time:10,value:15}])
 const restored=moveVisualToMain(moved.draft,'image',moved.draft.imageLayers.length-1,false)!.draft.clips.at(-1)!
 assert.deepEqual(restored.transform?.keyframes?.x,[{time:0,value:0},{time:2,value:.19999999999999996}]);assert.deepEqual(restored.effects?.[0].keyframes,[{time:0,value:5},{time:2,value:15}])
})

test('moving a densely animated image to main preserves interpolated trim boundaries',()=>{
 const state=fixture(), image=state.imageLayers[0]
 image.keyframes={x:[{time:3.9,value:.2},...Array.from({length:32},(_,i)=>({time:4.05+i*.05,value:.3+i*.01})),{time:6.1,value:.8}]}
 const before=image.keyframes.x!,result=moveVisualToMain(state,'image',0,false)
 assert.ok(result,'valid 34-key image should be transferable to main')
 const keys=result.draft.clips.at(-1)!.transform!.keyframes!.x!
 assert.equal(keys.length,34)
 for(const at of [4,4.025,4.1,4.55,5.4,5.95,6])assert.ok(Math.abs(valueAt(0,keys,at-4)-(valueAt(image.x,before,at)-.5))<1e-8,`animation changed at ${at}`)
 assert.equal(validVideoTransform(result.draft.clips.at(-1)!.transform!),true)
})

test('moving an image with 34 interior points does not add redundant boundary keys',()=>{
 const state=fixture(),image=state.imageLayers[0]
 image.keyframes={x:Array.from({length:34},(_,i)=>({time:4.05+i*.05,value:.3+i*.01}))}
 const result=moveVisualToMain(state,'image',0,false)
 assert.ok(result);const keys=result.draft.clips.at(-1)!.transform!.keyframes!.x!
 assert.equal(keys.length,34)
 for(const at of [4,4.025,4.2,5.4,5.95,6])assert.ok(Math.abs(valueAt(0,keys,at-4)-(valueAt(image.x,image.keyframes.x!,at)-.5))<1e-8)
})

test('moving a dense main-image animation to an overlay does not exceed the key limit',()=>{
 const state=fixture(),points=Array.from({length:34},(_,i)=>({time:.1+i*.05,value:-.2+i*.01}))
 state.clips[1]={resource_uuid:'image-main',media_type:'image',start:0,end:2,rate:1,volume_db:0,transform:{x:0,y:0,scale:1,rotation:0,opacity:1,keyframes:{x:points}},effects:[{type:'blur',enabled:true,intensity:1,keyframes:points.map(point=>({...point,value:point.value+1}))}]}
 const moved=moveMainToVisual(state,1,8,'new')!,image=moved.draft.imageLayers.at(-1)!
 assert.equal(validImageKeyframes(image),true);assert.equal(validVisualEffects(image.effects),true)
 assert.equal(image.keyframes!.x!.length,34);assert.equal(image.effects![0].keyframes!.length,34)
 for(const at of [0,.05,.3,1.4,1.9,2])assert.ok(Math.abs(valueAt(image.x,image.keyframes!.x,at+8)-(valueAt(0,points,at)+.5))<1e-8)
})
