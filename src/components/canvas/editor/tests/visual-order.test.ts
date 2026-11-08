import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageLayer, TextLayer, VideoLayer } from '../api'
import { nextVisualZ, orderedVisuals, reorderVisuals, reorderVisualsTo, validVisualZ } from '../visual-order'

const video:VideoLayer={resource_uuid:'v',start:0,end:2,source_start:0,rate:1,volume_db:0}
const image:ImageLayer={resource_uuid:'i',start:0,end:2,x:.5,y:.5,scale:1,opacity:1}
const text:TextLayer={text:'x',start:0,end:2,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans'}
test('legacy visual order and atomic cross-type reorder',()=>{
 const before=orderedVisuals([video],[image],[text]);assert.deepEqual(before.map(ref=>ref.kind),['video','image','text'])
 const moved=reorderVisuals([video],[image],[text],'video',0,1)!
 assert.deepEqual(orderedVisuals(moved.videos,moved.images,moved.text).map(ref=>ref.kind),['image','video','text'])
 assert.equal(video.z_index,undefined);assert.equal(image.z_index,undefined)
 assert.equal(nextVisualZ(moved.videos,moved.images,moved.text),3)
 assert.equal(reorderVisuals(moved.videos,moved.images,moved.text,'text',0,1),undefined)
 assert.equal(validVisualZ({z_index:-1}),false);assert.equal(validVisualZ({z_index:1.5}),false);assert.equal(validVisualZ({}),true)
})

test('drag moves a layer across several positions and rejects missing or unchanged targets',()=>{
 const v2={...video,resource_uuid:'v2'},old=[video,v2]
 const moved=reorderVisualsTo(old,[image],[text],{kind:'video',index:0},{kind:'text',index:0})!
 assert.deepEqual(orderedVisuals(moved.videos,moved.images,moved.text).map(ref=>`${ref.kind}:${ref.index}`),['video:1','image:0','text:0','video:0'])
 assert.equal(reorderVisualsTo(old,[image],[text],{kind:'video',index:0},{kind:'video',index:0}),undefined)
 assert.equal(reorderVisualsTo(old,[image],[text],{kind:'video',index:7},{kind:'text',index:0}),undefined)
 assert.equal(reorderVisualsTo(old,[image],[text],{kind:'video',index:0},{kind:'text',index:7}),undefined)
})
