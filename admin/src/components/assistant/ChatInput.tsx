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
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Describe what you want to change... (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{
            flex: 1, background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)',
            resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
            opacity: disabled ? 0.6 : 1,
          }}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          style={{
            background: 'var(--brand-primary)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600,
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            opacity: disabled || !value.trim() ? 0.6 : 1, flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
