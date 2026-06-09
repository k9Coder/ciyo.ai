/**
 * Tests for writePromptText on ChatGPT, Claude, and Gemini adapters.
 *
 * The core contract: for contenteditable elements (ProseMirror / rich-textarea
 * editors) the adapter MUST use document.execCommand("selectAll") +
 * document.execCommand("insertText", false, text) rather than innerText
 * assignment. Direct innerText mutation does not update the editor's internal
 * state, causing the edit to silently revert on next keypress.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DOM stubs ────────────────────────────────────────────────────────────────

const execCommandMock = vi.fn().mockReturnValue(true)

// Minimal document stub required by the adapters
vi.stubGlobal('document', {
  querySelector: vi.fn().mockReturnValue(null),
  addEventListener: vi.fn(),
  execCommand: execCommandMock,
})

// The test runs in node environment so HTMLTextAreaElement doesn't exist.
// Stub it as a class so `instanceof HTMLTextAreaElement` works correctly.
class FakeHTMLTextAreaElement {
  value: string = ''
  focus = vi.fn()
  dispatchEvent = vi.fn()
}
vi.stubGlobal('HTMLTextAreaElement', FakeHTMLTextAreaElement)

// chrome is not needed by writePromptText but the adapter modules import
// constants that may reference it at module load time.
vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn().mockResolvedValue({}) },
    sync: { get: vi.fn().mockResolvedValue({}) },
    managed: { get: vi.fn().mockResolvedValue({}) },
  },
  runtime: { sendMessage: vi.fn() },
})

// ─── Imports (after stubs) ────────────────────────────────────────────────────

const { chatGPTAdapter } = await import('@/content/adapters/chatgpt')
const { claudeAdapter }  = await import('@/content/adapters/claude')
const { geminiAdapter }  = await import('@/content/adapters/gemini')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeContentEditable(text = 'original text'): HTMLElement {
  // Plain object — NOT an instance of HTMLTextAreaElement
  const el = {
    focus: vi.fn(),
    innerText: text,
    dispatchEvent: vi.fn(),
  } as unknown as HTMLElement
  return el
}

function makeTextArea(value = 'original'): HTMLTextAreaElement {
  const el = new FakeHTMLTextAreaElement()
  el.value = value
  return el as unknown as HTMLTextAreaElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── ChatGPT adapter ─────────────────────────────────────────────────────────

describe('chatGPTAdapter.writePromptText', () => {
  it('uses execCommand selectAll + insertText for contenteditable elements', () => {
    const el = makeContentEditable()
    chatGPTAdapter.writePromptText(el, 'redacted text')

    expect(el.focus).toHaveBeenCalledOnce()
    expect(execCommandMock).toHaveBeenCalledWith('selectAll')
    expect(execCommandMock).toHaveBeenCalledWith('insertText', false, 'redacted text')
  })

  it('does NOT call execCommand for plain textarea elements', () => {
    // Install a native-setter spy on the FakeHTMLTextAreaElement prototype.
    // The adapter uses Object.getOwnPropertyDescriptor(..., "value")?.set, so
    // we must define the property with a real setter on the prototype.
    const setterSpy = vi.fn(function(this: FakeHTMLTextAreaElement, v: string) {
      // Assign backing field so .value read still works
      Object.defineProperty(this, '_value', { value: v, writable: true, configurable: true })
    })
    Object.defineProperty(FakeHTMLTextAreaElement.prototype, 'value', {
      set: setterSpy,
      get() { return (this as Record<string, unknown>)['_value'] as string ?? '' },
      configurable: true,
    })

    const el = makeTextArea()
    chatGPTAdapter.writePromptText(el, 'redacted')

    // The textarea path must NOT use execCommand
    expect(execCommandMock).not.toHaveBeenCalled()
    // The native value setter must have been called with the new text
    expect(setterSpy).toHaveBeenCalledWith('redacted')
  })
})

// ─── Claude adapter ──────────────────────────────────────────────────────────

describe('claudeAdapter.writePromptText', () => {
  it('uses execCommand selectAll + insertText (ProseMirror)', () => {
    const el = makeContentEditable()
    claudeAdapter.writePromptText(el, 'sanitised prompt')

    expect(el.focus).toHaveBeenCalledOnce()
    expect(execCommandMock).toHaveBeenCalledWith('selectAll')
    expect(execCommandMock).toHaveBeenCalledWith('insertText', false, 'sanitised prompt')
  })

  it('does not fall back to innerText assignment', () => {
    const el = makeContentEditable('before')
    claudeAdapter.writePromptText(el, 'after')
    // innerText should NOT have been set directly
    expect(el.innerText).toBe('before')
  })
})

// ─── Gemini adapter ──────────────────────────────────────────────────────────

describe('geminiAdapter.writePromptText', () => {
  it('uses execCommand selectAll + insertText (rich-textarea)', () => {
    const el = makeContentEditable()
    geminiAdapter.writePromptText(el, 'clean text')

    expect(el.focus).toHaveBeenCalledOnce()
    expect(execCommandMock).toHaveBeenCalledWith('selectAll')
    expect(execCommandMock).toHaveBeenCalledWith('insertText', false, 'clean text')
  })
})
