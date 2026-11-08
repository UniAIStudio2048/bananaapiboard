import assert from 'node:assert/strict'
import test from 'node:test'
import { insertVisual, moveVisualItem } from '../tracks'
import { validVisibility, visibleImage, visibleVideo } from '../visibility'
import type { ImageLayer, VideoLayer } from '../api'

const video:VideoLayer={resource_uuid:'video',start:0,end:1,source_start:0,rate:1,volume_db:0,track_id:'muted',track_muted:true,z_index:0}
const image:ImageLayer={resource_uuid:'image',start:1,end:2,x:.5,y:.5,scale:1,opacity:1}

test('mixed visual tracks inherit mute and never send editor metadata to rendering',()=>{
 const inserted=insertVisual({videos:[video],images:[],text:[]},'image',image,'unused',{kind:'video',index:0},undefined,'target')
 assert.equal(inserted.images[0].track_muted,true)
 assert.equal(visibleVideo(video).muted,true)
 assert.equal('track_muted' in visibleVideo(video),false)
 assert.equal('track_muted' in visibleImage(inserted.images[0]),false)
 assert.equal(validVisibility({track_muted:'yes'} as never),false)
 const moved=moveVisualItem(inserted,{kind:'video',index:0},{...video,muted:true},'new-track','missing')!
 assert.equal(moved.videos[0].track_muted,false)
 assert.equal(visibleVideo(moved.videos[0]).muted,true)
 assert.equal(moved.images[0].track_muted,true)
})

test('video moved to a muted image-only track inherits its track mute',()=>{
 const first={...image,start:2,end:3,track_id:'target',track_muted:true,z_index:1}
 const input={videos:[{...video,track_id:'source',track_muted:false}],images:[first],text:[]}
 const moved=moveVisualItem(input,{kind:'video',index:0},input.videos[0],'unused','video:target')!
 assert.equal(moved.videos[0].track_id,'target')
 assert.equal(moved.videos[0].track_muted,true)
 assert.equal(visibleVideo(moved.videos[0]).muted,true)
})
