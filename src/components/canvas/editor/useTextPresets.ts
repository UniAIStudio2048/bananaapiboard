import { editorStorage } from './storage'
import { useEffect, useRef, useState } from 'react'
import type { TextLayer } from './api'
import { validTextBackground, validTextKeyframes } from './text-keyframes'
import { validBlendMode } from './blend-mode'

export type TextPresetStyle = Pick<TextLayer,'text'|'font'|'color'|'background'|'x'|'y'|'size'|'scale'|'rotation'|'opacity'|'blend_mode'>
export type TextPreset = {id:string;name:string;style:TextPresetStyle}
const persistentNamespace=/^media-canvas-preferences:v1:[a-f0-9]{64}$/
const keyFor=(namespace?:string)=>namespace && persistentNamespace.test(namespace)?`media-video-text-presets:v1:${namespace}`:undefined
const defaultName='我的预设'

function styleFrom(layer:TextLayer):TextPresetStyle|undefined {
 if(typeof layer.text!=='string'||!layer.text.trim()||new TextEncoder().encode(layer.text).length>4096||layer.text.includes('\0')||!['sans','serif'].includes(layer.font)||typeof layer.color!=='string'||!/^([a-f0-9]{6})$/i.test(layer.color)||![layer.x,layer.y,layer.size,layer.opacity].every(Number.isFinite)||layer.x<0||layer.x>1||layer.y<0||layer.y>1||layer.size<4||layer.size>300||layer.opacity<0||layer.opacity>1||!validTextBackground(layer)||!validTextKeyframes(layer)||!validBlendMode(layer.blend_mode))return undefined
 return {text:layer.text,font:layer.font,color:layer.color,x:layer.x,y:layer.y,size:layer.size,opacity:layer.opacity,...(layer.blend_mode?{blend_mode:layer.blend_mode}:{}),...(layer.scale===undefined?{}:{scale:layer.scale}),...(layer.rotation===undefined?{}:{rotation:layer.rotation}),...(layer.background?{background:{...layer.background}}:{})}
}
function readPresets(raw:string|null):TextPreset[] {
 try {
  const data:unknown=raw?JSON.parse(raw):[];if(!Array.isArray(data))return []
  return data.flatMap(value=>{if(!value||typeof value!=='object'||typeof value.id!=='string'||!value.id||value.id.length>100||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||!value.style||typeof value.style!=='object')return [];const style=styleFrom({...value.style,start:0,end:1} as TextLayer);return style?[{id:value.id,name:value.name,style}]:[]})
 } catch{return []}
}

export function useTextPresets(namespace?:string) {
 const [state,setState]=useState<{namespace?:string;items:TextPreset[]}>({namespace,items:[]})
 const [status,setStatus]=useState('')
 const fallback=useRef(false), key=keyFor(namespace)
 const items=state.namespace===namespace?state.items:[]
 useEffect(()=>{
  fallback.current=false;setStatus('')
  let initial:TextPreset[]=[]
  if(key){try{initial=readPresets(editorStorage.getItem(key))}catch{fallback.current=true}}
  setState({namespace,items:initial})
  const refresh=()=>{if(!key||fallback.current)return;try{setState({namespace,items:readPresets(editorStorage.getItem(key))})}catch{fallback.current=true}}
  const changed=(event:StorageEvent)=>{if(!key||(event.key!==key&&event.key!==null)||fallback.current)return;try{if(event.storageArea&&event.storageArea!==editorStorage)return}catch{return}refresh()}
  window.addEventListener('storage',changed);window.addEventListener('media-video-text-presets-changed',refresh);return()=>{window.removeEventListener('storage',changed);window.removeEventListener('media-video-text-presets-changed',refresh)}
 },[namespace,key])
 function update(change:(items:TextPreset[])=>TextPreset[]) {
  let current=items
  if(key&&!fallback.current){try{current=readPresets(editorStorage.getItem(key))}catch{fallback.current=true}}
  const next=change(current);setState({namespace,items:next})
  if(key&&!fallback.current){try{editorStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event('media-video-text-presets-changed'));setStatus('预设已保存');return}catch{fallback.current=true}}
  setStatus(namespace?'预设仅保存在当前编辑会话':'账号尚未确认，预设仅在当前状态保留')
 }
 function save(layer:TextLayer) {
  const style=styleFrom(layer);if(!style){setStatus('E7009 请检查文字内容和参数');return}
  const id=globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  update(current=>[...current,{id,name:defaultName,style}])
 }
 function rename(id:string,name:string){const trimmed=name.trim();if(!trimmed||trimmed.length>80)return;update(current=>current.map(item=>item.id===id?{...item,name:trimmed}:item))}
 function remove(id:string){update(current=>current.filter(item=>item.id!==id))}
 return {items,status,save,rename,remove}
}
