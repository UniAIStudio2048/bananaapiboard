import * as React from 'react'
export function VisibilityIcon({hidden}:{hidden:boolean}) {
 return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
  <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>{hidden&&<path d="M4 4l16 16"/>}
 </svg>
}
