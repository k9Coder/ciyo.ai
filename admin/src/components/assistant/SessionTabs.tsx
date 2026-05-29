import type { ChatSession } from '../../types'

interface SessionTabsProps {
  sessions:        ChatSession[]
  activeSessionId: string | null
  onSelect:        (id: string) => void
  onNew:           () => void
}

export function SessionTabs({ sessions, activeSessionId, onSelect, onNew }: SessionTabsProps) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)', padding: '6px 12px',
      background: 'var(--bg-surface)', display: 'flex', gap: 6, overflowX: 'auto',
      alignItems: 'center',
    }}>
      <button
        onClick={onNew}
        style={{
          background: 'none', border: '1px dashed var(--border)', borderRadius: 6,
          padding: '3px 10px', fontSize: 10, color: 'var(--text-muted)',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        + New chat
      </button>
      {sessions.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            background: s.id === activeSessionId ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
            color:      s.id === activeSessionId ? '#fff' : 'var(--text-muted)',
            border:     s.id === activeSessionId ? 'none' : '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px', fontSize: 10,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={s.title}
        >
          {s.title}
        </button>
      ))}
    </div>
  )
}
