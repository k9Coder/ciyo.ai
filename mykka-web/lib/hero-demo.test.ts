import { describe, it, expect } from 'vitest'
import { DEMO_SCENARIOS, fullText, sentParts, redactedCount, sentNote } from './hero-demo'

const byKey = (k: string) => DEMO_SCENARIOS.find((s) => s.key === k)!

describe('hero demo scenarios', () => {
  it('has a block, a warn and a credentials scenario', () => {
    expect(DEMO_SCENARIOS.map((s) => s.kind)).toEqual(['block', 'warn', 'block'])
  })

  it('every scenario highlights something and lists what it found', () => {
    for (const s of DEMO_SCENARIOS) {
      expect(s.parts.some((p) => p.hit)).toBe(true)
      expect(s.findings.length).toBeGreaterThan(0)
    }
  })

  it('every block scenario can be redacted; warn scenarios send the text as typed', () => {
    for (const s of DEMO_SCENARIOS) {
      if (s.kind === 'block') expect(s.parts.filter((p) => p.hit).every((p) => p.redact)).toBe(true)
      else expect(redactedCount(s)).toBe(0)
    }
  })

  it('joins the typed prompt from its parts', () => {
    const s = byKey('key')
    expect(fullText(s)).toContain('AWS_SECRET_ACCESS_KEY=')
    expect(fullText(s).startsWith("Why won't this deploy? ")).toBe(true)
  })

  it('replaces hits with their labels when sent, and leaves the rest alone', () => {
    const sent = sentParts(byKey('pii'))
    expect(sent.filter((p) => p.hit).map((p) => p.text)).toEqual(['[SSN]', '[CARD]', '[SSN]'])
    expect(sent.map((p) => p.text).join('')).not.toMatch(/\d{3}-\d{2}-\d{4}/)
    expect(sent[0]?.text).toBe('Rank these clients by how rich they are and make it a fun table: Jane Roe, SSN ')
  })

  it('warn scenarios are sent word for word', () => {
    const s = byKey('priv')
    expect(sentParts(s).map((p) => p.text).join('')).toBe(fullText(s))
    expect(sentParts(s).some((p) => p.hit)).toBe(false)
  })

  it('never leaks a real-looking credential into the published copy', () => {
    // The demo strings are public marketing content: keep them obviously fake.
    expect(fullText(byKey('key'))).not.toMatch(/AKIA[0-9A-Z]{16}/)
  })

  it('words the note under the sent prompt by outcome', () => {
    expect(sentNote(byKey('pii'))).toBe('Sent with 3 details removed')
    expect(sentNote(byKey('key'))).toBe('Sent with 2 details removed')
    expect(sentNote(byKey('priv'))).toBe('Sent after warning · recorded: rule and site')
  })
})
