import { describe, it, expect, afterEach } from 'vitest'
import { buildSystemPrompt, type TenantSnapshot } from '../src/assistant/prompt.js'
import type { Member } from '../src/db/schema.js'

function member(id: string, email: string): Member {
  return {
    id,
    tenantId: 'tenant-1',
    userId: null,
    email,
    displayName: null,
    role: 'member',
    adminDivisionId: null,
    createdAt: new Date(),
  }
}

const snapshot: TenantSnapshot = {
  divisions: [],
  teams: [],
  subjects: [],
  rules: [],
  members: [
    member('11111111-2222-3333-4444-555555555555', 'alice@example.com'),
    member('66666666-7777-8888-9999-000000000000', 'bob@corp.io'),
  ],
}

const original = process.env.ASSISTANT_SEND_PII
afterEach(() => {
  if (original === undefined) delete process.env.ASSISTANT_SEND_PII
  else process.env.ASSISTANT_SEND_PII = original
})

describe('system prompt PII pseudonymization', () => {
  it('contains no member emails by default (redacted)', () => {
    delete process.env.ASSISTANT_SEND_PII
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).not.toContain('alice@example.com')
    expect(prompt).not.toContain('bob@corp.io')
    // No raw email addresses at all in the members section.
    expect(prompt).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    // Stable opaque labels present instead, with ids intact for action references.
    expect(prompt).toContain('member-11111111')
    expect(prompt).toContain('11111111-2222-3333-4444-555555555555')
  })

  it('includes real emails when ASSISTANT_SEND_PII=true (escape hatch)', () => {
    process.env.ASSISTANT_SEND_PII = 'true'
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('alice@example.com')
    expect(prompt).toContain('bob@corp.io')
  })
})
