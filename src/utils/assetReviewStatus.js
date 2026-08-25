const SUCCESS_STATUSES = new Set(['active', 'approved', 'success', 'succeeded', 'completed'])
const FAILURE_STATUSES = new Set(['failed', 'fail', 'rejected', 'reject', 'blocked', 'error', 'timeout', 'timed_out', 'expired'])

export function normalizeAssetReviewStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (SUCCESS_STATUSES.has(normalized)) return 'Active'
  if (FAILURE_STATUSES.has(normalized)) return 'Failed'
  return 'Processing'
}
