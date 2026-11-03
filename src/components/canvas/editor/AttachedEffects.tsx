import * as React from 'react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { TextLayer, VisualEffect } from './api'
import { valueAt } from './keyframe-values'

/** SVG's separate X/Y deviations follow the renderer's size-dependent blur. */
export function AttachedEffects({effects,time,scale=1,text,children}:{effects?:VisualEffect[];time:number;scale?:number;text?:TextLayer;children:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null),id=`flowx-asset-blur-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`
 const [size,setSize]=useState({width:0,height:0})
 useEffect(()=>{const root=ref.current;if(!root)return
  const measure=()=>{const box=root.getBoundingClientRect(),media=root.querySelector('video, img') as HTMLVideoElement|HTMLImageElement|null,w=media instanceof HTMLVideoElement?media.videoWidth:media?.naturalWidth??0,h=media instanceof HTMLVideoElement?media.videoHeight:media?.naturalHeight??0,fit=w&&h?Math.min(box.width/w,box.height/h):0
   let width=fit?w*fit*scale:box.width,height=fit?h*fit*scale:box.height
   if(text){const xs=text.keyframes?.x?.map(point=>point.value)??[],ys=text.keyframes?.y?.map(point=>point.value)??[],minX=xs.length?Math.min(...xs):text.x,maxX=xs.length?Math.max(...xs):text.x,minY=ys.length?Math.min(...ys):text.y,maxY=ys.length?Math.max(...ys):text.y;const side=Math.hypot(Math.max(maxX,1-minX)*box.width,Math.max(maxY,1-minY)*box.height)*2;width=side;height=side}
   setSize(previous=>Math.abs(previous.width-width)<.01&&Math.abs(previous.height-height)<.01?previous:{width,height})}
  measure();const observer=new ResizeObserver(measure);observer.observe(root);root.addEventListener('load',measure,true);root.addEventListener('loadedmetadata',measure,true);return()=>{observer.disconnect();root.removeEventListener('load',measure,true);root.removeEventListener('loadedmetadata',measure,true)}
 },[scale,text])
 const active=(effects??[]).filter(effect=>effect.enabled && valueAt(effect.intensity,effect.keyframes,time)>0)
 return <div ref={ref} className="absolute inset-0"><svg aria-hidden="true" width="0" height="0" className="absolute"><defs><filter id={id} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">{active.map((effect,index)=><feGaussianBlur key={index} stdDeviation={`${valueAt(effect.intensity,effect.keyframes,time)/5*size.width/1920} ${valueAt(effect.intensity,effect.keyframes,time)/5*size.height/1080}`} edgeMode="duplicate" />)}</filter></defs></svg><div className="absolute inset-0" style={active.length?{filter:`url(#${id})`}:undefined}>{children}</div></div>
}
