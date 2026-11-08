import * as React from 'react'
import { createContext, useContext } from 'react'
export interface VideoSource { resource: string; name: string }
export interface AudioSource { resource: string; name: string }
const Context = createContext<any>(undefined)
export const useVideoTools = () => useContext(Context)
export function EditorProvider({ value, children }: any) { return <Context.Provider value={value}>{children}</Context.Provider> }
