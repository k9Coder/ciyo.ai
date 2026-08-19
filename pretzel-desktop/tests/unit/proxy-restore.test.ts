/**
 * Unit tests for the restore-on-block helpers in proxy.ts: extracting the
 * user's typed text from a blocked request body, injecting the restore
 * script into a monitored-host document response, and recognizing which
 * requests are top-level navigations (vs assets/XHR/SSE, which never get
 * the injection).
 */
import { describe, it, expect } from 'vitest'
import { extractRestoreText, injectRestoreScript, isDocumentRequest } from '../../electron/proxy'

describe('extractRestoreText', () => {
  it('extracts the user message from a chatgpt.com request body', () => {
    const body = JSON.stringify({
      action: 'next',
      messages: [{ author: { role: 'user' }, content: { content_type: 'text', parts: ['my aws key is AKIA...'] } }],
    })
    expect(extractRestoreText('chatgpt.com', body)).toBe('my aws key is AKIA...')
  })

  it('works for chat.openai.com too', () => {
    const body = JSON.stringify({ messages: [{ content: { parts: ['hello'] } }] })
    expect(extractRestoreText('chat.openai.com', body)).toBe('hello')
  })

  it('joins multiple parts', () => {
    const body = JSON.stringify({ messages: [{ content: { parts: ['line one', 'line two'] } }] })
    expect(extractRestoreText('chatgpt.com', body)).toBe('line one\nline two')
  })

  it('returns null for non-JSON bodies', () => {
    expect(extractRestoreText('chatgpt.com', 'not json at all')).toBeNull()
  })

  it('returns null when the shape does not match', () => {
    expect(extractRestoreText('chatgpt.com', JSON.stringify({ foo: 'bar' }))).toBeNull()
  })

  it('returns null for unrecognized hosts (no extractor yet)', () => {
    const body = JSON.stringify({ messages: [{ content: { parts: ['hi'] } }] })
    expect(extractRestoreText('claude.ai', body)).toBeNull()
  })

  it('returns null for empty parts', () => {
    const body = JSON.stringify({ messages: [{ content: { parts: [] } }] })
    expect(extractRestoreText('chatgpt.com', body)).toBeNull()
  })
})

describe('injectRestoreScript', () => {
  it('injects just before </body>', () => {
    const html = '<html><body><p>hi</p></body></html>'
    const out = injectRestoreScript(html)
    expect(out.indexOf('__pretzelRestoreInstalled')).toBeLessThan(out.indexOf('</body>'))
    expect(out).toContain('<p>hi</p>')
  })

  it('appends at the end when there is no </body>', () => {
    const html = '<html><p>no body tag</p>'
    const out = injectRestoreScript(html)
    expect(out.startsWith(html)).toBe(true)
    expect(out).toContain('__pretzelRestoreInstalled')
  })

  it('carries a runtime guard so a page that ends up with two copies (e.g. two document responses) only installs once', () => {
    const html = injectRestoreScript(injectRestoreScript('<body></body>'))
    expect(html).toContain('if (window.__pretzelRestoreInstalled) return;')
    expect(html.split('window.__pretzelRestoreInstalled = true;').length - 1).toBe(2)
  })
})

describe('isDocumentRequest', () => {
  it('true for sec-fetch-dest: document', () => {
    expect(isDocumentRequest({ 'sec-fetch-dest': 'document' })).toBe(true)
  })

  it('false for other sec-fetch-dest values', () => {
    expect(isDocumentRequest({ 'sec-fetch-dest': 'empty' })).toBe(false)
  })

  it('false when header is missing entirely', () => {
    expect(isDocumentRequest({})).toBe(false)
  })
})
