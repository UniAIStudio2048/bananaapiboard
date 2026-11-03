import test from 'node:test'
import assert from 'node:assert/strict'
import type {TextLayer} from '../api'
import {colorValue,setColorKeyframe,toggleColorKeyframe} from '../color-keyframes'
import {sliceTextLayer,validTextKeyframes} from '../text-keyframes'
import {moveTimelineLayer} from '../TimelineLayer'
import {timelineSnapTargets} from '../timeline-snap'
const fixture=():TextLayer=>({text:'测试',font:'sans',color:'FF0000',background:{enabled:true,color:'000000',padding:30},x:.5,y:.5,size:100,opacity:1,start:0,end:2})
test('color keys interpolate and toggle without losing the displayed value',()=>{
 let layer=fixture();layer=toggleColorKeyframe(layer,'color',0);layer=setColorKeyframe(layer,'color',1,'00FF00')
 assert.equal(colorValue(layer,'color',.5),'808000');layer=toggleColorKeyframe(layer,'color',1);layer=toggleColorKeyframe(layer,'color',0);assert.equal(layer.color,'FF0000');assert.equal(validTextKeyframes(layer),true)
})
test('color keys move, snap and survive selected export boundary slicing',()=>{
 const layer={...fixture(),keyframes:{color:[{time:0,value:'FF0000'},{time:2,value:'00FF00'}],background_color:[{time:.5,value:'000000'},{time:1.5,value:'FFFFFF'}]}}
 const sliced=sliceTextLayer(layer,.5,1.5,.5)!;assert.deepEqual(sliced.keyframes?.color,[{time:0,value:'BF4000'},{time:1,value:'40BF00'}]);assert.deepEqual(sliced.keyframes?.background_color,[{time:0,value:'000000'},{time:1,value:'FFFFFF'}])
 const moved=moveTimelineLayer(layer,'move',2);assert.equal(moved.keyframes?.color?.[1].time,4);assert.equal(moved.keyframes?.background_color?.[0].time,2.5)
 const targets=timelineSnapTargets([],[],[],[],[],[layer],0,'audio',0);assert.ok(targets.includes(.5)&&targets.includes(1.5))
 assert.equal(validTextKeyframes({...layer,keyframes:{color:[{time:0,value:'no'}]}}),false)
})
