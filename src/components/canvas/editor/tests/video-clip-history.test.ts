import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { useClipHistory } from '../useClipHistory'

const original = { resource_uuid: '10000000-0000-4000-8000-000000000001', start: 0, end: 4, rate: 1, volume_db: 0 }

test('timeline undo and redo restore edits and discard the redo branch after a new edit', () => {
  let state: ReturnType<typeof useClipHistory>
  function Harness() { state = useClipHistory(); return null }
  let renderer: ReturnType<typeof create>
  act(() => { renderer = create(createElement(Harness)) })
  act(() => state.initializeClips([original]))
  assert.equal(state!.canUndo, false)
  act(() => state.setClips(clips => [{ ...clips[0], end: 2 }, { ...clips[0], start: 2 }]))
  assert.equal(state!.clips.length, 2)
  act(() => state.undo())
  assert.deepEqual(state!.clips, [original])
  assert.equal(state!.canRedo, true)
  act(() => state.redo())
  assert.equal(state!.clips.length, 2)
  act(() => state.undo())
  act(() => state.setClips(clips => [{ ...clips[0], rate: 2 }]))
  assert.equal(state!.canRedo, false)
  act(() => state.setAudioLayers([{ resource_uuid: original.resource_uuid, start: 0, end: 1, source_start: 0, volume_db: 0 }]))
  act(() => state.setTextLayers([{ text: '字幕', start: 0, end: 1, x: .5, y: .5, size: 100, color: 'FFFFFF', opacity: 1, font: 'sans' }]))
  act(() => state.undo())
  assert.equal(state!.textLayers.length, 0)
  assert.equal(state!.audioLayers.length, 1)
  act(() => state.redo())
  assert.equal(state!.textLayers[0].text, '字幕')
  act(() => state.setImageLayers([{ resource_uuid: original.resource_uuid, start: 0, end: 1, x: .5, y: .5, scale: 1, opacity: 1 }]))
  act(() => state.undo()); assert.equal(state!.imageLayers.length, 0); assert.equal(state!.textLayers.length, 1)
  act(() => state.redo()); assert.equal(state!.imageLayers.length, 1)
  act(() => state.setVideoLayers([{ resource_uuid: original.resource_uuid, start: 0, end: 1, source_start: 0, rate: 1, volume_db: 0 }]))
  act(() => state.undo()); assert.equal(state!.videoLayers.length, 0); assert.equal(state!.imageLayers.length, 1)
  act(() => state.redo()); assert.equal(state!.videoLayers.length, 1)
  act(() => state.moveVisualLayer('video',0,1))
  assert.equal(state!.videoLayers[0].z_index,1);assert.equal(state!.imageLayers[0].z_index,0)
  act(() => state.undo()); assert.equal(state!.videoLayers[0].z_index,undefined);assert.equal(state!.imageLayers[0].z_index,undefined)
  act(() => state.redo()); assert.equal(state!.videoLayers[0].z_index,1);assert.equal(state!.imageLayers[0].z_index,0)
  const source=state!.videoLayers[0],target=state!.imageLayers[0]
  act(() => state.moveVisualLayerTo({kind:'video',index:0},{kind:'image',index:0},{...source},target))
  assert.equal(state!.videoLayers[0],source)
  act(() => state.moveVisualLayerTo({kind:'video',index:0},{kind:'image',index:0},source,target))
  assert.ok(state!.videoLayers[0].z_index! < state!.imageLayers[0].z_index!)
  act(() => state.undo());assert.equal(state!.videoLayers[0],source);assert.equal(state!.imageLayers[0],target)
  act(() => state.redo());assert.ok(state!.videoLayers[0].z_index! < state!.imageLayers[0].z_index!)
  act(() => state.resetClips([{ ...original, resource_uuid: '20000000-0000-4000-8000-000000000002' }]))
  assert.equal(state!.canUndo, false)
  assert.equal(state!.canRedo, false)
  act(() => renderer!.unmount())
})


test('mixed tracks move, hide and undo as one atomic edit', () => {
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips([original]))
 act(()=>state.insertVisualLayer('video',{resource_uuid:'v',start:0,end:1,source_start:0,rate:1,volume_db:0},'media'))
 act(()=>state.insertVisualLayer('image',{resource_uuid:'i',start:1,end:2,x:.5,y:.5,scale:1,opacity:1},'unused'))
 assert.equal(state!.videoLayers[0].track_id,state!.imageLayers[0].track_id)
 act(()=>state.toggleVisualTrack('image',0))
 assert.equal(state!.videoLayers[0].track_hidden,true);assert.equal(state!.imageLayers[0].track_hidden,true)
 act(()=>state.undo())
 assert.equal(state!.videoLayers[0].track_hidden,false);assert.equal(state!.imageLayers[0].track_hidden,false)
 act(()=>state.redo())
 assert.equal(state!.videoLayers[0].track_hidden,true);assert.equal(state!.imageLayers[0].track_hidden,true)
 const image=state!.imageLayers[0]
 act(()=>state.moveVisualTrackItem({kind:'image',index:0},image,{...image,start:.5,end:1.5},'new-track'))
 assert.equal(state!.imageLayers[0].track_id,'new-track');assert.equal(state!.videoLayers[0].track_id,'media')
 act(()=>state.undo())
 assert.equal(state!.imageLayers[0].track_id,'media');assert.equal(state!.imageLayers[0].track_hidden,true)
 act(()=>renderer!.unmount())
})


