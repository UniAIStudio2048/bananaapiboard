import { shallowRef } from 'vue'

// Ephemeral UI intent only. Orders, payment attempts and receipts live in MySQL.
export const checkoutRequest = shallowRef(null)
export function openCheckout(input, title = '', existingId = null) {
  checkoutRequest.value?.resolve(null)
  return new Promise(resolve => { checkoutRequest.value = { input, title, existingId, resolve } })
}
export function closeCheckout(result = null) {
  const request = checkoutRequest.value
  checkoutRequest.value = null
  request?.resolve(result)
}
