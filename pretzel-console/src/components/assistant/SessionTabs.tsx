import type { ChatSession } from '../../types'

interface SessionTabsProps {
  sessions:        ChatSession[]
  activeSessionId: string | null
  onSelect:        (id: string) => void
  onNew:           () => void
}

export function SessionTabs({ sessions, activeSessionId, onSelect, onNew }: SessionTabsProps) {
  if (sessions.length === 0) return null

  return (
    <div style={{
      borderBottom: '1px solid var(--line)',
      padding: '8px 24px',
      display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
      // hide scrollbar but keep scrollability
      scrollbarWidth: 'none',
    }}>
      <button
        onClick={onNew}
        style={{
          background: 'var(--fill)', border: 'none',
          borderRadius: 'var(--r-btn)', padding: '5px 13px',
          fontSize: 14, color: 'var(--ink)',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        + New
      </button>

      {sessions.map(s => {
        const active = s.id === activeSessionId
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={s.title}
            style={{
              background: active ? 'var(--brand-soft)' : 'transparent',
              color:  active ? 'var(--brand)' : 'var(--muted)',
              border: 'none',
              borderRadius: 'var(--r-btn)', padding: '5px 13px',
              fontSize: 14, fontWeight: active ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {s.title}
          </button>
        )
      })}
    </div>
  )
}
