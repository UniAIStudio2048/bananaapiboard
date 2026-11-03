import assert from 'node:assert/strict'
import test from 'node:test'
import { splitClip, timelineSeek, type VideoClip, type VideoTransform } from '../api'
import { valueAt } from '../text-keyframes'
import { setVideoKeyframe, toggleVideoKeyframe, validVideoTransform } from '../video-keyframes'

test('video keyframes stay at source times across splitting and playback speed changes', () => {
 let transform: VideoTransform={scale:1,x:0,y:0,rotation:0,opacity:1}
 transform=setVideoKeyframe(transform,'x',1,-.5);transform=setVideoKeyframe(transform,'x',3,.5)
 const clip:VideoClip={resource_uuid:'source',start:0,end:4,rate:2,volume_db:0,transform}
 const split=splitClip([clip],0,2)
 const right=split[1], seek=timelineSeek(split,1.25)
 assert.equal(seek.index,1);assert.equal(seek.sourceTime,2.5)
 assert.equal(valueAt(right.transform!.x,right.transform!.keyframes?.x,seek.sourceTime),.25)
 assert.equal(validVideoTransform(transform),true)
 assert.equal(validVideoTransform({...transform,keyframes:{x:[{time:2,value:0},{time:1,value:0}]}}),false)
 assert.equal(validVideoTransform({...transform,keyframes:{scale:[{time:0,value:0}]}}),false)
 const single=setVideoKeyframe({...transform,keyframes:undefined},'rotation',1,50)
 assert.equal(toggleVideoKeyframe(single,'rotation',1).rotation,50)
})

test('transferred video transforms accept 34 boundary keys without allowing extra user keys',()=>{
 const points=Array.from({length:34},(_,index)=>({time:index/10,value:index/100}))
 const transform:VideoTransform={scale:1,x:0,y:0,rotation:0,opacity:1,keyframes:{x:points}}
 assert.equal(validVideoTransform(transform),true)
 assert.equal(validVideoTransform({...transform,keyframes:{x:[...points,{time:4,value:.4}]}}),false)
 assert.equal(setVideoKeyframe(transform,'x',4,.2),transform)
 assert.equal(setVideoKeyframe(transform,'x',.5,.25).keyframes!.x![5].value,.25)
})
