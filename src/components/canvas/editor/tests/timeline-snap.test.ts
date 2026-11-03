import assert from 'node:assert/strict'
import test from 'node:test'
import { frameTime, timelineSnapTargets } from '../timeline-snap'
import { snapTimelineDelta } from '../TimelineLayer'

test('frame alignment follows project frame boundaries even with snapping disabled',()=>{
 assert.equal(frameTime(.516,30),.5)
 assert.equal(frameTime(.518,30),16/30)
 assert.equal(frameTime(.51,24),.5)
})

test('snap targets include visible keyframes across all tracks and exclude the moving clip',()=>{
 const transform={scale:1,x:0,y:0,rotation:0,opacity:1,keyframes:{x:[{time:1,value:0},{time:3,value:1},{time:5,value:0}]}}
 const clips=[{resource_uuid:'a',start:1,end:4,rate:2,volume_db:0,transform}]
 const videos=[{resource_uuid:'b',start:2,end:4,source_start:1,rate:2,volume_db:0,transform}]
 const images=[{resource_uuid:'i',start:1,end:5,x:.5,y:.5,scale:1,opacity:1,keyframes:{x:[{time:1.25,value:.5},{time:8,value:1}]}}]
 const text=[{text:'T',start:0,end:4,x:.5,y:.5,size:40,color:'FFFFFF',opacity:1,font:'sans' as const,keyframes:{size:[{time:2.25,value:40}]}}]
 const targets=timelineSnapTargets(clips,[0,1.5],videos,[],images,text,.75,'overlay',0)
 assert.ok(targets.includes(1),'main clip source keyframe must map through rate')
 assert.ok(targets.includes(1.25));assert.ok(targets.includes(2.25));assert.ok(targets.includes(.75))
 assert.ok(!targets.includes(3),'selected overlay must not snap to its own keyframes')
 assert.ok(!targets.includes(8),'out-of-range image keyframes must not become invisible snap targets')
 const moved={resource_uuid:'x',start:0,end:1,source_start:0,rate:1,volume_db:0}
 assert.ok(Math.abs(snapTimelineDelta(moved,'move',1.2,targets,.06)-1.25)<1e-12,'closest end or start may snap to a keyframe')
})


test('effect intensity keyframes snap at source or timeline time as appropriate',()=>{
 const effect={type:'blur' as const,enabled:true,intensity:15,keyframes:[{time:2,value:20},{time:5,value:40}]}
 const clips=[{resource_uuid:'a',start:1,end:4,rate:2,volume_db:0,effects:[effect]}]
 const video=[{resource_uuid:'b',start:4,end:6,source_start:1,rate:2,volume_db:0,effects:[effect]}]
 const image=[{resource_uuid:'i',start:1,end:3,x:.5,y:.5,scale:1,opacity:1,effects:[effect]}]
 const text=[{text:'x',start:1,end:3,x:.5,y:.5,size:50,color:'FFFFFF',opacity:1,font:'sans' as const,effects:[effect]}]
 const targets=timelineSnapTargets(clips,[0,1.5],video,[],image,text,0,'audio',-1)
 assert.ok(targets.includes(.5));assert.ok(targets.includes(4.5));assert.ok(targets.includes(2));assert.ok(!targets.includes(5))
 const excluded=timelineSnapTargets([],[],[],[],image,[],0,'image',0,[],false)
 assert.ok(!excluded.includes(2))
})
