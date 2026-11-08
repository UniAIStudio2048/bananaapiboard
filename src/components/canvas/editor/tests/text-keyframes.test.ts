import assert from 'node:assert/strict'
import test from 'node:test'
import type { TextLayer } from '../api'
import { keyframeTime, setTextKeyframe, sliceTextLayer, toggleTextKeyframe, validTextBackground, validTextKeyframes, valueAt } from '../text-keyframes'

test('text keyframes interpolate and preserve values when a selected clip is exported', () => {
 let layer: TextLayer = {text:'字幕',start:0,end:4,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans'}
 layer=setTextKeyframe(layer,'x',0,.2);layer=setTextKeyframe(layer,'x',4,.8)
 assert.ok(Math.abs(valueAt(layer.x,layer.keyframes?.x,2)-.5)<.0001)
 const sliced=sliceTextLayer(layer,1,3,1)!
 assert.equal(sliced.start,0);assert.equal(sliced.end,2)
 assert.ok(Math.abs(valueAt(sliced.x,sliced.keyframes?.x,0)-.35)<.0001)
 assert.ok(Math.abs(valueAt(sliced.x,sliced.keyframes?.x,2)-.65)<.0001)
 assert.equal(validTextKeyframes(sliced),true)
 const one=setTextKeyframe({...layer,keyframes:undefined},'x',1,.7)
 const removed=toggleTextKeyframe(one,'x',1)
 assert.equal(removed.x,.7);assert.equal(removed.keyframes?.x?.length,0)
 assert.equal(validTextKeyframes({...layer,keyframes:{x:[{time:1,value:.2},{time:1,value:.8}]}}),false)
})

test('text background is optional, validated, and preserved by selection export', () => {
 const layer:TextLayer={text:'字幕',start:0,end:3,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans',background:{enabled:true,color:'FF0000',padding:40}}
 assert.equal(validTextBackground(layer),true)
 assert.deepEqual(sliceTextLayer(layer,1,2,1)?.background,layer.background)
 assert.equal(validTextBackground({...layer,background:undefined}),true)
 assert.equal(validTextBackground({...layer,background:{enabled:true,color:'red:enable=1',padding:40}}),false)
 assert.equal(validTextBackground({...layer,background:{enabled:true,color:'FFFFFF',padding:Infinity}}),false)
})

test('text scale defaults to one and selection export retains animated boundaries',()=>{
 let layer:TextLayer={text:'字幕',start:0,end:4,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans'}
 layer=toggleTextKeyframe(layer,'scale',0)
 assert.equal(layer.keyframes?.scale?.[0].value,1)
 layer=setTextKeyframe(layer,'scale',4,2)
 const part=sliceTextLayer(layer,1,3,1)!
 assert.equal(part.keyframes?.scale?.[0].value,1.25)
 assert.equal(part.keyframes?.scale?.[1].value,1.75)
 assert.equal(part.size,100)
 assert.equal(validTextKeyframes({...layer,scale:0}),false)
 assert.equal(validTextKeyframes({...layer,keyframes:{scale:[{time:1,value:5}]}}),false)
})


test('adjacent 120 fps frames retain distinct keyframe timestamps',()=>{
 assert.equal(keyframeTime(1/120),.008)
 assert.equal(keyframeTime(2/120),.017)
 let layer:TextLayer={text:'字幕',start:0,end:1,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans'}
 layer=setTextKeyframe(layer,'scale',1/120,1);layer=setTextKeyframe(layer,'scale',2/120,2)
 assert.equal(layer.keyframes?.scale?.length,2)
 assert.equal(validTextKeyframes(layer),true)
})

test('background geometry keyframes validate, move and preserve selected export boundaries',async()=>{
 const {backgroundValue,setBackgroundKeyframe,toggleBackgroundKeyframe}=await import('../text-keyframes')
 const {moveTimelineLayer}=await import('../TimelineLayer')
 let layer:TextLayer={text:'字幕',start:0,end:4,x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans',background:{enabled:true,color:'FF0000',padding:30}}
 assert.equal(backgroundValue(layer,'background_padding_x',0),30)
 layer=setBackgroundKeyframe(layer,'background_padding_x',0,20);layer=setBackgroundKeyframe(layer,'background_padding_x',4,100)
 layer=setBackgroundKeyframe(layer,'background_offset_x',0,-20);layer=setBackgroundKeyframe(layer,'background_offset_x',4,20)
 layer=setBackgroundKeyframe(layer,'background_radius',0,0);layer=setBackgroundKeyframe(layer,'background_radius',4,100)
 assert.equal(backgroundValue(layer,'background_radius',2),50);assert.equal(validTextKeyframes(layer),true)
 const sliced=sliceTextLayer(layer,1,3,1)!
 assert.deepEqual(sliced.keyframes?.background_padding_x,[{time:0,value:40},{time:2,value:80}])
 assert.deepEqual(sliced.keyframes?.background_offset_x,[{time:0,value:-10},{time:2,value:10}])
 assert.deepEqual(moveTimelineLayer(layer,'move',1).keyframes?.background_radius,[{time:1,value:0},{time:5,value:100}])
 const one=toggleBackgroundKeyframe({...layer,keyframes:{background_radius:[{time:1,value:40}]}},'background_radius',1)
 assert.equal(one.background?.radius,40);assert.equal(one.keyframes?.background_radius?.length,0)
 assert.equal(validTextBackground({...layer,background:{...layer.background!,radius:101}}),false)
 assert.equal(validTextKeyframes({...layer,keyframes:{background_offset_x:[{time:0,value:-601}]}}),false)
})
