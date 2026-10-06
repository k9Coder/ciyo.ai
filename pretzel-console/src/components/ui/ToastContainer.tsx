import { useToastStore } from '../../hooks/useToast'
import type { Toast } from '../../hooks/useToast'

// Two separate live regions so screen readers announce toasts at the right
// urgency level (WCAG 4.1.3 Status Messages):
//   - Success toasts → role="status" aria-live="polite"   (non-interrupting)
//   - Error toasts   → role="alert"  aria-live="assertive" (interrupting)
// Both regions are always mounted so screen readers register the live region
// before any announcements arrive.

function LiveRegion({ variant, toasts }: { variant: Toast['variant']; toasts: Toast[] }) {
  const filtered = toasts.filter(t => t.variant === variant)
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="flex flex-col gap-2"
    >
      {filtered.map(t => (
        <div
          key={t.id}
          style={{
            background: variant === 'success' ? 'var(--brand)' : 'var(--block)',
            color: variant === 'success' ? 'var(--btn-fg)' : 'var(--block-fg)',
            borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow)',
            padding: '12px 16px', fontSize: 14, fontWeight: 500, maxWidth: 380,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore()
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <LiveRegion variant="success" toasts={toasts} />
      <LiveRegion variant="error" toasts={toasts} />
    </div>
  )
}
