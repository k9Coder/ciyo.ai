import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, type TenantSnapshot } from '../src/assistant/prompt.js'

const snapshot: TenantSnapshot = {
  divisions: [{ id: 'd1', name: 'Finance', tenantId: 't1', slug: 'finance', createdAt: new Date() }],
  teams:     [{ id: 'tm1', name: 'Analysts', tenantId: 't1', divisionId: 'd1', slug: 'analysts', createdAt: new Date() }],
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
    const empty: TenantSnapshot = { divisions: [], teams: [], subjects: [], rules: [] }
    const prompt = buildSystemPrompt(empty)
    expect(prompt).toContain('CURRENT STATE')
  })
})
