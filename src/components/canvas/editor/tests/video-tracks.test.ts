import assert from 'node:assert/strict'
import test from 'node:test'
import type { AudioLayer, ImageLayer, TextLayer, VideoLayer } from '../api'
import { audioTracks, insertAudio, insertVisual, moveAudioItem, moveVisualItem } from '../tracks'
import { orderedVisuals, reorderVisuals, visualTracks } from '../visual-order'
import { visibleAudio, visibleImage, visibleVideo } from '../visibility'

const video=(start:number,end:number):VideoLayer=>({resource_uuid:'v',start,end,source_start:0,rate:1,volume_db:0})
const image=(start:number,end:number):ImageLayer=>({resource_uuid:'i',start,end,x:.5,y:.5,scale:1,opacity:1})
const text=(start:number,end:number):TextLayer=>({text:'标题',start,end,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans'})
const audio=(start:number,end:number):AudioLayer=>({resource_uuid:'a',start,end,source_start:0,volume_db:0})

test('legacy elements stay separate, compatible non-overlapping media share a track, overlaps do not',()=>{
 const original={videos:[video(0,1)],images:[image(0,2)],text:[text(0,2)]}
 assert.equal(visualTracks(original.videos,original.images,original.text).length,3)
 const next=insertVisual(original,'image',image(1,2),'new-id',{kind:'video',index:0})
 const tracks=visualTracks(next.videos,next.images,next.text),combined=tracks.find(track=>track.id==='new-id')!
 assert.deepEqual(combined.refs.map(ref=>ref.kind).sort(),['image','video']);assert.equal(next.videos[0].z_index,next.images[1].z_index)
 assert.equal(original.videos[0].track_id,undefined,'insertion must not mutate existing history')
 const conflict=insertVisual(next,'video',video(.5,1.5),'conflict-id',{kind:'video',index:0})
 assert.equal(visualTracks(conflict.videos,conflict.images,conflict.text).length,4)
 assert.ok(!('track_id' in visibleVideo(conflict.videos[1])));assert.ok(!('track_id' in visibleImage(next.images[1])))
})

test('reordering one member moves the entire track and preserves equal layer order',()=>{
 const group=insertVisual({videos:[{...video(0,1),track_hidden:true}],images:[],text:[text(0,2)]},'image',image(1,2),'track',{kind:'video',index:0})
 assert.equal(group.images[0].track_hidden,true)
 const reordered=reorderVisuals(group.videos,group.images,group.text,'image',0,1)!
 assert.equal(reordered.videos[0].z_index,reordered.images[0].z_index)
 assert.ok(reordered.videos[0].z_index!>reordered.text[0].z_index!)
 assert.deepEqual(orderedVisuals(reordered.videos,reordered.images,reordered.text).map(ref=>ref.kind),['text','video','image'])
})

test('audio clips reuse a free track and inherit track mute without changing element mute',()=>{
 const first={...audio(0,1),track_muted:true},next=insertAudio([first],audio(1,2),'audio-track')
 assert.equal(audioTracks(next).length,1);assert.equal(next[1].track_muted,true);assert.equal(next[1].muted,undefined)
 const wire=visibleAudio(next[1]);assert.equal(wire.muted,true);assert.ok(!('track_id' in wire));assert.ok(!('track_muted' in wire))
 assert.equal(audioTracks(insertAudio(next,audio(.5,1.5),'other')).length,2)
})

test('moving clips between compatible tracks inherits track state and avoids overlaps',()=>{
 const state={videos:[{...video(0,1),track_id:'video-a',z_index:0}],images:[{...image(2,3),track_id:'video-b',z_index:1,track_hidden:true}],text:[{...text(0,1),track_id:'text-c',z_index:2}]}
 const groups=visualTracks(state.videos,state.images,state.text),target=groups.find(g=>g.id==='video-b')!
 const moved=moveVisualItem(state,{kind:'video',index:0},{...state.videos[0],start:3,end:4},'fresh',target.key)!
 assert.equal(moved.videos[0].track_id,'video-b');assert.equal(moved.videos[0].track_hidden,true);assert.equal(moved.videos[0].z_index,1)
 assert.equal(visualTracks(moved.videos,moved.images,moved.text).find(g=>g.id==='video-b')?.refs.length,2)
 const collision=moveVisualItem(state,{kind:'video',index:0},{...state.videos[0],start:2.5,end:3.5},'separate',target.key)!
 assert.equal(collision.videos[0].track_id,'separate');assert.equal(collision.videos[0].track_hidden,false)
 assert.equal(state.videos[0].track_id,'video-a')
})

test('audio moves retain the clip mute and use the destination track mute',()=>{
 const layers=[{...audio(0,1),track_id:'a',muted:true},{...audio(2,3),track_id:'b',track_muted:true}],target=audioTracks(layers).find(group=>group.id==='b')!
 const moved=moveAudioItem(layers,0,{...layers[0],start:3,end:4},'unused',target.key)!
 assert.equal(moved[0].track_id,'b');assert.equal(moved[0].track_muted,true);assert.equal(moved[0].muted,true)
 const collision=moveAudioItem(layers,0,{...layers[0],start:2.5,end:3.5},'new',target.key)!
 assert.equal(collision[0].track_id,'new');assert.equal(collision[0].track_muted,false);assert.equal(collision[0].muted,true)
})

test('explicit drop uses only the requested track and creates a track for collisions or incompatible targets',()=>{
 const state={videos:[{...video(0,2),track_id:'occupied',z_index:0},{...video(5,6),track_id:'other-free',z_index:1}],images:[],text:[{...text(0,1),track_id:'titles',z_index:2}]}
 const same=insertVisual(state,'image',image(2,3),'generated',{kind:'video',index:0},undefined,'target')
 assert.equal(same.images[0].track_id,'occupied')
 const collision=insertVisual(state,'image',image(1,2),'collision',{kind:'video',index:0},undefined,'target')
 assert.equal(collision.images[0].track_id,'collision')
 const wrongType=insertVisual(state,'image',image(2,3),'wrong-type',{kind:'text',index:0},undefined,'target')
 assert.equal(wrongType.images[0].track_id,'wrong-type')
 const blank=insertVisual(state,'image',image(2,3),'blank',undefined,undefined,'target')
 assert.equal(blank.images[0].track_id,'blank')
 const sound=[{...audio(0,2),track_id:'sound'},{...audio(5,6),track_id:'other'}]
 assert.equal(insertAudio(sound,audio(2,3),'new',0,undefined,'target')[2].track_id,'sound')
 assert.equal(insertAudio(sound,audio(1,2),'new',0,undefined,'target')[2].track_id,'new')
 assert.equal(insertAudio(sound,audio(2,3),'new',undefined,undefined,'target')[2].track_id,'new')
})


test('new visual tracks appear above or below the target without changing existing groups',()=>{
 const state={videos:[{...video(0,2),track_id:'v',z_index:0}],images:[],text:[{...text(0,2),track_id:'t',z_index:1}]}
 const above=insertVisual(state,'video',video(1,2),'new',{kind:'video',index:0},undefined,'target',{anchorKey:'video:v',side:'above',edge:'top'})
 assert.deepEqual(visualTracks(above.videos,above.images,above.text).map(track=>track.id),['v','new','t'])
 const below=insertVisual(state,'video',video(1,2),'new',{kind:'video',index:0},undefined,'target',{anchorKey:'video:v',side:'below',edge:'top'})
 assert.deepEqual(visualTracks(below.videos,below.images,below.text).map(track=>track.id),['new','v','t'])
 const incompatible=insertVisual(state,'image',image(0,1),'new',undefined,undefined,'target',{anchorKey:'text:t',side:'above',edge:'top'})
 assert.deepEqual(visualTracks(incompatible.videos,incompatible.images,incompatible.text).map(track=>track.id),['v','t','new'])
 const reused=insertVisual(state,'video',video(2,3),'new',{kind:'video',index:0},undefined,'target',{anchorKey:'video:v',side:'above',edge:'top'})
 assert.deepEqual(visualTracks(reused.videos,reused.images,reused.text).map(track=>track.id),['v','t'])
 assert.equal(state.videos[0].z_index,0);assert.equal(state.text[0].z_index,1)
})

test('new and moved audio tracks preserve visual order, mute, undoable data and clean export',()=>{
 const layers=[{...audio(0,2),track_id:'a',track_muted:true},{...audio(0,2),track_id:'b'}]
 const above=insertAudio(layers,audio(1,2),'new',0,undefined,'target',{anchorKey:'audio:a',side:'above',edge:'bottom'})
 assert.deepEqual(audioTracks(above).map(track=>track.id),['new','a','b'])
 const below=insertAudio(layers,audio(1,2),'new',0,undefined,'target',{anchorKey:'audio:a',side:'below',edge:'bottom'})
 assert.deepEqual(audioTracks(below).map(track=>track.id),['a','new','b'])
 const moved=moveAudioItem(layers,1,{...layers[1],start:1,end:2},'moved','audio:a',{anchorKey:'audio:a',side:'above',edge:'bottom'})!
 assert.deepEqual(audioTracks(moved).map(track=>track.id),['moved','a'])
 assert.equal(moved[0].track_muted,true);assert.equal(moved[1].track_muted,false)
 assert.deepEqual(audioTracks(JSON.parse(JSON.stringify(above))).map(track=>track.id),['new','a','b'])
 assert.ok(!('track_order' in visibleAudio(above[0])));assert.equal(visibleAudio(above[0]).muted,true)
 assert.ok(layers.every(layer=>!('track_order' in layer)))
})
