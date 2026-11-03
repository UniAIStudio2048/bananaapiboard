import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const modalStack: HTMLDivElement[] = []

export function MediaButton({ variant, children, className = '', ...props }: any) {
  return <button type="button" className={`rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10 focus-visible:outline focus-visible:outline-2 disabled:opacity-40 ${variant === 'primary' ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : ''} ${className}`} {...props}>{children}</button>
}

export function MediaModal({ open, title, children, onCancel, closable = true, className = '', width, zIndex = 10000 }: any) {
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  useEffect(() => {
    if (!open || !root.current) return
    const element = root.current
    modalStack.push(element)
    const previous = document.activeElement as HTMLElement
    const key = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== element) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel.current?.() }
      if (event.key === 'Tab' && root.current) {
        const items = [...root.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length)
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    root.current?.focus()
    document.addEventListener('keydown', key, true)
    return () => { modalStack.splice(modalStack.indexOf(element), 1); document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus() }
  }, [open])
  if (!open) return null
  const full = width === '100vw'
  return createPortal(<div className="banana-video-editor fixed inset-0 flex items-center justify-center bg-black/65" style={{ zIndex }} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <div ref={root} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : '视频剪辑'} tabIndex={-1} className={`${className} ${full ? 'h-dvh w-screen' : 'max-h-[95dvh] overflow-auto rounded-xl border border-white/15 p-5'} bg-[#0d0d0d] text-zinc-100 outline-none`} style={{ width }}>
      {title && <div className="mb-3 flex items-center justify-between text-sm font-medium">{title}{closable && <button type="button" aria-label="关闭" onClick={onCancel}><X size={18} /></button>}</div>}
      <div className={`flowx-media-ant-modal-container ${full ? 'h-full' : ''}`}><div className={`flowx-media-ant-modal-body ant-modal-body ${full ? 'h-full' : ''}`}>{children}</div></div>
    </div>
  </div>, document.body)
}

export function MediaPopover({ open, onOpenChange, content, children, trigger = 'click', placement = 'bottomRight' }: any) {
  const [local, setLocal] = useState(false)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const shown = open ?? local
  const set = onOpenChange ?? setLocal
  const root = useRef<HTMLSpanElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const contextMenu = trigger === 'contextMenu'
  useEffect(() => {
    if (!shown || !popup.current) return
    const element = popup.current
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, anchor.x - (!contextMenu && placement === 'bottomRight' ? element.offsetWidth : 0)))}px`
    element.style.top = `${Math.max(8, Math.min(window.innerHeight - element.offsetHeight - 8, anchor.y))}px`
    modalStack.push(element)
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) set(false) }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modalStack.at(-1) === element) { event.preventDefault(); event.stopImmediatePropagation(); set(false) }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key, true)
    return () => { modalStack.splice(modalStack.indexOf(element), 1); document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key, true) }
  }, [shown, anchor.x, anchor.y, placement])
  const position = (event: any) => {
    const rect = (event.target.closest?.('button') || event.currentTarget).getBoundingClientRect()
    setAnchor({ x: placement === 'bottomLeft' ? rect.left : rect.right, y: rect.bottom + 4 })
  }
  return <span ref={root} className={contextMenu ? 'contents' : 'relative inline-flex'} onClick={event => { event.stopPropagation(); if (contextMenu && root.current?.contains(event.target as Node)) position(event) }}>
    {React.cloneElement(children, {
      onClick: (event: any) => { children.props.onClick?.(event); if (!contextMenu) { position(event); set(!shown) } },
      onContextMenu: (event: any) => { children.props.onContextMenu?.(event); if (contextMenu) { event.preventDefault(); event.stopPropagation(); setAnchor({ x: event.clientX, y: event.clientY }); set(true) } }
    })}
    {shown && createPortal(<div ref={popup} data-editor-popover className="banana-video-editor fixed z-[10200] max-h-[70vh] overflow-auto rounded-lg border border-white/15 bg-zinc-900 p-1 text-zinc-100 shadow-lg" style={{ left: anchor.x, top: anchor.y }} onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>{content}</div>, document.body)}
  </span>
}
