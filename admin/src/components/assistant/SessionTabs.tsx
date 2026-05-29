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
      borderBottom: '1px solid var(--border)',
      padding: '8px 16px',
      background: 'var(--bg-surface)',
      display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
      // hide scrollbar but keep scrollability
      scrollbarWidth: 'none',
    }}>
      <button
        onClick={onNew}
        style={{
          background: 'none',
          border: '1px dashed color-mix(in srgb, var(--brand-primary) 35%, transparent)',
          borderRadius: 20, padding: '3px 12px',
          fontSize: 10, fontWeight: 500,
          color: 'var(--brand-primary)',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 4,
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
              background: active
                ? 'color-mix(in srgb, var(--brand-primary) 15%, transparent)'
                : 'transparent',
              color:  active ? 'var(--brand-primary)' : 'var(--text-muted)',
              border: active
                ? '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)'
                : '1px solid transparent',
              borderRadius: 20, padding: '3px 12px',
              fontSize: 10, fontWeight: active ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis',
              transition: 'all 0.15s',
            }}
          >
            {s.title}
          </button>
        )
      })}
    </div>
  )
}
