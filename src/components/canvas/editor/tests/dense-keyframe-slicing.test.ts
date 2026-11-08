import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageLayer, TextLayer, VisualEffect } from '../api'
import { sliceImageLayer, validImageKeyframes } from '../image-keyframes'
import { sliceTextLayer, validTextKeyframes } from '../text-keyframes'
import { colorValue } from '../color-keyframes'
import { valueAt } from '../keyframe-values'
import { sliceVisualEffects, validVisualEffects } from '../visual-effects'

const points=()=>Array.from({length:34},(_,i)=>({time:1.1+i*.05,value:.2+i*.01}))
const colors=()=>Array.from({length:34},(_,i)=>({time:1.1+i*.05,value:(i*5).toString(16).padStart(2,'0')+'33AA'}))
const effect=():VisualEffect=>({type:'blur',enabled:true,intensity:10,keyframes:points().map(p=>({...p,value:p.value*10}))})
const image=():ImageLayer=>({resource_uuid:'image',start:1,end:3,x:.5,y:.5,scale:1,opacity:1,keyframes:{x:points()},effects:[effect()]})
const text=():TextLayer=>({text:'测试',start:1,end:3,x:.5,y:.5,size:100,color:'FFFFFF',font:'sans',opacity:1,background:{enabled:true,color:'000000',padding:20},keyframes:{x:points(),background_padding_x:points().map(p=>({...p,value:p.value*100})),color:colors(),background_color:colors()},effects:[effect()]})

test('repeated full and selected slicing preserves dense image, text and effect keyframes',()=>{
 let i=image(), t=text()
 for(let iteration=0;iteration<3;iteration++){
  const previousI=i,previousT=t
  i=sliceImageLayer(i,1,3,0)!;t=sliceTextLayer(t,1,3,0)!
  assert.ok(validImageKeyframes(i));assert.ok(validTextKeyframes(t));assert.ok(validVisualEffects(i.effects));assert.ok(validVisualEffects(t.effects))
  for(const at of [1,1.05,1.1,1.45,2.3,2.75,2.9,3]){
   assert.ok(Math.abs(valueAt(i.x,i.keyframes!.x,at)-valueAt(previousI.x,previousI.keyframes!.x,at))<1e-8)
   assert.ok(Math.abs(valueAt(t.x,t.keyframes!.x,at)-valueAt(previousT.x,previousT.keyframes!.x,at))<1e-8)
   assert.ok(Math.abs(valueAt(10,t.effects![0].keyframes,at)-valueAt(10,previousT.effects![0].keyframes,at))<1e-8)
   assert.equal(colorValue(t,'color',at).toUpperCase(),colorValue(previousT,'color',at).toUpperCase())
   assert.equal(colorValue(t,'background_color',at).toUpperCase(),colorValue(previousT,'background_color',at).toUpperCase())
  }
 }
 assert.equal(i.keyframes!.x!.length,34);assert.equal(t.keyframes!.color!.length,34)
 const selected=sliceTextLayer(t,1.03,2.95,1.03)!
 assert.ok(validTextKeyframes(selected));assert.ok(validVisualEffects(selected.effects))
 assert.equal(selected.start,0);assert.ok(Math.abs(valueAt(selected.x,selected.keyframes!.x,.42)-valueAt(t.x,t.keyframes!.x,1.45))<1e-8)
})

test('effect slicing retains at most 34 keys with required non-flat boundaries',()=>{
 const original=effect(), keys=[{time:.9,value:1},...points().slice(0,32).map(p=>({...p,value:p.value*10})),{time:3.1,value:8}]
 original.keyframes=keys
 const sliced=sliceVisualEffects([original],1,3,1)![0]
 assert.ok(validVisualEffects([sliced]));assert.equal(sliced.keyframes!.length,34)
 for(const at of [1,1.05,1.5,2.5,2.95,3])assert.ok(Math.abs(valueAt(10,sliced.keyframes,at-1)-valueAt(10,keys,at))<1e-8)
})

test('removes only the redundant boundary when the other clips an active segment',()=>{
 const layer=text(),inside=points().slice(0,33),pointsWithOutside=[...inside,{time:3.1,value:.9}]
 layer.keyframes={x:pointsWithOutside}
 const sliced=sliceTextLayer(layer,1,3,1)!
 assert.ok(validTextKeyframes(sliced));assert.equal(sliced.keyframes!.x!.length,34)
 assert.equal(sliced.keyframes!.x!.at(-1)!.time,2)
 for(const at of [1,1.05,1.5,2.5,2.8,2.95,3])assert.ok(Math.abs(valueAt(sliced.x,sliced.keyframes!.x,at-1)-valueAt(layer.x,pointsWithOutside,at))<1e-8)
})
