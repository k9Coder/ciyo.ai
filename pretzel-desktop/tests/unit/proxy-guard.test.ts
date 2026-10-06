/**
 * Tests for the proxy's host-allowlist and decision gating — the guards that
 * keep us from MITMing unrelated traffic and that decide when to hold a request.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_POLICY } from '@mykka/detect'
import { evaluateRequest, needsDecision, isMonitoredHost, isNoisePath } from '../../electron/proxy'

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

describe('isNoisePath', () => {
  it('excludes chatgpt.com telemetry/analytics endpoints (the /ces/ namespace)', () => {
    expect(isNoisePath('/ces/v1/telemetry/intake?ddsource=browser')).toBe(true)
    expect(isNoisePath('/ces/statsc/flush')).toBe(true)
    expect(isNoisePath('/ces/v1/rgstr?k=client-abc')).toBe(true)
    expect(isNoisePath('/ces/v1/t')).toBe(true)
    expect(isNoisePath('/ces/v1/p')).toBe(true)
    expect(isNoisePath('/ces/v1/i')).toBe(true)
  })

  it('excludes WebRTC voice-mode signaling', () => {
    expect(isNoisePath('/realtime/wm?dcid=0&instant_connect=1')).toBe(true)
  })

  it('excludes anti-abuse fingerprint/heartbeat calls', () => {
    expect(isNoisePath('/backend-api/sentinel/ping')).toBe(true)
    expect(isNoisePath('/backend-api/sentinel/chat-requirements/prepare')).toBe(true)
    expect(isNoisePath('/backend-api/sentinel/chat-requirements/finalize')).toBe(true)
    expect(isNoisePath('/backend-api/sentinel/req')).toBe(true)
  })

  it('excludes speculative pre-send calls that fire on an unsent draft (autocomplete + prepare)', () => {
    // Both confirmed live: neither requires typing or pressing Send — a
    // restored draft on page load alone was enough to fire f/conversation/
    // prepare five times in a row with zero user action.
    expect(isNoisePath('/backend-api/conversation/experimental/generate_autocompletions')).toBe(true)
    expect(isNoisePath('/backend-api/f/conversation/prepare')).toBe(true)
  })

  it('does NOT exclude the actual message-send endpoint (no /prepare suffix)', () => {
    expect(isNoisePath('/backend-api/f/conversation')).toBe(false)
    expect(isNoisePath('/backend-api/conversation/init')).toBe(false)
    expect(isNoisePath('/backend-api/conversation/implicit_message_feedback')).toBe(false)
  })

  it('does not exclude unrelated paths', () => {
    expect(isNoisePath('/backend-api/aip/connectors/list_accessible')).toBe(false)
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
