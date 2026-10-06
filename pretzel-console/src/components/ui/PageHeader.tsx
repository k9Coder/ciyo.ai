interface Props {
  title: string
  action?: React.ReactNode
}

export function PageHeader({ title, action }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--ink)', margin: 0 }}>{title}</h1>
      {action}
    </div>
  )
}
