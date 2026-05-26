interface Props {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: number
}

export function SplitPane({ left, right, leftWidth = 260 }: Props) {
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div style={{ width: leftWidth, minWidth: leftWidth, display: 'flex', flexDirection: 'column',
                    borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
        {left}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>{right}</div>
    </div>
  )
}