test('dropped files insert in order and each upload remains independently undoable',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips([original]))
 act(()=>state.insertDroppedMedia([
  {kind:'video',resource:'v',duration:2,start:1,id:'vtrack',main:false},
  {kind:'image',resource:'i',duration:5,start:1,id:'itrack',main:false},
  {kind:'audio',resource:'a',duration:3,start:1,id:'atrack',main:false},
 ]))
 assert.equal(state!.videoLayers.length,1);assert.equal(state!.imageLayers.length,1);assert.equal(state!.audioLayers.length,1)
 assert.equal(state!.videoLayers[0].start,1);assert.equal(state!.imageLayers[0].end,6);assert.equal(state!.audioLayers[0].end,4)
 act(()=>state.undo());assert.equal(state!.audioLayers.length,0);assert.equal(state!.imageLayers.length,1)
 act(()=>state.undo());assert.equal(state!.imageLayers.length,0);assert.equal(state!.videoLayers.length,1)
 act(()=>state.redo());assert.equal(state!.imageLayers.length,1)
 act(()=>renderer!.unmount())
})


test('a full main track cannot accidentally redirect a dropped video into an overlay',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips(Array.from({length:32},()=>({...original}))))
 act(()=>state.insertDroppedMedia([{kind:'video',resource:'v',duration:2,start:1,id:'vtrack',main:true}]))
 assert.equal(state!.clips.length,32);assert.equal(state!.videoLayers.length,0);assert.equal(state!.canUndo,false)
 act(()=>renderer!.unmount())
})


test('creating a visual track next to another is one undoable order change',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips([original],[],[{text:'T',start:0,end:2,x:.5,y:.5,size:40,color:'FFFFFF',opacity:1,font:'sans',track_id:'t',z_index:1}],[],[{resource_uuid:'v',start:0,end:2,source_start:0,rate:1,volume_db:0,track_id:'v',z_index:0}]))
 act(()=>state.insertVisualLayer('video',{resource_uuid:'n',start:1,end:2,source_start:0,rate:1,volume_db:0},'n',{kind:'video',index:0},undefined,'target',{anchorKey:'video:v',side:'above',edge:'top'}))
 assert.equal(state!.videoLayers[0].z_index,0);assert.equal(state!.videoLayers[1].z_index,1);assert.equal(state!.textLayers[0].z_index,2)
 act(()=>state.undo());assert.equal(state!.videoLayers.length,1);assert.equal(state!.textLayers[0].z_index,1)
 act(()=>state.redo());assert.equal(state!.videoLayers[1].z_index,1);assert.equal(state!.textLayers[0].z_index,2)
 act(()=>renderer!.unmount())
})

test('bookmark changes share the same undo history without modifying clips',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips([original]))
 act(()=>state.setBookmarks([{id:'a',time:1,note:'提示'}]))
 act(()=>state.setBookmarks(previous=>previous.map(item=>({...item,time:2}))))
 assert.equal(state!.bookmarks[0].time,2);assert.deepEqual(state!.clips,[original])
 act(()=>state.undo());assert.equal(state!.bookmarks[0].time,1)
 act(()=>state.undo());assert.equal(state!.bookmarks.length,0)
 act(()=>state.redo());assert.equal(state!.bookmarks[0].note,'提示')
 act(()=>state.resetClips([original],[],[],[],[],[{id:'saved',time:3}]))
 assert.equal(state!.bookmarks[0].id,'saved');assert.equal(state!.canUndo,false)
 act(()=>renderer!.unmount())
})

test('dropping a main-track image keeps its type through undo and redo',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips([original]))
 act(()=>state.insertDroppedMedia([{kind:'image',resource:'image',duration:5,start:1,id:'i',main:true}]))
 assert.deepEqual(state!.clips[1],{resource_uuid:'image',media_type:'image',start:0,end:5,rate:1,volume_db:0})
 assert.equal(state!.imageLayers.length,0)
 act(()=>state.undo());assert.equal(state!.clips.length,1)
 act(()=>state.redo());assert.equal(state!.clips[1].media_type,'image')
 act(()=>renderer!.unmount())
})

