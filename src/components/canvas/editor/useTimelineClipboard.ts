import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ClipboardItem } from './clipboard'

type ClipboardEntry={project:string;items:ClipboardItem[]}
const clipboard=new Map<string,ClipboardEntry>()
const eventName='media-video-clipboard-changed'
const namespacePattern=/^[a-f0-9]{64}$/
let nextEphemeral=0
function subscribe(listener:()=>void){window.addEventListener(eventName,listener);return()=>window.removeEventListener(eventName,listener)}
export function useTimelineClipboard(namespace:string|undefined,project:string) {
 const ephemeral=useRef<{namespace:string|undefined;project:string;key:string}|undefined>(undefined)
 if(!ephemeral.current||ephemeral.current.namespace!==namespace||ephemeral.current.project!==project)ephemeral.current={namespace,project,key:`ephemeral:${++nextEphemeral}`}
 const key=namespace&&namespacePattern.test(namespace)?`account:${namespace}`:ephemeral.current.key
 const snapshot=useCallback(()=>clipboard.get(key),[key]),entry=useSyncExternalStore(subscribe,snapshot,()=>undefined)
 const items=useMemo(()=>entry?.project===project?entry.items:entry?.items.map(item=>({...item,group:`\u0000foreign:${item.group}`,sourceIndex:-1})),[entry,project])
 function copy(value:ClipboardItem[]){if(!value.length)return;clipboard.delete(key);clipboard.set(key,{project,items:structuredClone(value)});while(clipboard.size>16)clipboard.delete(clipboard.keys().next().value!);window.dispatchEvent(new Event(eventName))}
 return {items,sourceProject:entry?.project,copy}
}
