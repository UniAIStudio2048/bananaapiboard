import assert from 'node:assert/strict'
import test from 'node:test'
import { findStickers, stickerFromId, stickerUrl } from '../stickers'

test('sticker IDs are constrained to supported providers and known shapes or flags',()=>{
 assert.equal(stickerFromId('shape:star')?.category,'shapes')
 assert.equal(stickerFromId('flag:cn-4x3')?.category,'flags')
 assert.equal(stickerFromId('noto:red-heart')?.category,'emoji')
 for(const id of ['https://example.com','shape:unknown','flag:xx-4x3','other:icon','noto:../../x','noto:heart?x=y'])assert.equal(stickerFromId(id),undefined)
 assert.equal(stickerUrl('noto:red-heart'),'https://api.iconify.design/noto/red-heart.svg?width=200&height=200')
 assert.equal(stickerUrl('shape:star'),undefined)
})
test('sticker browsing and search keep category restrictions',async()=>{
 assert.equal((await findStickers('shapes','star'))[0].id,'shape:star')
 assert.equal((await findStickers('flags','china'))[0].id,'flag:cn-4x3')
 const original=globalThis.fetch
 try {globalThis.fetch=async (url)=>{assert.match(String(url),/prefixes=noto/);return new Response(JSON.stringify({icons:['noto:red-heart','mdi:heart','javascript:alert','noto:rocket']}),{status:200,headers:{'content-type':'application/json'}})};assert.deepEqual((await findStickers('emoji','heart')).map(item=>item.id),['noto:red-heart','noto:rocket'])} finally {globalThis.fetch=original}
})

test('stickers have separate timeline tracks and editor metadata never reaches output',async()=>{
 const {insertVisual,moveVisualItem}=await import('../tracks')
 const {visualTracks}=await import('../visual-order')
 const {visibleImage}=await import('../visibility')
 const image={resource_uuid:'image',start:0,end:2,x:.5,y:.5,scale:1,opacity:1}
 const sticker={...image,resource_uuid:'sticker',start:2,end:4,is_sticker:true}
 let state=insertVisual({videos:[],images:[],text:[]},'image',image,'image-track')
 state=insertVisual(state,'image',sticker,'sticker-track')
 assert.deepEqual(visualTracks(state.videos,state.images,state.text).map(track=>track.category),['video','sticker'])
 assert.equal('is_sticker' in visibleImage(state.images[1]),false)
 const moved=moveVisualItem(state,{kind:'image',index:1},{...state.images[1],start:4,end:6},'new','video:image-track')!
 assert.equal(visualTracks(moved.videos,moved.images,moved.text).length,2)
 assert.equal(visualTracks(moved.videos,moved.images,moved.text).find(track=>track.category==='sticker')?.refs.length,1)
})
