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

  it('includes member email in CURRENT STATE', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('alice@corp.com')
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

  // security guardrails
  it('contains SECURITY GUARDRAILS section', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('SECURITY GUARDRAILS')
  })

  it('enforces tenant isolation — no cross-tenant data', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('TENANT ISOLATION')
    expect(prompt).toContain('complete and only dataset')
  })

  it('instructs refusal of prompt injection attempts', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('PROMPT INJECTION')
    expect(prompt).toContain('ignore previous instructions')
  })

  it('instructs scope lock for out-of-scope requests', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('SCOPE LOCK')
  })

  it('instructs system prompt confidentiality', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('SYSTEM PROMPT CONFIDENTIALITY')
  })

  it('instructs data exfiltration guard', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('DATA EXFILTRATION GUARD')
  })

  it('instructs action integrity — no invented IDs or ops', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('ACTION INTEGRITY')
  })
})
