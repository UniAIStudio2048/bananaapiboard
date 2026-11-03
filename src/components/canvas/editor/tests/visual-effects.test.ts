import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageLayer, TextLayer, VideoLayer, VisualEffect } from '../api'
import { setEffectKeyframe, toggleEffectKeyframe, validVisualEffects } from '../visual-effects'
import { sliceImageLayer } from '../image-keyframes'
import { sliceTextLayer } from '../text-keyframes'
import { moveTimelineLayer, sliceVideoLayer, splitTimelineLayer } from '../TimelineLayer'

const effect:VisualEffect={type:'blur',enabled:true,intensity:15,keyframes:[{time:0,value:0},{time:4,value:100}]}
const text:TextLayer={text:'test',start:0,end:4,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans',effects:[effect]}
const image:ImageLayer={resource_uuid:'img',start:0,end:4,x:.5,y:.5,scale:1,opacity:1,effects:[effect]}
test('asset blur validates and edits intensity keyframes',()=>{
 assert.equal(validVisualEffects([effect]),true)
 assert.equal(validVisualEffects([{...effect,intensity:101}]),false)
 assert.equal(validVisualEffects([{...effect,keyframes:[{time:1,value:0},{time:1,value:1}]}]),false)
 assert.equal(validVisualEffects(Array(9).fill(effect)),false)
 assert.equal(validVisualEffects([{...effect,keyframes:[null] as never}]),false)
 assert.equal(setEffectKeyframe(effect,2,40).keyframes?.[1].value,40)
 assert.deepEqual(toggleEffectKeyframe(effect,0).keyframes,[{time:4,value:100}])
})
test('selected range remaps absolute image and text effect keyframes preserving interpolation',()=>{
 for(const item of [sliceTextLayer(text,1,3,1),sliceImageLayer(image,1,3,1)]) {
  assert.ok(item)
  assert.deepEqual(item.effects?.[0].keyframes,[{time:0,value:25},{time:2,value:75}])
 }
})
test('moving visual layers shifts effect keys but video overlay source keys stay fixed',()=>{
 const shifted=moveTimelineLayer({...text,start:1,end:4,effects:[{...effect,keyframes:[{time:.5,value:0},{time:3,value:100}]}]},'move',-2)
 assert.equal(shifted.start,.5)
 assert.deepEqual(shifted.effects?.[0].keyframes,[{time:0,value:0},{time:2.5,value:100}])
 const video:VideoLayer={resource_uuid:'v',start:2,end:4,source_start:1,rate:2,volume_db:0,effects:[effect]}
 assert.deepEqual(moveTimelineLayer(video,'move',1).effects,video.effects)
 assert.equal(splitTimelineLayer(video,3,'both')[1].source_start,3)
 assert.equal(sliceVideoLayer(video,3,3.5,3)?.source_start,3)
 assert.deepEqual(sliceVideoLayer(video,3,3.5,3)?.effects,video.effects)
})
