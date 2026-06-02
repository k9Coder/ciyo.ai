interface Props {
  title: string
  action?: React.ReactNode
}

export function PageHeader({ title, action }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h1>
      {action}
    </div>
  )
}
