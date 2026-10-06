import { useState, useRef, type KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend:   (message: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    ref.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const canSend = !disabled && !!value.trim()

  return (
    <div style={{
      padding: '14px 24px 18px', display: 'flex', flexDirection: 'column', gap: 10,
      background: 'var(--surface)',
    }}>
      <div style={{
        border: '1.5px solid var(--ink)', borderRadius: 'var(--r)',
        padding: '10px 10px 10px 16px', display: 'flex', alignItems: 'flex-end', gap: 10,
      }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Ask me to create, update, or delete rules and subjects…"
          aria-label="Message the assistant"
          rows={2}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 15, color: 'var(--ink)', lineHeight: 1.5, padding: '2px 0',
            resize: 'none', fontFamily: 'inherit',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        <button
          onClick={submit}
          disabled={!canSend}
          title="Send (Enter)"
          style={{
            background: canSend ? 'var(--btn-bg)' : 'var(--fill)',
            color: canSend ? 'var(--btn-fg)' : 'var(--muted)',
            border: 'none', borderRadius: 'var(--r-btn)', padding: '8px 16px',
            fontSize: 14, fontWeight: 500, flexShrink: 0,
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        AI can make mistakes. Every change waits for your review · Enter to send, Shift+Enter for a new line
      </div>
    </div>
  )
}
