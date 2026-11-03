import * as React from 'react'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function ExportSection({title,enabled,disabled,onEnabledChange,children}:{title:string;enabled:boolean;disabled:boolean;onEnabledChange(enabled:boolean):void;children:ReactNode}) {
 const [expanded,setExpanded]=useState(true)
 const visible=enabled && expanded
 return <section aria-label={`${title}设置`} className="border-t border-white/10 py-2">
  <div className="flex items-center gap-2">
   <label className="flex items-center gap-2 text-sm"><input aria-label={title} type="checkbox" checked={enabled} disabled={disabled} onChange={event=>onEnabledChange(event.target.checked)} className="accent-[var(--mf-brand)]" />{title}</label>
   <button type="button" aria-label={`${visible?'收起':'展开'}${title}设置`} aria-expanded={visible} disabled={!enabled} onClick={()=>setExpanded(value=>!value)} className="ml-auto rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mf-brand)] disabled:cursor-not-allowed disabled:opacity-50">{visible?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
  </div>
  {visible && <div className="grid gap-3 pt-3">{children}</div>}
 </section>
}
