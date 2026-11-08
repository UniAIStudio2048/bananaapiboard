import { editorStorage } from './storage'
import { stickerCountries } from './sticker-countries'

export type StickerCategory='all'|'logos'|'icons'|'emoji'|'flags'|'shapes'
export interface Sticker {id:string;name:string;category:Exclude<StickerCategory,'all'>}
const groups:Record<'logos'|'icons'|'emoji',string[]>={logos:['simple-icons','logos','skill-icons','devicon','fa-brands'],icons:['mdi','ic','ph','heroicons','lucide','tabler','fe','bi'],emoji:['noto','twemoji','fluent-emoji','fluent-emoji-flat','emojione','openmoji']}
const defaults:Record<'icons'|'logos'|'emoji',string[]>={logos:['logos:google-icon','logos:github-icon','logos:youtube-icon','logos:apple','logos:facebook','logos:twitter','logos:instagram-icon','logos:chrome'],icons:['mdi:home','mdi:star','mdi:heart','mdi:check-circle','mdi:account','mdi:camera','mdi:music','mdi:map-marker','mdi:calendar','mdi:lightning-bolt','mdi:cog','mdi:rocket'],emoji:['noto:grinning-face','noto:smiling-face-with-heart-eyes','noto:fire','noto:rocket','noto:party-popper','noto:clapping-hands','noto:sparkles','noto:red-heart','noto:thumbs-up','noto:eyes','noto:thinking-face','noto:hundred-points']}
const shapes=[['circle','圆形'],['square','方形'],['triangle','三角形'],['star','星形'],['hexagon','六边形'],['diamond','菱形']] as const
const idPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/
const zhNames=typeof Intl.DisplayNames==='function'?new Intl.DisplayNames(['zh-CN'],{type:'region'}):undefined
function categoryOf(id:string):Sticker['category']|undefined {const prefix=id.split(':')[0];if(prefix==='shape')return 'shapes';if(prefix==='flag')return 'flags';return (Object.keys(groups) as (keyof typeof groups)[]).find(group=>groups[group].includes(prefix))}
export function stickerFromId(id:string):Sticker|undefined {
 if(!idPattern.test(id))return undefined
 const category=categoryOf(id),name=id.split(':')[1];if(!category)return undefined
 if(category==='shapes'){const shape=shapes.find(item=>item[0]===name);return shape?{id,name:shape[1],category}:undefined}
 if(category==='flags'){const code=name.replace(/-4x3$/,'').toUpperCase(),country=stickerCountries.find(item=>item[0]===code);return country&&name===`${code.toLowerCase()}-4x3`?{id,name:zhNames?.of(code)??country[1],category}:undefined}
 return {id,name:name.replaceAll('-',' '),category}
}
export function stickerUrl(id:string):string|undefined {if(!stickerFromId(id)||id.startsWith('shape:'))return;const [prefix,name]=id.split(':');return `https://api.iconify.design/${prefix}/${name}.svg?width=200&height=200`}
async function fetchStickerData<T>(url:string,signal:AbortSignal|undefined,read:(response:Response)=>Promise<T>):Promise<T> {
 const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,12000)
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true})
 try {const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});if(!response.ok)throw new Error('E7009');return await read(response)}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