test('effect tracks retain visual order, grouping, visibility and undo',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>
 act(()=>{renderer=create(createElement(Harness))})
 act(()=>state.resetClips([original],[],[{text:'T',start:0,end:2,x:.5,y:.5,size:40,color:'FFFFFF',opacity:1,font:'sans',track_id:'t',z_index:0}]))
 act(()=>state.insertVisualLayer('effect',{start:0,end:2,intensity:15},'fx'))
 assert.equal(state!.effectLayers.length,1)
 act(()=>state.moveVisualLayer('effect',0,-1));assert.ok(state!.effectLayers[0].z_index!<state!.textLayers[0].z_index!)
 act(()=>state.toggleVisualTrack('effect',0));assert.equal(state!.effectLayers[0].track_hidden,true)
 act(()=>state.undo());assert.equal(state!.effectLayers[0].track_hidden,false)
 act(()=>state.undo());assert.ok(state!.effectLayers[0].z_index!>state!.textLayers[0].z_index!)
 act(()=>renderer!.unmount())
})

test('ripple edits on mixed tracks undo and redo as a single operation',()=>{
 let state:ReturnType<typeof useClipHistory>
 function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>;act(()=>{renderer=create(createElement(Harness))})
 const video={resource_uuid:'v',start:0,end:2,source_start:0,rate:1,volume_db:0,track_id:'mix'}
 const image={resource_uuid:'i',start:3,end:5,x:.5,y:.5,scale:1,opacity:1,track_id:'mix'}
 act(()=>state.resetClips([original],[],[],[image],[video]))
 act(()=>state.applyRipple({kind:'video',index:0},state.videoLayers[0],{type:'delete'}))
 assert.equal(state!.videoLayers.length,0);assert.equal(state!.imageLayers[0].start,1)
 act(()=>state.undo());assert.equal(state!.videoLayers.length,1);assert.equal(state!.imageLayers[0].start,3)
 act(()=>state.redo());assert.equal(state!.videoLayers.length,0);assert.equal(state!.imageLayers[0].start,1)
 act(()=>renderer!.unmount())
})

test('multi-track clipboard paste is one undoable change and rejects stale snapshots',async()=>{
 const {copyTimelineItems}=await import('../clipboard')
 let state:ReturnType<typeof useClipHistory>;function Harness(){state=useClipHistory();return null}
 let renderer:ReturnType<typeof create>;act(()=>{renderer=create(createElement(Harness))})
 const image={resource_uuid:'i',start:1,end:3,x:.5,y:.5,scale:1,opacity:1},text={text:'x',start:2,end:4,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans' as const}
 act(()=>state.resetClips([original],[],[text],[image]));const snapshot={clips:state!.clips,videoLayers:state!.videoLayers,imageLayers:state!.imageLayers,textLayers:state!.textLayers,effectLayers:state!.effectLayers,audioLayers:state!.audioLayers},items=copyTimelineItems(snapshot,[{kind:'image',index:0},{kind:'text',index:0}])
 act(()=>state.applyPaste(items,5,['a','b'],snapshot));assert.equal(state!.imageLayers.length,2);assert.equal(state!.textLayers.length,2)
 act(()=>state.undo());assert.equal(state!.imageLayers.length,1);assert.equal(state!.textLayers.length,1)
 act(()=>state.redo());assert.equal(state!.imageLayers.length,2);assert.equal(state!.textLayers.length,2)
 act(()=>state.applyPaste(items,5,['c','d'],snapshot));assert.equal(state!.imageLayers.length,2)
 act(()=>renderer!.unmount())
})

test('adding a main clip to an intentionally empty draft is undoable',()=>{
 let state!:ReturnType<typeof useClipHistory>;function Harness(){state=useClipHistory();return null}
 let renderer!:ReturnType<typeof create>;act(()=>{renderer=create(createElement(Harness))});act(()=>state.resetClips([]));act(()=>state.setClips([original]));assert.equal(state.canUndo,true);act(()=>state.undo());assert.deepEqual(state.clips,[]);act(()=>state.redo());assert.deepEqual(state.clips,[original]);act(()=>renderer.unmount())
})
test('empty main track retains visibility through undo, redo, and a dropped clip',()=>{
 let state!:ReturnType<typeof useClipHistory>;function Harness(){state=useClipHistory();return null}
 let renderer!:ReturnType<typeof create>;act(()=>{renderer=create(createElement(Harness))});act(()=>state.resetClips([original]));act(()=>state.toggleMainTrack());assert.equal(state.mainTrackHidden,true);act(()=>state.setClips([]));assert.equal(state.mainTrackHidden,true);act(()=>state.insertDroppedMedia([{kind:'video',resource:original.resource_uuid,duration:2,start:0,id:'added',main:true}]));assert.equal(state.clips[0].track_hidden,true);act(()=>state.undo());assert.equal(state.clips.length,0);assert.equal(state.mainTrackHidden,true);act(()=>state.undo());assert.equal(state.clips[0].track_hidden,true);act(()=>state.undo());assert.equal(state.mainTrackHidden,false);act(()=>state.redo());assert.equal(state.mainTrackHidden,true);act(()=>renderer.unmount())
})
