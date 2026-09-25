interface ActionItemProps {
  action: Record<string, unknown>
}

type Tone = 'create' | 'change' | 'delete'

// Diff card: kind pill (Create / Change / Delete) + area, then the fields being changed.
const OP_LABEL: Record<string, { tone: Tone; label: string; area: string }> = {
  create_rule:    { tone: 'create', label: '+ Create rule',    area: 'Rule' },
  update_rule:    { tone: 'change', label: '~ Update rule',    area: 'Rule' },
  delete_rule:    { tone: 'delete', label: '- Delete rule',    area: 'Rule' },
  create_subject: { tone: 'create', label: '+ Create subject', area: 'Policy' },
  update_subject: { tone: 'change', label: '~ Update subject', area: 'Policy' },
  delete_subject: { tone: 'delete', label: '- Delete subject', area: 'Policy' },
}

const TONE: Record<Tone, { bg: string; fg: string }> = {
  create: { bg: 'var(--brand-soft)', fg: 'var(--brand)' },
  change: { bg: 'var(--warn-fill)',  fg: 'var(--warn)' },
  delete: { bg: 'var(--block-fill)', fg: 'var(--block)' },
}

export function ActionItem({ action }: ActionItemProps) {
  const op     = action.op as string
  const meta   = OP_LABEL[op] ?? { tone: 'change' as Tone, label: op, area: '' }
  const colors = TONE[meta.tone]
  const fields = Object.entries(action).filter(([k]) => k !== 'op')

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-sm)', padding: '13px 14px', marginBottom: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 12, fontWeight: 500, padding: '2px 9px', borderRadius: 'var(--r-btn)',
          background: colors.bg, color: colors.fg,
        }}>{meta.label}</span>
        {meta.area && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{meta.area}</span>}
      </div>
      <div>
        {fields.map(([key, value]) => (
          <div key={key} style={{ fontSize: 13, fontFamily: 'var(--mono)', marginBottom: 2, overflowWrap: 'anywhere' }}>
            <span style={{ color: 'var(--ink)' }}>{key}:</span>{' '}
            <span style={{ color: 'var(--muted)' }}>
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