export async function findStickers(category:StickerCategory,query:string,signal?:AbortSignal):Promise<Sticker[]> {
 const term=query.trim().slice(0,100).toLowerCase(),out:Sticker[]=[]
 if(category==='all'||category==='shapes')out.push(...shapes.map(([id])=>stickerFromId(`shape:${id}`)!).filter(item=>!term||item.name.includes(term)||item.id.includes(term)))
 if(category==='all'||category==='flags')out.push(...stickerCountries.map(([code,name])=>({item:stickerFromId(`flag:${code.toLowerCase()}-4x3`)!,search:`${code} ${name}`.toLowerCase()})).filter(value=>!term||value.item.name.includes(term)||value.search.includes(term)).slice(0,category==='all'?12:249).map(value=>value.item))
 const selected=(['icons','logos','emoji'] as const).filter(group=>category==='all'||category===group)
 if(!term){for(const group of selected)for(const id of defaults[group]){const sticker=stickerFromId(id);if(sticker)out.push(sticker)}return out}
 const prefixes=selected.flatMap(group=>groups[group]);if(!prefixes.length)return out
 const params=new URLSearchParams({query:term,limit:'100',prefixes:prefixes.join(',')})
 const body:unknown=await fetchStickerData(`https://api.iconify.design/search?${params}`,signal,response=>response.json()),icons=body&&typeof body==='object'&&'icons' in body?body.icons:undefined
 if(Array.isArray(icons))for(const id of icons.slice(0,100)){if(typeof id!=='string')continue;const sticker=stickerFromId(id);if(sticker&&selected.includes(sticker.category as typeof selected[number]))out.push(sticker)}
 return out
}
/** Decode a provider image in the browser and save only a PNG, never SVG code. */
export async function stickerFile(sticker:Sticker,signal?:AbortSignal):Promise<File> {
 if(!stickerFromId(sticker.id))throw new Error('E7009')
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const context=canvas.getContext('2d');if(!context)throw new Error('E7009')
 if(sticker.category==='shapes'){
  const shape=sticker.id.slice(6);context.fillStyle='#ffffff';context.beginPath()
  if(shape==='circle')context.arc(256,256,220,0,Math.PI*2)
  else if(shape==='square')context.rect(36,36,440,440)
  else {const count=shape==='triangle'?3:shape==='star'?10:shape==='hexagon'?6:4;for(let i=0;i<count;i++){const angle=-Math.PI/2+i*Math.PI*2/count,r=shape==='star'&&i%2?95:220,x=256+Math.cos(angle)*r,y=256+Math.sin(angle)*r;if(i)context.lineTo(x,y);else context.moveTo(x,y)}context.closePath()}
  context.fill()
 }else {
  const url=stickerUrl(sticker.id);if(!url)throw new Error('E7009')
  const blob=await fetchStickerData(url,signal,response=>{if(!response.headers.get('content-type')?.includes('image/svg+xml'))throw new Error('E7009');return response.blob()});if(blob.size>1024*1024)throw new Error('E7009')
  const objectUrl=URL.createObjectURL(blob),image=new Image()
  try {image.src=objectUrl;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('E7009');const fit=Math.min(512/image.naturalWidth,512/image.naturalHeight);context.drawImage(image,(512-image.naturalWidth*fit)/2,(512-image.naturalHeight*fit)/2,image.naturalWidth*fit,image.naturalHeight*fit)}finally{URL.revokeObjectURL(objectUrl)}
 }
 const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('E7009')),'image/png'))
 return new File([png],`sticker-${sticker.id.replace(':','-')}.png`,{type:'image/png'})
}

const namespacePattern=/^media-canvas-preferences:v1:[a-f0-9]{64}$/
const recentKey=(namespace?:string)=>namespace&&namespacePattern.test(namespace)?`media-video-sticker-recent:v1:${namespace}`:undefined
export function readRecentStickers(namespace?:string):Sticker[] {
 try {const key=recentKey(namespace),data=key&&typeof window!=='undefined'?JSON.parse(editorStorage.getItem(key)??'[]'):[];return Array.isArray(data)?data.slice(0,24).map(stickerFromId).filter((item):item is Sticker=>Boolean(item)):[]}catch{return []}
}
export function recordSticker(namespace:string|undefined,sticker:Sticker):void {
 if(!stickerFromId(sticker.id))return
 const key=recentKey(namespace)
 if(key)try{const next=[sticker,...readRecentStickers(namespace).filter(item=>item.id!==sticker.id)].slice(0,24);editorStorage.setItem(key,JSON.stringify(next.map(item=>item.id)))}catch{/* The current editor can still show the item. */}
 window.dispatchEvent(new CustomEvent('media-video-sticker-added',{detail:{namespace,id:sticker.id}}))
}
export function clearRecentStickers(namespace?:string):void {const key=recentKey(namespace);if(key)try{editorStorage.removeItem(key)}catch{/* The current editor can still clear the list. */}}
