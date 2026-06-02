import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TicketButton.vue', import.meta.url), 'utf8')

assert.match(source, /const\s+UNREAD_POLL_INTERVAL_MS\s*=\s*120000/)
assert.match(source, /setInterval\(loadUnreadCount,\s*UNREAD_POLL_INTERVAL_MS\)/)
