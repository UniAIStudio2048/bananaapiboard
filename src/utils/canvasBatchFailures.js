export function findBatchSafetyError(candidates) {
  if (!Array.isArray(candidates)) return null

  for (const candidate of candidates) {
    const error = candidate?.detail || candidate?.safetyError || candidate
    if (error?.code === 'prompt_safety_blocked' || error?.payload?.error === 'prompt_safety_blocked') {
      return error
    }
  }

  return null
}
