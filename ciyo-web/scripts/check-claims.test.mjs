import assert from 'node:assert/strict'
import test from 'node:test'
import { scanFiles } from './check-claims.mjs'

test('accepts limitation-aware supported claims', async () => {
  const violations = await scanFiles(['scripts/fixtures/claims-clean.txt'])

  assert.deepEqual(violations, [])
})

test('reports known prohibited unsupported phrases', async () => {
  const violations = await scanFiles(['scripts/fixtures/claims-prohibited.txt'])

  assert.deepEqual(
    violations.map(({ label }) => label),
    [
      'unsupported customer-count claim',
      'unsupported payment-provider claim',
      'unsupported universal AI-site claim',
      'unsupported install-time claim',
      'unsupported GDPR/CCPA claim',
    ],
  )
})

test('does not scan the approval register', async () => {
  const violations = await scanFiles(['CONTENT_CLAIMS.md'])

  assert.deepEqual(violations, [])
})
