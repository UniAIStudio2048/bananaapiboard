export interface RulerTick { time: number; label: string }

// Labelled steps stay on whole-second boundaries so frame labels never drift across seconds.
const frameSteps = [1, 2, 5, 10, 15]
const secondSteps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

export function rulerStep(pixelsPerSecond: number, fps: number, minSpacing = 72) {
 for (const frames of frameSteps) if (frames < fps && fps % frames === 0 && frames / fps * pixelsPerSecond >= minSpacing) return frames / fps
 return secondSteps.find(seconds => seconds * pixelsPerSecond >= minSpacing) ?? 600
}

export function rulerLabel(time: number, fps: number) {
 const frame = Math.round(time * fps), rest = frame % fps
 if (rest) return `${rest}f`
 const seconds = Math.round(frame / fps)
 return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function rulerTicks(extent: number, pixelsPerSecond: number, fps: number): RulerTick[] {
 const step = rulerStep(pixelsPerSecond, fps), count = Math.floor(Math.max(0, extent) / step + 1e-6)
 return Array.from({ length: count + 1 }, (_, i) => { const time = i * step; return { time, label: rulerLabel(time, fps) } })
}
