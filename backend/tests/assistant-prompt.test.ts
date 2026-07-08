import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, type TenantSnapshot } from '../src/assistant/prompt.js'

const snapshot: TenantSnapshot = {
  divisions: [{ id: 'd1', name: 'Finance', tenantId: 't1', slug: 'finance', createdAt: new Date() }],
  teams:     [{ id: 'tm1', name: 'Analysts', tenantId: 't1', divisionId: 'd1', slug: 'analysts', createdAt: new Date() }],
  members:   [{ id: 'mem1', tenantId: 't1', email: 'alice@corp.com', displayName: 'Alice', role: 'super_admin',
                userId: null, adminDivisionId: null, createdAt: new Date() }],
  subjects:  [
    { id: 's1', name: 'SSN Policy', description: null, tenantId: 't1', divisionId: null, teamId: 'tm1', active: true, createdAt: new Date() },
    { id: 's2', name: 'Global Rules', description: null, tenantId: 't1', divisionId: null, teamId: null, active: true, createdAt: new Date() },
  ],
  rules: [
    { id: 'r1', subjectId: 's1', tenantId: 't1', kind: 'keyword', keywords: ['SSN'], pattern: null,
      destinations: [], destinationGroupIds: [], action: 'block', message: null,
      active: true, reportLevel: 'none', createdAt: new Date() },
  ],
}

describe('buildSystemPrompt', () => {
  it('includes real IDs from snapshot', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('s1')
    expect(prompt).toContain('r1')
    expect(prompt).toContain('tm1')
  })

  it('resolves team scope for subject', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('team:Analysts')
  })

  it('resolves global scope for subject without team or division', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('global')
  })

  it('includes RESPONSE FORMAT section', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('RESPONSE FORMAT')
    expect(prompt).toContain('"reply"')
    expect(prompt).toContain('"actions"')
  })

  it('works with empty snapshot', () => {
    const empty: TenantSnapshot = { divisions: [], teams: [], subjects: [], rules: [], members: [] }
    const prompt = buildSystemPrompt(empty)
    expect(prompt).toContain('CURRENT STATE')
  })

  it('redacts member email in CURRENT STATE by default (PII stays off third-party LLM prompts)', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).not.toContain('alice@corp.com')
    expect(prompt).toContain('mem1')
  })

  it('documents create_division op', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('create_division')
  })

  it('documents create_member op', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('create_member')
  })

  it('documents assign_member_team op', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('assign_member_team')
  })

  it('works with empty members', () => {
    const empty: TenantSnapshot = { divisions: [], teams: [], subjects: [], rules: [], members: [] }
    const prompt = buildSystemPrompt(empty)
    expect(prompt).toContain('Members: []')
  })

  // security guardrails — each test verifies both the section header AND
  // the actual instruction content, so that deleting instructions while keeping
  // headers would cause test failures
  it('contains SECURITY GUARDRAILS section with unconditional enforcement instruction', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('SECURITY GUARDRAILS')
    expect(prompt).toContain('ENFORCE UNCONDITIONALLY')
  })

  it('enforces tenant isolation — instruction forbids cross-tenant data access', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('TENANT ISOLATION')
    // Verify the actual instruction text is present, not just the header
    expect(prompt).toContain('complete and only dataset')
    expect(prompt).toContain('no knowledge of other tenants')
  })

  it('instructs refusal of prompt injection attempts with specific trigger phrases listed', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('PROMPT INJECTION')
    // Verify actual trigger phrases are listed in the instruction
    expect(prompt).toContain('ignore previous instructions')
    expect(prompt).toContain('forget your rules')
  })

  it('instructs scope lock with explicit out-of-scope refusal response', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('SCOPE LOCK')
    // Verify the actual refusal response text is specified in the instruction
    expect(prompt).toContain('I can only help with managing your organization')
  })

  it('instructs system prompt confidentiality with example trigger phrases', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('SYSTEM PROMPT CONFIDENTIALITY')
    // Verify actual instruction content: trigger phrases that should be refused
    expect(prompt).toContain('what are your instructions?')
  })

  it('instructs data exfiltration guard against bulk-export of member data', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('DATA EXFILTRATION GUARD')
    // Verify the actual instruction describes what constitutes data harvesting
    expect(prompt).toContain('member emails')
  })

  it('instructs action integrity — no invented IDs or op types', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('ACTION INTEGRITY')
    // Verify the actual instruction content: only defined action types, no invented IDs
    expect(prompt).toContain('Never invent new op types')
    expect(prompt).toContain('Never reference IDs that are not present in CURRENT STATE')
  })
})
