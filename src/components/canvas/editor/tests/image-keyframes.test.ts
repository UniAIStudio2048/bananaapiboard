import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageLayer } from '../api'
import { imageValue, setImageKeyframe, sliceImageLayer, toggleImageKeyframe, validImageKeyframes } from '../image-keyframes'
import { moveTimelineLayer, splitTimelineLayer } from '../TimelineLayer'

test('image keyframes interpolate, move with the clip, and retain export boundary values', () => {
 let layer:ImageLayer={resource_uuid:'image',start:1,end:5,x:.5,y:.5,scale:1,opacity:1}
 layer=setImageKeyframe(layer,'x',1,0);layer=setImageKeyframe(layer,'x',5,1)
 layer=setImageKeyframe(layer,'rotation',1,0);layer=setImageKeyframe(layer,'rotation',5,90)
 assert.equal(imageValue(layer,'x',3),.5);assert.equal(imageValue(layer,'rotation',3),45)
 const moved=moveTimelineLayer(layer,'move',1);assert.deepEqual(moved.keyframes?.x,[{time:2,value:0},{time:6,value:1}])
 const split=splitTimelineLayer(layer,3,'both');assert.equal(imageValue(split[1],'rotation',4),67.5)
 const sliced=sliceImageLayer(layer,2,4,2)!;assert.deepEqual(sliced.keyframes?.x,[{time:0,value:.25},{time:2,value:.75}]);assert.equal(imageValue(sliced,'rotation',1),45)
 assert.equal(validImageKeyframes({...layer,rotation:361}),false)
 assert.equal(validImageKeyframes({...layer,keyframes:{scale:[{time:1,value:5}]}}),false)
 const noKeys=toggleImageKeyframe({...layer,keyframes:{rotation:[{time:2,value:30}]}},'rotation',2);assert.equal(noKeys.rotation,30);assert.deepEqual(noKeys.keyframes?.rotation,[])
})
