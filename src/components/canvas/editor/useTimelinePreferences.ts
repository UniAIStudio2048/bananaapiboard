import { editorStorage } from './storage'
import { useCallback, useSyncExternalStore, type SetStateAction } from 'react'

const namespacePattern=/^media-canvas-preferences:v1:[a-f0-9]{64}$/
const fallback=new Map<string,number>()
const eventName='media-video-timeline-preferences-changed'
const storageKey=(namespace?:string)=>namespace&&namespacePattern.test(namespace)?`media-video-timeline-preferences:v1:${namespace}`:undefined
function read(namespace?:string):number {
 if(typeof window==='undefined')return 1
 const key=storageKey(namespace),memoryKey=key??'anonymous'
 if(fallback.has(memoryKey))return fallback.get(memoryKey)!
 try {const value=key?editorStorage.getItem(key):null;return value&&/^[0-3]$/.test(value)?Number(value):1}catch{return 1}
}
function subscribe(listener:()=>void){window.addEventListener(eventName,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(eventName,listener);window.removeEventListener('storage',listener)}}
export function useTimelinePreferences(namespace?:string) {
 const snapshot=useCallback(()=>read(namespace),[namespace]),value=useSyncExternalStore(subscribe,snapshot,()=>1)
 function set(bit:number,change:SetStateAction<boolean>){const current=read(namespace),old=(current&bit)!==0,enabled=typeof change==='function'?change(old):change,next=enabled?current|bit:current&~bit,key=storageKey(namespace),memoryKey=key??'anonymous';try{if(key){editorStorage.setItem(key,String(next));fallback.delete(memoryKey)}else fallback.set(memoryKey,next)}catch{fallback.set(memoryKey,next)}window.dispatchEvent(new Event(eventName))}
 return {snap:(value&1)!==0,setSnap:(change:SetStateAction<boolean>)=>set(1,change),rippleEditing:(value&2)!==0,setRippleEditing:(change:SetStateAction<boolean>)=>set(2,change)}
}
