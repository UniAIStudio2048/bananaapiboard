export function calculateAudioPointsCost(basePointsCost, text = '') {
  const characterCount = String(text).length
  const multiplier = Math.max(1, Math.ceil(characterCount / 100))
  return (Number(basePointsCost) || 0) * multiplier
}
