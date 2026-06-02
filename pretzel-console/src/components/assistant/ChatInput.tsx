import { useState, useRef, type KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend:   (message: string) => void
  disabled: boolean
}

function SendArrow({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
        stroke={active ? '#fff' : 'var(--text-muted)'}
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue]     = useState('')
  const [focused, setFocused] = useState(false)
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
      padding: '14px 20px 16px',
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-end',
        background: 'var(--bg-base)',
        border: `1.5px solid ${focused ? 'var(--brand-primary)' : 'var(--border)'}`,
        borderRadius: 18,
        padding: '10px 10px 10px 16px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: focused
          ? '0 0 0 3px color-mix(in srgb, var(--brand-primary) 15%, transparent)'
          : 'none',
      }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          placeholder="Ask me to create, update, or delete rules and subjects…"
          rows={2}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65,
            resize: 'none', fontFamily: 'inherit',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        <button
          onClick={submit}
          disabled={!canSend}
          title="Send (Enter)"
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: canSend ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
            cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, box-shadow 0.15s, transform 0.1s',
            transform: canSend ? 'scale(1)' : 'scale(0.9)',
            boxShadow: canSend
              ? '0 2px 10px color-mix(in srgb, var(--brand-primary) 45%, transparent)'
              : 'none',
          }}
        >
          <SendArrow active={canSend} />
        </button>
      </div>
      <div style={{
        marginTop: 7, textAlign: 'center',
        fontSize: 10, color: 'var(--text-muted)', opacity: 0.5,
        letterSpacing: '0.2px',
      }}>
        Enter to send · Shift+Enter for new line
      </div>
    </div>
  )
}
