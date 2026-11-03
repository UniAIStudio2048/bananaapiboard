import assert from 'node:assert/strict'
import test from 'node:test'
import type { AudioLayer, TextLayer } from '../api'
import { constrainTrackTrim, moveTimelineLayer, sliceVideoLayer, snapTimelineDelta, splitTimelineLayer } from '../TimelineLayer'

test('dragging audio preserves source time and prevents trimming outside its source', () => {
 const audio:AudioLayer={resource_uuid:'audio',start:2,end:5,source_start:1,volume_db:0}
 assert.deepEqual(moveTimelineLayer(audio,'move',1,5),{...audio,start:3,end:6})
 assert.deepEqual(moveTimelineLayer(audio,'start',.5,5),{...audio,start:2.5,source_start:1.5})
 assert.deepEqual(moveTimelineLayer(audio,'start',-3,5),{...audio,start:1,source_start:0})
 assert.equal(moveTimelineLayer(audio,'end',4,5).end,6)
 const split=splitTimelineLayer(audio,3,'both');assert.equal(split.length,2);assert.equal(split[0].end,3);assert.equal(split[1].start,3);assert.equal(split[1].source_start,2)
 assert.equal(snapTimelineDelta(audio,'move',.92,[3,10],.15),1)
})
test('moving text shifts keyframes and clamps all times at the timeline boundary', () => {
 const text:TextLayer={text:'x',start:1,end:3,x:.5,y:.5,size:40,color:'FFFFFF',font:'sans',opacity:1,keyframes:{x:[{time:.5,value:0},{time:2,value:1}]}}
 const moved=moveTimelineLayer(text,'move',-2)
 assert.equal(moved.start,.5);assert.equal(moved.end,2.5);assert.deepEqual(moved.keyframes?.x,[{time:0,value:0},{time:1.5,value:1}])
 assert.deepEqual(moveTimelineLayer(text,'start',.5).keyframes,text.keyframes)
})

test('video overlay trim and split convert timeline time to source time at playback speed', () => {
 const layer={resource_uuid:'video',start:2,end:4,source_start:1,rate:2,volume_db:0}
 assert.deepEqual(moveTimelineLayer(layer,'start',.5,5),{...layer,start:2.5,source_start:2})
 assert.deepEqual(moveTimelineLayer(layer,'start',-2,5),{...layer,start:1.5,source_start:0})
 assert.equal(moveTimelineLayer({...layer,end:3},'end',4,5).end,4)
 assert.equal(splitTimelineLayer(layer,3,'both')[1].source_start,3)
 assert.deepEqual(sliceVideoLayer(layer,3,3.5,3),{...layer,start:0,end:.5,source_start:3})
 assert.equal(sliceVideoLayer(layer,5,6,5),undefined)
})


test('trimming a shared track stops at adjacent clips and preserves audio source timing', () => {
 const audio:AudioLayer={resource_uuid:'audio',start:2,end:4,source_start:2,volume_db:0}
 const siblings:AudioLayer[]=[{...audio,start:0,end:1.5},{...audio,start:4.5,end:6}]
 const left=constrainTrackTrim(audio,moveTimelineLayer(audio,'start',-1,10),'start',siblings,10)
 assert.equal(left.start,1.5);assert.equal(left.source_start,1.5)
 const right=constrainTrackTrim(audio,moveTimelineLayer(audio,'end',1,10),'end',siblings,10)
 assert.equal(right.end,4.5)
 const moved=moveTimelineLayer(audio,'move',1,10)
 assert.deepEqual(constrainTrackTrim(audio,moved,'move',siblings,10),moved)
})


test('copying a fractional duration lands exactly on the adjacent boundary', () => {
 const layer:AudioLayer={resource_uuid:'audio',start:.034833,end:2,source_start:0,volume_db:0}
 const copy=moveTimelineLayer(layer,'move',layer.end-layer.start,undefined,false)
 assert.equal(copy.start,layer.end)
 assert.ok(Math.abs((copy.end-copy.start)-(layer.end-layer.start))<1e-12)
})
