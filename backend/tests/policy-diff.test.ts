import { describe, it, expect } from 'vitest'
import { diffPolicy } from '../src/policy/diff.js'
import type { PolicyDoc, RulePolicy, SubjectPolicy } from '../src/policy/compiler.js'

function rule(over: Partial<RulePolicy> & { id: string }): RulePolicy {
  return {
    kind: 'keyword', keywords: ['secret'], pattern: null, destinations: [], destinationGroupIds: [],
    action: 'block', message: null, reportLevel: 'medium', ...over,
  }
}

function subject(over: Partial<SubjectPolicy> & { id: string }): SubjectPolicy {
  return { name: 'Finance', divisionId: null, teamId: null, rules: [], ...over }
}

function doc(over: Partial<PolicyDoc> = {}): PolicyDoc {
  return { version: 1, tenantId: 't1', subjects: [], siteConfigs: {}, failMode: 'open', ...over }
}

describe('diffPolicy', () => {
  it('returns no changes when the draft equals the snapshot', () => {
    const d = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1' })] })] })
    expect(diffPolicy(d, structuredClone(d))).toEqual([])
  })

  it('reports everything as added when nothing has been published yet', () => {
    const next = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1' })] })] })
    const changes = diffPolicy(null, next)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ kind: 'added', entity: 'subject', id: 's1', detail: 'New policy with 1 rule' })
  })

  it('does not list individual rules of an added or removed subject', () => {
    const withRules = subject({ id: 's2', name: 'HR', rules: [rule({ id: 'r2' }), rule({ id: 'r3' })] })
    const added = diffPolicy(doc(), doc({ subjects: [withRules] }))
    expect(added.map(c => c.entity)).toEqual(['subject'])
    expect(added[0]?.detail).toBe('New policy with 2 rules')

    const removed = diffPolicy(doc({ subjects: [withRules] }), doc())
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({ kind: 'removed', entity: 'subject', detail: 'Policy and its 2 rules removed' })
  })

  it('detects an added rule in an existing subject', () => {
    const prev = doc({ subjects: [subject({ id: 's1' })] })
    const next = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1', keywords: ['iban', 'swift'] })] })] })
    expect(diffPolicy(prev, next)).toEqual([
      { kind: 'added', entity: 'rule', id: 'r1', title: 'iban, swift', detail: 'Block in Finance' },
    ])
  })

  it('detects a removed rule and prefers the message as the title', () => {
    const prev = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1', message: 'No IBANs' })] })] })
    const next = doc({ subjects: [subject({ id: 's1' })] })
    expect(diffPolicy(prev, next)).toEqual([
      { kind: 'removed', entity: 'rule', id: 'r1', title: 'No IBANs', detail: 'Removed from Finance' },
    ])
  })

  it('names the fields that changed on a rule', () => {
    const prev = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1', action: 'warn' })] })] })
    const next = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1', action: 'block', reportLevel: 'rich' })] })] })
    const [change] = diffPolicy(prev, next)
    expect(change).toMatchObject({ kind: 'changed', entity: 'rule', id: 'r1' })
    expect(change?.detail).toBe('In Finance: action, report level changed')
  })

  it('treats a rule moved between subjects as one change', () => {
    const prev = doc({ subjects: [
      subject({ id: 's1', name: 'Finance', rules: [rule({ id: 'r1' })] }),
      subject({ id: 's2', name: 'Legal' }),
    ] })
    const next = doc({ subjects: [
      subject({ id: 's1', name: 'Finance' }),
      subject({ id: 's2', name: 'Legal', rules: [rule({ id: 'r1' })] }),
    ] })
    const changes = diffPolicy(prev, next)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.detail).toBe('In Legal: Moved from Finance')
  })

  it('detects subject rename and scope change', () => {
    const prev = doc({ subjects: [subject({ id: 's1', name: 'Finance' })] })
    const next = doc({ subjects: [subject({ id: 's1', name: 'Accounts', teamId: 'tm1' })] })
    const [change] = diffPolicy(prev, next)
    expect(change).toMatchObject({ kind: 'changed', entity: 'subject', title: 'Accounts' })
    expect(change?.detail).toBe('renamed from "Finance", scope changed')
  })

  it('treats fields missing from an old snapshot as their defaults', () => {
    const oldRule = { id: 'r1', kind: 'keyword', keywords: ['secret'], pattern: null, destinations: [], action: 'block' } as unknown as RulePolicy
    const prev = doc({ subjects: [subject({ id: 's1', rules: [oldRule] })] })
    const next = doc({ subjects: [subject({ id: 's1', rules: [rule({ id: 'r1', reportLevel: 'none' })] })] })
    expect(diffPolicy(prev, next)).toEqual([])
  })

  it('detects site config add, change and remove', () => {
    const prev = doc({ siteConfigs: {
      'a.com': { inputSelector: '#a', sendButtonSelector: '#b' },
      'gone.com': { inputSelector: '#a', sendButtonSelector: '#b' },
    } })
    const next = doc({ siteConfigs: {
      'a.com': { inputSelector: '#changed', sendButtonSelector: '#b' },
      'new.com': { inputSelector: '#a', sendButtonSelector: '#b' },
    } })
    const changes = diffPolicy(prev, next)
    expect(changes.map(c => `${c.kind}:${c.id}`).sort()).toEqual(['added:new.com', 'changed:a.com', 'removed:gone.com'])
  })

  it('detects a fail mode change', () => {
    const changes = diffPolicy(doc({ failMode: 'open' }), doc({ failMode: 'closed' }))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ entity: 'failMode', detail: 'Now fails closed (blocks)' })
  })

  it('shortens long keyword lists and long patterns in titles', () => {
    const many = rule({ id: 'r1', keywords: ['a', 'b', 'c', 'd', 'e'] })
    const long = rule({ id: 'r2', kind: 'pattern', keywords: null, pattern: 'x'.repeat(100) })
    const changes = diffPolicy(
      doc({ subjects: [subject({ id: 's1' })] }),
      doc({ subjects: [subject({ id: 's1', rules: [many, long] })] }),
    )
    expect(changes[0]?.title).toBe('a, b, c +2 more')
    expect(changes[1]?.title.length).toBeLessThan(60)
  })
})
