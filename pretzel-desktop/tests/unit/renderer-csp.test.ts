import { describe, it, expect } from 'vitest'
import { RENDERER_CSP, injectCsp, cspPlugin } from '../../renderer-csp'

describe('RENDERER_CSP', () => {
  it('allows no eval, no inline script or style, and no network', () => {
    expect(RENDERER_CSP).not.toContain('unsafe-eval')
    expect(RENDERER_CSP).not.toContain('unsafe-inline')
    expect(RENDERER_CSP).toContain("default-src 'none'")
    expect(RENDERER_CSP).toContain("connect-src 'none'")
    expect(RENDERER_CSP).toContain("script-src 'self'")
  })
})

describe('injectCsp', () => {
  const html = '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n  </head>\n  <body></body>\n</html>'

  it('puts the policy first in <head>, before anything that could load', () => {
    const out = injectCsp(html)
    expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(-1)
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('charset'))
  })

  it('injects exactly one policy', () => {
    expect(injectCsp(html).match(/Content-Security-Policy/g)).toHaveLength(1)
  })
})

describe('cspPlugin', () => {
  it('applies to production builds only (the dev server needs inline scripts for hot reload)', () => {
    expect(cspPlugin().apply).toBe('build')
  })
})
