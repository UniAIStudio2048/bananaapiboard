import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { TextPreset, TextPresetStyle } from './useTextPresets'

export function TextPresets({items,disabled,addDisabled,onAdd,onDragStart,onDragEnd,onRename,onDelete}:{items:TextPreset[];disabled:boolean;addDisabled:boolean;onAdd(style:TextPresetStyle):void;onDragStart(event:DragEvent<HTMLElement>,style:TextPresetStyle):void;onDragEnd():void;onRename(id:string,name:string):void;onDelete(id:string):void}) {
 const defaultStyle:TextPresetStyle={text:translateUi('uiMessages.m77f2438b8552'),x:.5,y:.5,size:100,color:'FFFFFF',opacity:1,font:'sans'}
 return <div className="grid grid-cols-2 gap-2" aria-label={translateUi('uiMessages.m72c9a70f15ce')}>
  <TextPresetCard name={translateUi('uiMessages.m77f2438b8552')} style={defaultStyle} disabled={disabled} addDisabled={addDisabled} onAdd={()=>onAdd(defaultStyle)} onDragStart={event=>onDragStart(event,defaultStyle)} onDragEnd={onDragEnd} />
  {items.map(item=><TextPresetCard key={item.id} name={item.name} style={item.style} disabled={disabled} addDisabled={addDisabled} onAdd={()=>onAdd(item.style)} onDragStart={event=>onDragStart(event,item.style)} onDragEnd={onDragEnd} onRename={name=>onRename(item.id,name)} onDelete={()=>onDelete(item.id)} />)}
 </div>
}
function TextPresetCard({name,style,disabled,addDisabled,onAdd,onDragStart,onDragEnd,onRename,onDelete}:{name:string;style:TextPresetStyle;disabled:boolean;addDisabled:boolean;onAdd():void;onDragStart(event:DragEvent<HTMLElement>):void;onDragEnd():void;onRename?(name:string):void;onDelete?():void}) {
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name),input=useRef<HTMLInputElement>(null),finished=useRef(false)
 useEffect(()=>{if(editing){input.current?.focus();input.current?.select()}},[editing])
 const commit=()=>{if(finished.current)return;finished.current=true;const value=draft.trim();if(value && value!==name)onRename?.(value);else setDraft(name);setEditing(false)}
 const cancel=()=>{finished.current=true;setDraft(name);setEditing(false)}
 return <div className="group relative min-w-0">
  <div draggable={!disabled&&!addDisabled&&!editing} onDragStart={onDragStart} onDragEnd={onDragEnd} className="relative flex h-20 cursor-grab items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[var(--mf-brand)]/10 px-2 text-center hover:border-[var(--mf-brand)]">
   <span className="line-clamp-2 break-all text-xs text-zinc-100">{style.text}</span>
   <button type="button" aria-label={name==='默认文本'&&!onDelete?translateUi('uiMessages.m0e9928dcc35e'):translateUi('uiMessages.m2eccb8b36e51', { value1: (name) })} title={translateUi('uiMessages.m7aef3dc3bf7d')} disabled={disabled||addDisabled} onClick={onAdd} className="absolute bottom-1 right-1 rounded bg-zinc-950/80 px-1.5 text-lg leading-5 text-white hover:text-[var(--mf-brand)] disabled:opacity-50">＋</button>
   {onRename&&onDelete&&<div className="absolute right-1 top-1 flex gap-1"><button type="button" aria-label={translateUi('uiMessages.mbbde518dac76', { value1: (name) })} disabled={disabled} onClick={()=>{finished.current=false;setDraft(name);setEditing(true)}} className="rounded bg-zinc-950/80 px-1 text-xs text-white">✎</button><button type="button" aria-label={translateUi('uiMessages.mfb7dce233e0a', { value1: (name) })} disabled={disabled} onClick={onDelete} className="rounded bg-zinc-950/80 px-1 text-xs text-red-300">×</button></div>}
  </div>
  {editing?<div className="mt-1 flex items-center gap-1"><input ref={input} aria-label={translateUi('uiMessages.m96649ca3eaa1')} maxLength={80} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel()}}} className="min-w-0 flex-1 rounded bg-zinc-800 px-1 text-xs text-white"/><button type="button" aria-label={translateUi('uiMessages.ma4ff592de5ef')} onPointerDown={event=>event.preventDefault()} onClick={commit} className="text-xs text-[var(--mf-brand)]">✓</button><button type="button" aria-label={translateUi('uiMessages.mcd92ceeb7313')} onPointerDown={event=>event.preventDefault()} onClick={cancel} className="text-xs text-zinc-300">×</button></div>:<p className="mt-1 truncate text-xs text-zinc-400" title={name}>{name}</p>}
 </div>
}
