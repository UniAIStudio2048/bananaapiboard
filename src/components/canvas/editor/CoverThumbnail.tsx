import * as React from 'react'
/* eslint-disable @next/next/no-img-element -- Signed asset URLs must not be passed to the image optimizer. */
import { useEffect, useState } from 'react'
import { clipDuration, timelineSeek, type EffectLayer, type ImageLayer, type TextLayer, type VideoLayer, type VideoClip, type VideoCover } from './api'
import { CoverFrameView } from './CoverSelector'
import { useStillImage } from './useStillImage'
import { valueAt } from './text-keyframes'

export function CoverThumbnail({ cover, clips, videos, images, text, effects, background, urls, aspect, project, source }: { effects?:EffectLayer[]; background?:string; cover?:VideoCover; clips:VideoClip[]; videos:VideoLayer[]; images:ImageLayer[]; text:TextLayer[]; urls:Record<string,string>; aspect:number; project:string; source(project:string,id:string):Promise<string> }) {
 const time=cover?.frame_time ?? 0, total=clips.reduce((sum,clip)=>sum+clipDuration(clip),0), target=timelineSeek(clips,time), clip=clips[target.index]
 const resource=cover?.resource_uuid ?? (cover?.frame_time !== undefined && time<total ? clip?.resource_uuid : undefined)
 const [resolved,setResolved]=useState<{id:string;url:string}>()
 const currentUrl=resource ? urls[resource] ?? (resolved?.id===resource?resolved.url:undefined) : undefined
 const stillCurrentUrl=useStillImage(cover?.resource_uuid?currentUrl:undefined)
 useEffect(()=>{let live=true;if(resource&&!urls[resource])void source(project,resource).then(url=>{if(live)setResolved({id:resource,url})}).catch(()=>{if(live)setResolved(undefined)});return()=>{live=false}},[resource,urls,source,project])
 if(!cover)return <div className="grid h-56 place-items-center rounded-lg bg-black/50 text-xs text-zinc-500">暂无封面</div>
 if(cover.resource_uuid)return <div className="flex h-56 items-center justify-center rounded-lg bg-black p-2">{currentUrl && <img src={stillCurrentUrl} alt="导出封面预览" className="max-h-full max-w-full object-contain [image-orientation:none]"/>}</div>
 const base=clip?.transform ?? {x:0,y:0,scale:1,rotation:0,opacity:1,keyframes:undefined}
 const transform={x:valueAt(base.x,base.keyframes?.x,target.sourceTime),y:valueAt(base.y,base.keyframes?.y,target.sourceTime),scale:valueAt(base.scale,base.keyframes?.scale,target.sourceTime),rotation:valueAt(base.rotation,base.keyframes?.rotation,target.sourceTime),opacity:valueAt(base.opacity,base.keyframes?.opacity,target.sourceTime)}
 return <div aria-label="导出封面预览" className="flex h-56 items-center justify-center rounded-lg bg-black p-2"><CoverFrameView mediaType={clip?.media_type} baseBlend={clip?.blend_mode} effects={effects} background={background} baseEffects={clip?.effects} currentUrl={currentUrl} sourceTime={target.sourceTime} transform={transform} aspect={aspect} tail={time>=total} videos={videos} images={images} text={text} urls={urls} time={time}/></div>
}
