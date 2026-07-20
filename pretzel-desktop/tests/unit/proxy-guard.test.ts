/**
 * Tests for the proxy's host-allowlist and decision gating — the guards that
 * keep us from MITMing unrelated traffic and that decide when to hold a request.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_POLICY } from '@mykka/detect'
import { evaluateRequest, needsDecision, isMonitoredHost } from '../../electron/proxy'

describe('isMonitoredHost', () => {
  it('matches the AI hosts we intercept (and their subdomains)', () => {
    expect(isMonitoredHost('chatgpt.com')).toBe(true)
    expect(isMonitoredHost('chat.openai.com')).toBe(true)
    expect(isMonitoredHost('claude.ai')).toBe(true)
    expect(isMonitoredHost('gemini.google.com')).toBe(true)
    expect(isMonitoredHost('www.chatgpt.com')).toBe(true)
  })

  it('does NOT intercept unrelated hosts (no MITM of banking/SSO/etc.)', () => {
    expect(isMonitoredHost('bank.example.com')).toBe(false)
    expect(isMonitoredHost('accounts.google.com')).toBe(false)
    expect(isMonitoredHost('notchatgpt.com.evil.com')).toBe(false)
  })
})

describe('evaluateRequest + needsDecision', () => {
  it('holds a request whose body contains a secret', async () => {
    const body = JSON.stringify({ prompt: 'my key is sk-ABCDEFGHIJKLMNOPQRSTUVWX123456' })
    const result = await evaluateRequest(DEFAULT_POLICY, 'chatgpt.com', body)
    expect(needsDecision(result)).toBe(true)
  })

  it('does not hold a benign request body', async () => {
    const body = JSON.stringify({ prompt: 'what is the capital of France?' })
    const result = await evaluateRequest(DEFAULT_POLICY, 'chatgpt.com', body)
    expect(needsDecision(result)).toBe(false)
  })
})
