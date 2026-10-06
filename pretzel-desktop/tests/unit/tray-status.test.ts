import { describe, it, expect } from 'vitest'
import { deriveTrayState, formatTrayTooltip } from '../../electron/tray-status'

describe('deriveTrayState', () => {
  it('active — proxy running, policy loaded, system proxy on', () => {
    expect(deriveTrayState({ proxyRunning: true, policyAvailable: true, systemProxyActive: true })).toBe('active')
  })

  it('warn — proxy running and system proxy on, but no policy yet (not signed in)', () => {
    expect(deriveTrayState({ proxyRunning: true, policyAvailable: false, systemProxyActive: true })).toBe('warn')
  })

  it('inactive — proxy not running at all', () => {
    expect(deriveTrayState({ proxyRunning: false, policyAvailable: true, systemProxyActive: true })).toBe('inactive')
  })

  it('inactive — proxy running but system proxy not active', () => {
    expect(deriveTrayState({ proxyRunning: true, policyAvailable: true, systemProxyActive: false })).toBe('inactive')
  })

  it('inactive when systemProxyActive is omitted (treated as falsy)', () => {
    expect(deriveTrayState({ proxyRunning: true, policyAvailable: true })).toBe('inactive')
  })
})

describe('formatTrayTooltip', () => {
  it('includes the app name and both status lines', () => {
    const tooltip = formatTrayTooltip({ proxyRunning: true, policyAvailable: true, systemProxyActive: true })
    expect(tooltip).toContain('Pretzel Desktop')
    expect(tooltip).toContain('System proxy: active')
    expect(tooltip).toContain('Policy: active')
  })

  it('reflects inactive system proxy', () => {
    const tooltip = formatTrayTooltip({ proxyRunning: false, policyAvailable: false, systemProxyActive: false })
    expect(tooltip).toContain('System proxy: inactive')
    expect(tooltip).toContain('Policy: not loaded')
  })
})

describe('formatTrayTooltip - failed policy sync', () => {
  it("says the server can't be reached instead of telling the user to sign in", () => {
    const text = formatTrayTooltip({ proxyRunning: true, policyAvailable: false, systemProxyActive: true, syncIssue: 'unreachable' })
    expect(text).toContain("can't reach server")
    expect(text).not.toContain('sign in')
  })

  it('says the policy was unreadable', () => {
    expect(formatTrayTooltip({ proxyRunning: true, policyAvailable: false, systemProxyActive: true, syncIssue: 'invalid' }))
      .toContain('unreadable')
  })

  it('ignores a sync issue once a policy is loaded', () => {
    expect(formatTrayTooltip({ proxyRunning: true, policyAvailable: true, systemProxyActive: true, syncIssue: 'unreachable' }))
      .toContain('Policy: active')
  })
})
