// Default bindings follow CapCut (剪映专业版) so editors can reuse their muscle memory.
export const editorShortcuts = {
 playPause: ['Space'],
 undo: ['Mod', 'Z'],
 redo: ['Shift', 'Mod', 'Z'],
 select: ['A'],
 blade: ['B'],
 split: ['Mod', 'B'],
 trimLeft: ['Q'],
 trimRight: ['W'],
 toggleEnabled: ['V'],
 copy: ['Mod', 'C'],
 cut: ['Mod', 'X'],
 paste: ['Mod', 'V'],
 duplicate: ['Mod', 'D'],
 selectAll: ['Mod', 'A'],
 delete: ['Delete'],
 marker: ['M'],
 snap: ['N'],
 ripple: ['P'],
 zoomIn: ['Mod', '+'],
 zoomOut: ['Mod', '-'],
 zoomFit: ['Shift', 'Z'],
 previousFrame: ['←'],
 nextFrame: ['→'],
 previousEdit: ['↑'],
 nextEdit: ['↓'],
 fullscreen: ['Shift', 'Mod', 'F'],
 export: ['Mod', 'E'],
} as const satisfies Record<string, readonly string[]>

export type EditorShortcut = keyof typeof editorShortcuts

const macSymbols: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Delete: '⌫' }
const keyNames: Record<string, string> = { Space: '空格' }

export function isMacPlatform() {
 return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

export function formatShortcut(keys: readonly string[], mac = isMacPlatform()) {
 if (mac) return keys.map(key => keyNames[key] ?? macSymbols[key] ?? key).join('')
 return keys.map(key => keyNames[key] ?? (key === 'Mod' ? 'Ctrl' : key)).join('+')
}

// Edit points are the shared clip boundaries the up/down keys step between.
export function adjacentEditPoint(points: readonly number[], time: number, direction: 1 | -1, epsilon = 1e-3) {
 const sorted = [...new Set(points)].sort((a, b) => a - b)
 return direction > 0 ? sorted.find(point => point > time + epsilon) : sorted.findLast(point => point < time - epsilon)
}
