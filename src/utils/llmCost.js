function toCostNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function calculateLLMCost(modelCost, templateCost, modelFallback = 1, templateFallback = 0) {
  const total = toCostNumber(modelCost, modelFallback) + toCostNumber(templateCost, templateFallback)
  return Math.round((total + Number.EPSILON) * 100) / 100
}
