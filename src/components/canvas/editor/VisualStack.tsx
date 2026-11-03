import * as React from 'react'
import type { ImageLayer, TextLayer, VideoLayer } from './api'
import { ImageOverlay } from './ImageTrack'
import { TextOverlay } from './TextOverlay'
import { VideoLayerOverlay } from './VideoLayerTrack'
import { orderedVisuals } from './visual-order'

export function VisualStack({videos,images,text,urls,time,playing=false,onDuration}:{videos:VideoLayer[];images:ImageLayer[];text:TextLayer[];urls:Record<string,string>;time:number;playing?:boolean;onDuration?:(id:string,duration:number)=>void}) {
 return <>{orderedVisuals(videos,images,text).map(ref=>ref.kind==='video'?<VideoLayerOverlay key={`video:${ref.index}`} layers={[videos[ref.index]]} urls={urls} time={time} playing={playing} onDuration={onDuration}/>:ref.kind==='image'?<ImageOverlay key={`image:${ref.index}`} layers={[images[ref.index]]} urls={urls} time={time}/>:<TextOverlay key={`text:${ref.index}`} layers={[text[ref.index]]} time={time}/>)}</>
}
