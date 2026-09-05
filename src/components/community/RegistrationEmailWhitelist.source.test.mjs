import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const sources = {
  loginModal: fs.readFileSync(path.join(srcRoot, 'components/community/LoginModal.vue'), 'utf8'),
  auth: fs.readFileSync(path.join(srcRoot, 'views/Auth.vue'), 'utf8'),
  landing: fs.readFileSync(path.join(srcRoot, 'views/Landing3D.vue'), 'utf8')
}

test('all registration surfaces normalize whitelist suffixes returned with a leading @', () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.match(source, /normalizeEmailWhitelist\(data\.email_whitelist\)/, `${name} should normalize the whitelist response`)
  }
})

test('whitelist email inputs are not gated by the verification-code switch', () => {
  assert.doesNotMatch(
    sources.loginModal,
    /emailConfig(?:\.value)?\.require_email_verification && emailConfig(?:\.value)?\.email_whitelist\.length > 0/
  )
  assert.match(sources.auth, /mode\.value === 'register' && \(emailConfig\.value\.require_email_verification \|\| hasWhitelist\.value\)/)
  assert.doesNotMatch(
    sources.landing,
    /emailConfig(?:\.value)?\.require_email_verification && emailConfig(?:\.value)?\.email_whitelist\.length > 0/
  )
})

test('verification-code controls remain gated by require_email_verification', () => {
  assert.match(sources.loginModal, /mode === 'register' && emailConfig\.require_email_verification/)
  assert.match(sources.auth, /mode === 'register' && emailConfig\.require_email_verification/)
  assert.match(sources.landing, /authMode === 'register' && emailConfig\.require_email_verification/)
})
