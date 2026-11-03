import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageLayer, TextLayer, VideoClip, VideoLayer } from '../api'
import { isHidden, validVisibility, visibleClip, visibleImage, visibleText, visibleVideo } from '../visibility'

test('editor visibility is stripped from export while animation, audio and duration remain intact',()=>{
 const transform={x:.2,y:.3,scale:4,rotation:10,opacity:.7,keyframes:{scale:[{time:0,value:4}],opacity:[{time:0,value:.5},{time:1,value:1}],x:[{time:0,value:.2}]}}
 const clip:VideoClip={resource_uuid:'video',start:0,end:2,rate:1,volume_db:-3,transform,hidden:true}
 const overlay:VideoLayer={resource_uuid:'video',start:1,end:4,source_start:0,rate:1,volume_db:2,transform,track_hidden:true}
 const image:ImageLayer={resource_uuid:'image',start:0,end:5,x:.5,y:.5,scale:4,opacity:.7,keyframes:{scale:[{time:0,value:4}],opacity:[{time:0,value:1}],x:[{time:0,value:.5}]},hidden:true}
 const text:TextLayer={text:'标题',start:0,end:6,x:.5,y:.5,size:100,color:'FFFFFF',opacity:.7,font:'sans',keyframes:{opacity:[{time:0,value:1}],rotation:[{time:0,value:30}]},track_hidden:true}
 const c=visibleClip(clip),v=visibleVideo(overlay),i=visibleImage(image),t=visibleText(text)
 assert.equal(c.transform?.opacity,0);assert.equal(c.transform?.scale,1);assert.equal(c.transform?.keyframes?.scale,undefined);assert.equal(c.transform?.keyframes?.opacity,undefined);assert.deepEqual(c.transform?.keyframes?.x,transform.keyframes.x);assert.equal(c.volume_db,-3)
 assert.equal(v.transform?.opacity,0);assert.equal(v.volume_db,2);assert.equal(v.muted,undefined);assert.equal(v.end,4)
 assert.equal(i.opacity,0);assert.equal(i.scale,1);assert.equal(i.keyframes?.scale,undefined);assert.equal(i.keyframes?.opacity,undefined);assert.equal(i.end,5);assert.equal(t.opacity,0);assert.equal(t.keyframes?.opacity,undefined);assert.equal(t.end,6);assert.equal(t.keyframes?.rotation,undefined);assert.equal(text.keyframes?.rotation?.[0]?.value,30)
 for(const item of [c,v,i,t]){assert.ok(!('hidden' in item));assert.ok(!('track_hidden' in item))}
 assert.equal(clip.transform?.opacity,.7);assert.equal(clip.transform?.keyframes?.opacity?.length,2)
 assert.equal(isHidden({hidden:false,track_hidden:true}),true);assert.equal(isHidden({hidden:false,track_hidden:false}),false)
 assert.equal(validVisibility({hidden:true}),true);assert.equal(validVisibility({hidden:'yes' as unknown as boolean}),false)
 assert.deepEqual(visibleClip({...clip,hidden:false,track_hidden:false}),{resource_uuid:'video',start:0,end:2,rate:1,volume_db:-3,transform})
})
