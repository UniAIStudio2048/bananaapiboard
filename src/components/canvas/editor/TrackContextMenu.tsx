import * as React from 'react'

import { useState, type ReactElement } from 'react'
import { MediaPopover } from './ui'

export interface TrackMenuAction { label:string; onSelect():void; disabled?:boolean; destructive?:boolean }

export function TrackContextMenu({disabled,actions,children}:{disabled:boolean;actions:TrackMenuAction[];children(open:()=>void,isOpen:boolean):ReactElement}) {
 const [open,setOpen]=useState(false)
 const menu=<div role="menu" aria-label="轨道操作" className="grid min-w-36 gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1 text-sm text-zinc-100" onPointerDown={event=>event.stopPropagation()}>{actions.map(action=><button key={action.label} type="button" role="menuitem" disabled={action.disabled||disabled} onClick={()=>{setOpen(false);action.onSelect()}} className={`rounded px-3 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${action.destructive?'text-red-300':''}`}>{action.label}</button>)}</div>
 return <MediaPopover trigger="contextMenu" open={open} onOpenChange={value=>setOpen(!disabled&&value)} content={menu}><div>{children(()=>{if(!disabled)setOpen(value=>!value)},open)}</div></MediaPopover>
}
