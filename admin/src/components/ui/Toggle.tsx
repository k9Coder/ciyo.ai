interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', display: 'inline-flex', height: 20, width: 36,
        alignItems: 'center', borderRadius: 10, border: 'none', cursor: 'pointer',
        transition: 'background 0.15s', outline: 'none',
        background: checked ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        display: 'inline-block', height: 14, width: 14, borderRadius: '50%',
        background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'transform 0.15s',
        transform: checked ? 'translateX(18px)' : 'translateX(2px)',
      }} />
    </button>
  )
}
